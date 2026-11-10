// Checks the ?src= campaign tag is stored (column AP) and that Three Neat Things
// signups are flagged in the notification and told about their six plants.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('scripts/appsscript/Code.gs', 'utf8');

function run(src) {
  const rows = [], mails = [], header = {};
  const sheet = {
    getMaxColumns: () => 42, insertColumnsAfter() {},
    getRange: (r, c) => ({ getValue: () => header[c] || '', setValue: v => { header[c] = v; } }),
    appendRow: r => rows.push(r), getLastRow: () => 1
  };
  const ss = { getSheetByName: () => sheet, getActiveSheet: () => sheet, getUrl: () => 'sheet-url', insertSheet: () => sheet };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    MailApp: { sendEmail: m => mails.push(m) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Utilities: {}, UrlFetchApp: {}, DriveApp: {}, Session: {}, console
  });
  vm.runInContext(code, ctx);
  const out = vm.runInContext('handleEnrolment', ctx)({
    steward_name: 'Test Reader', steward_email: 'reader@example.com', garden_address: '1 Test St, Hawthorn',
    provisional_score_total: 42, provisional_tier: 'Habitat Garden', enrol_src: src
  }, { get: () => null, put() {} });
  return { out, rows, mails, header };
}

const a = run('ThreeNeatThings');
assert.equal(a.header[42], 'enrol_src');
assert.equal(a.rows[0].length, 42);
assert.equal(a.rows[0][41], 'threeneatthings');
const notify = a.mails.find(m => m.to !== 'reader@example.com');
const steward = a.mails.find(m => m.to === 'reader@example.com');
assert.match(notify.subject, /^6 FREE PLANTS \(Three Neat Things\)/);
assert.match(notify.body, /^THREE NEAT THINGS READER/);
assert.match(notify.body, /Source:\s+threeneatthings/);
assert.match(steward.body, /six free indigenous plants are set aside for you/);
assert.match(steward.body, /Warmly,/);

const b = run('');
assert.equal(b.rows[0][41], '');
const n2 = b.mails.find(m => m.to !== 'reader@example.com');
assert.match(n2.subject, /^New self-enrolment:/);
assert.match(n2.body, /Source:\s+\(direct\)/);
assert.doesNotMatch(b.mails.find(m => m.to === 'reader@example.com').body, /free indigenous plants/);

assert.equal(run('=HYPERLINK("x")').rows[0][41], 'hyperlinkx');
console.log('PASS enrol source stored in AP, Three Neat Things signups flagged, steward told about plants, direct signups unchanged');
