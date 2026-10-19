// Dry-runs scripts/appsscript/Plants.gs against an in-memory Sheets shim.
//   node scripts/test_plant_studio.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, 'appsscript/Plants.gs'), 'utf8');

function sheet(name) {
  const rows = [];
  return {
    name, rows,
    appendRow(r) { rows.push(r.slice()); },
    setFrozenRows() {},
    getLastRow() { return rows.length; },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; out.push(Array.from({length: nc}, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j])); } return out; },
        setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); },
        setValue(x) { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; },
      };
    },
    deleteRow(r) { rows.splice(r - 1, 1); },
  };
}
const sheets = {};
let uuid = 0;
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = sheet(n)) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'secret' }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Utilities: { getUuid: () => ('00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0')).replace(/0/g, () => 'abcdef0123456789'[Math.floor(Math.random() * 16)]), formatDate: () => '261019' },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return JSON.parse(this.s); } }), MimeType: { JSON: 1 } },
  JSON, Date, Math, String, Number, Object, Array, RegExp,
};
ctx.jsonResp = o => JSON.parse(JSON.stringify(o));
vm.createContext(ctx);
vm.runInContext(src, ctx);
const studio = p => ctx.handlePlantStudio(Object.assign({ admin_token: 'secret' }, p));

// auth
assert.strictEqual(ctx.handlePlantStudio({ admin_token: 'nope', op: 'list_projects' }).ok, false);

// create + save lines
const made = studio({ op: 'save_project', project: { name: 'Sally — Rose Garden', client_title: 'Your rose garden', internal_notes: 'gate code 1234' } });
assert.ok(made.ok && made.project.project_id && made.project.view_token.length >= 24);
const id = made.project.project_id, tok = made.project.view_token;
let r = studio({ op: 'save_lines', project_id: id, lines: [
  { slug: 'lomandra-longifolia', area: 'Front', qty: 12, size: 'tube' },
  { slug: 'lomandra-longifolia', area: 'Front', qty: 3 },          // duplicate in same area → dropped
  { slug: 'lomandra-longifolia', area: 'Rear', qty: 4 },           // same plant, another area → kept
  { slug: '=HYPERLINK("x")', area: 'Front' },                      // formula injection neutralised
] });
assert.strictEqual(r.count, 3);
assert.ok(sheets['Project Plants'].rows.slice(1).every(row => !/^=/.test(row[1])));

// replace, not append
r = studio({ op: 'save_lines', project_id: id, lines: [{ slug: 'correa-reflexa', area: 'Front', qty: 2 }] });
assert.strictEqual(sheets['Project Plants'].rows.length - 1, 1);

// customer view: only client-facing fields
let v = ctx.handlePlantsView({ t: tok });
assert.ok(v.ok);
assert.deepStrictEqual(Object.keys(v.project).sort(), ['intro', 'title', 'updated_at']);
assert.ok(!JSON.stringify(v).includes('gate code') && !JSON.stringify(v).includes('Sally'));
assert.strictEqual(v.lines[0].slug, 'correa-reflexa');
assert.strictEqual(ctx.handlePlantsView({ t: 'short' }).ok, false);
assert.strictEqual(ctx.handlePlantsView({ t: 'x'.repeat(40) }).ok, false);

// edits: whitelisted fields only, scoped to the project's plants in the view
r = studio({ op: 'save_edits', edits: [
  { slug: 'correa-reflexa', field: 'description', value: 'Bell-flowered shrub.' },
  { slug: 'correa-reflexa', field: 'garden_relation', value: ['x'] },   // not editable
  { slug: 'Bad Slug', field: 'description', value: 'x' },               // bad slug
  { slug: 'banksia-marginata', field: 'common_name', value: 'Silver Banksia' },
] });
assert.strictEqual(r.saved, 2);
v = ctx.handlePlantsView({ t: tok });
assert.deepStrictEqual(Object.keys(v.edits), ['correa-reflexa']);
assert.strictEqual(v.edits['correa-reflexa'].description, 'Bell-flowered shrub.');
const ex = ctx.handlePlantsExportEdits({ admin_token: 'secret' });
assert.strictEqual(ex.edits.length, 2);
assert.strictEqual(ctx.handlePlantsExportEdits({ admin_token: '' }).ok, false);

// rotate kills old link; archive hides it
const rot = studio({ op: 'rotate_token', project_id: id });
assert.strictEqual(ctx.handlePlantsView({ t: tok }).ok, false);
assert.ok(ctx.handlePlantsView({ t: rot.view_token }).ok);
studio({ op: 'save_project', project: { project_id: id, archived: true } });
assert.strictEqual(ctx.handlePlantsView({ t: rot.view_token }).ok, false);
// partial save keeps other fields
const after = studio({ op: 'get_project', project_id: id });
assert.strictEqual(after.project.internal_notes, 'gate code 1234');
assert.strictEqual(after.project.client_title, 'Your rose garden');

// import is idempotent on source
const imp = [{ name: 'Sally (Rose Garden)', source: 'notion:abc', lines: [{ slug: 'rosa-x' }, { slug: 'nepeta-x' }] }];
assert.strictEqual(studio({ op: 'import_projects', projects: imp }).imported, 1);
assert.strictEqual(studio({ op: 'import_projects', projects: imp }).imported, 0);
const list = studio({ op: 'list_projects' }).projects;
assert.strictEqual(list.length, 2);
assert.strictEqual(list.find(p => p.source === 'notion:abc').count, 2);

console.log('plant studio: all checks passed');
