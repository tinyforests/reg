/* ============================================================
   Plant studio — projects, plant selections, customer views, record edits.

   Replaces the Notion Plants / Design Themes workflow. The plant library
   itself is read-only here (data/plant-library.json, generated from
   tinyforests/plants); this file stores what the studio does WITH it:

     Plant Projects   one row per project (a garden, or a bed within one)
     Project Plants   the plants chosen for each project
     Plant Edits      changes to plant records, pulled into tinyforests/plants

   Writes need the ADMIN_TOKEN script property (same as assess.html).
   Customers read one project through its view_token, which reveals only
   the client-facing title, intro and plant list — never the internal name,
   notes, or garden link.

   Routed from Code.gs:
     doGet  action=plants_view&t=TOKEN          (public, token-scoped)
     doGet  action=plants_export_edits&admin_token=  (sync job)
     doPost submission_type='plant_studio', op=...    (admin)

   Shares one global namespace with Code.gs: every name here starts
   with PL_ or _pl.
   ============================================================ */

var PL_PROJECTS = 'Plant Projects';
var PL_LINES    = 'Project Plants';
var PL_EDITS    = 'Plant Edits';

var PL_PROJECT_HEADERS = ['project_id', 'name', 'client_title', 'intro', 'status',
  'view_token', 'garden_id', 'source', 'created_at', 'updated_at', 'archived', 'internal_notes'];
var PL_LINE_HEADERS = ['project_id', 'slug', 'area', 'qty', 'size', 'note', 'position', 'updated_at'];
var PL_EDIT_HEADERS = ['edited_at', 'slug', 'field', 'value_json', 'editor'];

var PL_EDITABLE = {
  botanical_name: 1, common_name: 1, family: 1, australian_native: 1,
  indigenous_vic: 1, life_form: 1, height_raw: 1, conditions: 1,
  flower_colour: 1, bloom_time: 1, landscape_use: 1, edible: 1,
  description: 1, maintenance: 1, image_url: 1, image_credit: 1,
  evcs: 1, plant_density: 1, archived: 1
};

function _plSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function _plRows(sh, width) {
  var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, width).getValues() : [];
}

function _plAdmin(token) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '';
  return !!stored && String(token || '') === stored;
}

function _plStr(v, max) {
  // Same formula-injection guard as safeStr in Code.gs, kept local so this
  // file stands alone.
  var s = String(v == null ? '' : v).trim();
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return max ? s.slice(0, max) : s;
}

function _plToken() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function _plProject(row) {
  var p = {};
  for (var i = 0; i < PL_PROJECT_HEADERS.length; i++) p[PL_PROJECT_HEADERS[i]] = row[i];
  p.archived = p.archived === true || p.archived === 'TRUE';
  return p;
}

function _plLine(row) {
  return {
    slug: String(row[1]), area: String(row[2] || ''), qty: row[3] === '' ? null : Number(row[3]),
    size: String(row[4] || ''), note: String(row[5] || ''), position: Number(row[6]) || 0
  };
}

function _plLinesFor(projectId) {
  var rows = _plRows(_plSheet(PL_LINES, PL_LINE_HEADERS), PL_LINE_HEADERS.length);
  var out = [];
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === projectId) out.push(_plLine(rows[i]));
  out.sort(function (a, b) { return a.position - b.position; });
  return out;
}

/* ---------- public ---------- */

function handlePlantsView(params) {
  var t = String(params.t || '');
  if (t.length < 24) return jsonResp({ok: false, error: 'Not found'});
  var rows = _plRows(_plSheet(PL_PROJECTS, PL_PROJECT_HEADERS), PL_PROJECT_HEADERS.length);
  for (var i = 0; i < rows.length; i++) {
    var p = _plProject(rows[i]);
    if (p.view_token === t && !p.archived) {
      var lines = _plLinesFor(p.project_id).map(function (l) {
        return {slug: l.slug, area: l.area, qty: l.qty, size: l.size, note: l.note};
      });
      var all = _plEditMap(), edits = {};
      for (var k = 0; k < lines.length; k++) if (all[lines[k].slug]) edits[lines[k].slug] = all[lines[k].slug];
      return jsonResp({ok: true, project: {
        title: p.client_title || 'Your planting', intro: p.intro || '',
        updated_at: p.updated_at ? new Date(p.updated_at).toISOString() : ''
      }, lines: lines, edits: edits});
    }
  }
  return jsonResp({ok: false, error: 'Not found'});
}

/* Latest value per slug+field — so record edits show before the next library build. */
function _plEditMap() {
  var rows = _plRows(_plSheet(PL_EDITS, PL_EDIT_HEADERS), PL_EDIT_HEADERS.length);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var slug = String(rows[i][1]), field = String(rows[i][2]);
    if (!PL_EDITABLE[field]) continue;
    var v;
    try { v = JSON.parse(rows[i][3]); } catch (e) { continue; }
    (map[slug] = map[slug] || {})[field] = v;
  }
  return map;
}

function handlePlantsExportEdits(params) {
  if (!_plAdmin(params.admin_token)) return jsonResp({ok: false, error: 'Unauthorized'});
  var rows = _plRows(_plSheet(PL_EDITS, PL_EDIT_HEADERS), PL_EDIT_HEADERS.length);
  var edits = [];
  for (var i = 0; i < rows.length; i++) {
    var v;
    try { v = JSON.parse(rows[i][3]); } catch (e) { continue; }
    edits.push({edited_at: new Date(rows[i][0]).toISOString(), slug: String(rows[i][1]),
                field: String(rows[i][2]), value: v});
  }
  return jsonResp({ok: true, edits: edits});
}

/* ---------- admin ---------- */

function handlePlantStudio(payload) {
  if (!_plAdmin(payload.admin_token)) return jsonResp({ok: false, error: 'Unauthorized'});
  var op = String(payload.op || '');
  if (op === 'list_projects') return jsonResp({ok: true, projects: _plListProjects()});
  if (op === 'get_project')   return _plGetProject(String(payload.project_id || ''));
  if (op === 'list_edits')    return jsonResp({ok: true, edits: _plEditMap()});

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonResp({ok: false, error: 'Busy — try again'});
  try {
    if (op === 'save_project')    return _plSaveProject(payload.project || {});
    if (op === 'save_lines')      return _plSaveLines(String(payload.project_id || ''), payload.lines || []);
    if (op === 'save_edits')      return _plSaveEdits(payload.edits || [], payload.editor);
    if (op === 'rotate_token')    return _plRotateToken(String(payload.project_id || ''));
    if (op === 'import_projects') return _plImport(payload.projects || []);
    return jsonResp({ok: false, error: 'Unknown op'});
  } finally {
    lock.releaseLock();
  }
}

function _plListProjects() {
  var rows = _plRows(_plSheet(PL_PROJECTS, PL_PROJECT_HEADERS), PL_PROJECT_HEADERS.length);
  var counts = {};
  var lr = _plRows(_plSheet(PL_LINES, PL_LINE_HEADERS), 1);
  for (var j = 0; j < lr.length; j++) counts[lr[j][0]] = (counts[lr[j][0]] || 0) + 1;
  return rows.map(function (r) {
    var p = _plProject(r);
    p.count = counts[p.project_id] || 0;
    p.updated_at = p.updated_at ? new Date(p.updated_at).toISOString() : '';
    p.created_at = p.created_at ? new Date(p.created_at).toISOString() : '';
    return p;
  });
}

function _plFind(sh, projectId) {
  var ids = _plRows(sh, 1);
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === projectId) return i + 2;
  return 0;
}

function _plGetProject(projectId) {
  var sh = _plSheet(PL_PROJECTS, PL_PROJECT_HEADERS);
  var row = _plFind(sh, projectId);
  if (!row) return jsonResp({ok: false, error: 'No such project'});
  var p = _plProject(sh.getRange(row, 1, 1, PL_PROJECT_HEADERS.length).getValues()[0]);
  return jsonResp({ok: true, project: p, lines: _plLinesFor(projectId)});
}

function _plSaveProject(p) {
  var sh = _plSheet(PL_PROJECTS, PL_PROJECT_HEADERS);
  var now = new Date();
  var id = _plStr(p.project_id, 40);
  var row = id ? _plFind(sh, id) : 0;
  var cur = row ? _plProject(sh.getRange(row, 1, 1, PL_PROJECT_HEADERS.length).getValues()[0]) : null;
  if (!cur) {
    id = 'PRJ-' + Utilities.formatDate(now, 'Australia/Melbourne', 'yyMMdd') + '-' + _plToken().slice(0, 6);
    cur = {project_id: id, view_token: _plToken(), created_at: now, source: _plStr(p.source, 80)};
  }
  var vals = [
    id,
    _plStr(p.name != null ? p.name : cur.name, 160),
    _plStr(p.client_title != null ? p.client_title : cur.client_title, 160),
    _plStr(p.intro != null ? p.intro : cur.intro, 2000),
    _plStr(p.status != null ? p.status : (cur.status || 'Draft'), 40),
    cur.view_token,
    _plStr(p.garden_id != null ? p.garden_id : cur.garden_id, 60),
    cur.source || '',
    cur.created_at || now,
    now,
    p.archived != null ? !!p.archived : !!cur.archived,
    _plStr(p.internal_notes != null ? p.internal_notes : cur.internal_notes, 4000)
  ];
  if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  else sh.appendRow(vals);
  return jsonResp({ok: true, project: _plProject(vals)});
}

function _plSaveLines(projectId, lines) {
  if (!projectId) return jsonResp({ok: false, error: 'Missing project_id'});
  var psh = _plSheet(PL_PROJECTS, PL_PROJECT_HEADERS);
  var prow = _plFind(psh, projectId);
  if (!prow) return jsonResp({ok: false, error: 'No such project'});
  var sh = _plSheet(PL_LINES, PL_LINE_HEADERS);
  // Replace this project's lines: delete bottom-up, then append.
  var ids = _plRows(sh, 1);
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === projectId) sh.deleteRow(i + 2);
  var now = new Date(), out = [], seen = {};
  for (var j = 0; j < lines.length && j < 500; j++) {
    var l = lines[j] || {};
    var slug = _plStr(l.slug, 120);
    var key = slug + '|' + _plStr(l.area, 80);
    if (!slug || seen[key]) continue;
    seen[key] = 1;
    var q = l.qty === '' || l.qty == null ? '' : Math.max(0, Math.round(Number(l.qty) || 0));
    out.push([projectId, slug, _plStr(l.area, 80), q, _plStr(l.size, 40), _plStr(l.note, 600), out.length + 1, now]);
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, PL_LINE_HEADERS.length).setValues(out);
  psh.getRange(prow, PL_PROJECT_HEADERS.indexOf('updated_at') + 1).setValue(now);
  return jsonResp({ok: true, count: out.length, updated_at: now.toISOString()});
}

function _plSaveEdits(edits, editor) {
  var sh = _plSheet(PL_EDITS, PL_EDIT_HEADERS);
  var now = new Date(), out = [];
  for (var i = 0; i < edits.length && i < 200; i++) {
    var e = edits[i] || {};
    var slug = _plStr(e.slug, 120), field = String(e.field || '');
    if (!slug || !/^[a-z0-9-]+$/.test(slug) || !PL_EDITABLE[field]) continue;
    var v = JSON.stringify(e.value == null ? null : e.value);
    if (v.length > 6000) continue;
    out.push([now, slug, field, v, _plStr(editor || 'studio', 80)]);
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, PL_EDIT_HEADERS.length).setValues(out);
  return jsonResp({ok: true, saved: out.length});
}

function _plRotateToken(projectId) {
  var sh = _plSheet(PL_PROJECTS, PL_PROJECT_HEADERS);
  var row = _plFind(sh, projectId);
  if (!row) return jsonResp({ok: false, error: 'No such project'});
  var t = _plToken();
  sh.getRange(row, PL_PROJECT_HEADERS.indexOf('view_token') + 1).setValue(t);
  return jsonResp({ok: true, view_token: t});
}

/* One-off: bring in migration/notion-projects.json from tinyforests/plants.
   Idempotent on `source` — a theme already imported is skipped. */
function _plImport(projects) {
  var sh = _plSheet(PL_PROJECTS, PL_PROJECT_HEADERS);
  var have = {};
  var rows = _plRows(sh, PL_PROJECT_HEADERS.length);
  for (var i = 0; i < rows.length; i++) if (rows[i][7]) have[rows[i][7]] = 1;
  var lsh = _plSheet(PL_LINES, PL_LINE_HEADERS);
  var now = new Date(), prow = [], lrow = [], made = 0, skipped = 0;
  for (var k = 0; k < projects.length && k < 400; k++) {
    var p = projects[k] || {};
    var src = _plStr(p.source, 80);
    if (src && have[src]) { skipped++; continue; }
    var id = 'PRJ-' + Utilities.formatDate(now, 'Australia/Melbourne', 'yyMMdd') + '-' + _plToken().slice(0, 6);
    prow.push([id, _plStr(p.name, 160), '', '', 'Imported', _plToken(), '', src, now, now, false, '']);
    var lines = p.lines || [];
    for (var j = 0; j < lines.length && j < 500; j++) {
      var slug = _plStr(lines[j].slug, 120);
      if (slug) lrow.push([id, slug, _plStr(lines[j].area, 80), '', '', '', j + 1, now]);
    }
    made++;
  }
  if (prow.length) sh.getRange(sh.getLastRow() + 1, 1, prow.length, PL_PROJECT_HEADERS.length).setValues(prow);
  if (lrow.length) lsh.getRange(lsh.getLastRow() + 1, 1, lrow.length, PL_LINE_HEADERS.length).setValues(lrow);
  return jsonResp({ok: true, imported: made, skipped: skipped, lines: lrow.length});
}
