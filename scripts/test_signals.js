#!/usr/bin/env node
/* Tests for scripts/appsscript/Signals.gs.
   Runs the Apps Script file in Node against the repo's real garden data,
   with mocked Apps Script services and fixture weather / ALA responses.
     node scripts/test_signals.js
*/
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const REPO = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(REPO, 'scripts/appsscript/Signals.gs'), 'utf8');
const LOCS = JSON.parse(fs.readFileSync(path.join(REPO, 'data/garden-locations.json')));
const PILOT = ['ER-AU-VIC-SH-SIR-0001', 'ER-AU-VIC-WHI-VIC-001', 'ER-AU-VIC-CAN-MON-001'];

let failures = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { failures++; console.log('  FAIL: ' + msg); } }
function test(name, fn) { console.log('• ' + name); try { fn(); } catch (e) { failures++; console.log('  THREW: ' + e.stack); } }

/* ---------- fixtures ---------- */
function daily(now, kind) {
  const o = { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], et0_fao_evapotranspiration: [] };
  for (let i = -14; i < 5; i++) {
    const d = new Date(now.getTime() + i * 864e5 + 11 * 36e5);
    o.time.push(d.toISOString().slice(0, 10));
    let mx = 22, mn = 10, r = 1.2, e = 3.2;
    if (kind === 'heat' && i === 1) mx = 37.4;
    if (kind === 'heat-today' && i === 0) mx = 39;
    if (kind === 'frost' && i === 2) mn = 0.4;
    if (kind === 'dry') { r = 0.2; e = 4.5; }
    if (kind === 'rain' && i >= 1 && i <= 3) r = 11;
    o.temperature_2m_max.push(mx); o.temperature_2m_min.push(mn); o.precipitation_sum.push(r); o.et0_fao_evapotranspiration.push(e);
  }
  if (kind === 'dry-missing-rain') { o.et0_fao_evapotranspiration = o.et0_fao_evapotranspiration.map(() => 4.5); delete o.precipitation_sum; }
  if (kind === 'dry-null-rain') { o.et0_fao_evapotranspiration = o.et0_fao_evapotranspiration.map(() => 4.5); o.precipitation_sum = o.precipitation_sum.map(() => null); }
  return o;
}
const GRIIS = ['Allium triquetrum', 'Cirsium vulgare', 'Briza minor', 'Centaurium erythraea', 'Linaria pelisseriana',
  'Moenchia erecta', 'Oxalis articulata', 'Veronica arvensis', 'Acridotheres tristis', 'Apis mellifera',
  'Medicago arabica', 'Limax maximus', 'Pholcus phalangioides', 'Acacia baileyana'];
const ALA = { occurrences: [
  { uuid: 'u1', eventDate: Date.parse('2026-10-20'), scientificName: 'Malurus cyaneus', vernacularName: 'Superb Fairywren', classs: 'Aves', dataResourceName: 'iNaturalist Australia' },
  { uuid: 'u2', eventDate: Date.parse('2026-10-22'), scientificName: 'Malurus cyaneus', vernacularName: 'Superb Fairywren', classs: 'Aves' },
  { uuid: 'u3', eventDate: Date.parse('2026-10-18'), scientificName: 'Acanthorhynchus tenuirostris', vernacularName: 'Eastern Spinebill', classs: 'Aves' },
  { uuid: 'u4', eventDate: Date.parse('2026-10-19'), scientificName: 'Acridotheres tristis', vernacularName: 'Common Myna', classs: 'Aves' },
  { uuid: 'u5', eventDate: Date.parse('2026-10-15'), scientificName: 'Crinia signifera', vernacularName: 'Common Eastern Froglet', classs: 'Amphibia' },
  { uuid: 'u6', eventDate: Date.parse('2026-10-15'), scientificName: 'Acacia mearnsii', vernacularName: 'Black Wattle', classs: 'Magnoliopsida' }] };

/* ---------- Apps Script mocks ---------- */
function env(opts) {
  opts = opts || {};
  let now = new Date(opts.now || '2026-11-02T06:00:00+11:00');            // Monday
  const weatherKind = opts.weather || (() => 'normal');
  const sheets = {}; let sid = 1;
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh._set(this.r + i, this.c + j, x))); return this; }
    getValues() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sh._get(this.r + i, this.c + j))); }
    setValue(x) { this.sh._set(this.r, this.c, x); return this; }
    getValue() { return this.sh._get(this.r, this.c); }
    getSheet() { return this.sh; } getRow() { return this.r; } getColumn() { return this.c; }
    getNumRows() { return this.nr; } getNumColumns() { return this.nc; }
    setFontWeight() { return this; } setDataValidation() { return this; } setWrap() { return this; }
  }
  class Sheet {
    constructor(n) { this.n = n; this.rows = []; this.id = sid++; }
    _set(r, c, x) { (this.rows[r - 1] = this.rows[r - 1] || [])[c - 1] = x; }
    _get(r, c) { const v = (this.rows[r - 1] || [])[c - 1]; return v === undefined ? '' : v; }
    getName() { return this.n; } getLastRow() { return this.rows.length; }
    getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, (r || []).length), 0); }
    setName(n) { delete sheets[this.n]; this.n = n; sheets[n] = this; return this; }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
    setFrozenRows() {} setColumnWidth() {} hideColumns() {} getSheetId() { return this.id; }
  }
  let active = null;
  const ss = { getActiveSheet: () => active && active.sh, getActiveRange: () => active && active.sh.getRange(active.r, 1), getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST' };
  const props = { SIGNALS_LEGACY_OBS: opts.legacy === false ? '' : 'on' }, gmail = [], mail = [], fetched = [], triggers = [], dialogs = [], cache = {};
  const resp = (code, t) => ({ getResponseCode: () => code, getContentText: () => t });
  function fetch(u) {
    u = typeof u === 'string' ? u : u.url; fetched.push(u);
    if (u.startsWith('https://ecologicalregistry.org/')) {
      const p = path.join(REPO, u.slice('https://ecologicalregistry.org/'.length));
      return fs.existsSync(p) ? resp(200, fs.readFileSync(p, 'utf8')) : resp(404, '');
    }
    if (u.includes('open-meteo') && !u.includes('archive-api')) {
      const lat = +u.match(/latitude=([-\d.]+)/)[1];
      const g = LOCS.find(l => Math.abs(l.display_lat - lat) < 0.001);
      return resp(200, JSON.stringify({ daily: daily(now, weatherKind(g && g.garden_id)) }));
    }
    if (u.includes('archive-api.open-meteo.com')) {
      if (opts.archiveDown) return resp(503, '');
      const s0 = u.match(/start_date=([\d-]+)/)[1], e0 = u.match(/end_date=([\d-]+)/)[1];
      const o = { time: [], precipitation_sum: [], temperature_2m_max: [] };
      for (let d = new Date(s0 + 'T00:00:00Z'); d <= new Date(e0 + 'T00:00:00Z'); d = new Date(d.getTime() + 864e5)) {
        const ds = d.toISOString().slice(0, 10), cur = ds >= '2026-09-01', doy = Math.floor(d.getTime() / 864e5);
        o.time.push(ds); o.precipitation_sum.push(cur ? 2.7 : 2.5); o.temperature_2m_max.push((cur ? doy % 9 : doy % 15) === 0 ? 27 : 18);
      }
      return resp(200, JSON.stringify({ daily: o }));
    }
    if (u.includes('lists-ws.ala.org.au')) {
      if (opts.griisDown) return resp(503, '');
      const n = decodeURIComponent(u.split('q=')[1] || '');
      return resp(200, JSON.stringify(GRIIS.indexOf(n) > -1 ? [{ scientificName: n }] : []));
    }
    if (u.includes('biocache') && u.includes('coordinate_uncertainty')) {
      if (opts.alaDown) return resp(503, '');
      if (!opts.seasonFixture) return resp(200, '{"totalRecords":0,"occurrences":[]}');
      const fx = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures', opts.seasonFixture), 'utf8'));
      const start = +((u.match(/startIndex=(\d+)/) || [])[1] || 0);
      return resp(200, JSON.stringify({ totalRecords: fx.totalRecords, occurrences: (opts.extraRecords || []).concat(fx.occurrences).slice(start, start + 100) }));
    }
    if (u.includes('biocache')) return resp(opts.alaDown ? 500 : 200, JSON.stringify(ALA));
    return resp(404, '');
  }
  const RealDate = Date;
  class FD extends RealDate { constructor(...a) { a.length ? super(...a) : super(now.getTime()); } static now() { return now.getTime(); } }
  let lockFree = opts.lockFree !== false, lockHeld = false;
  const hooks = { onSend: null, onFlush: null };
  const fmt = (d, tz, f) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(d).map(x => [x.type, x.value]));
    if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
    if (f === 'M') return p.month;
    if (f === 'yyyy') return p.year;
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  };
  const ctx = {
    console, JSON, Math, Date: FD, NOTIFY_EMAIL: 'hello@lundbech.me',
    UrlFetchApp: { fetch, fetchAll: r => r.map(fetch) },
    HtmlService: { createHtmlOutput: h => { const o = { html: h, setWidth() { return o; }, setHeight() { return o; } }; return o; } },
    SpreadsheetApp: { getUi: () => ({ showModalDialog: (o, title) => dialogs.push({ html: o.html, title }) }), getActiveSpreadsheet: () => ss, flush() { if (hooks.onFlush) { const f = hooks.onFlush; hooks.onFlush = null; f(); } }, newDataValidation: () => ({ requireValueInList() { return this; }, build() { return {}; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => { let mine = false; return {
      tryLock: () => { if (!lockFree || lockHeld) return false; lockHeld = mine = true; return true; },
      releaseLock() { if (mine) { lockHeld = mine = false; } } }; } },
    Logger: { log: () => {} },
    MailApp: { sendEmail: (...a) => mail.push(a) },
    GmailApp: { sendEmail: (...a) => { if (opts.gmailThrows) throw new Error('Service invoked too many times'); gmail.push(a);
                  if (hooks.onSend) { const f = hooks.onSend; hooks.onSend = null; f(); } },
                getAliases: () => opts.aliases || ['hello@ecologicalregistry.org'] },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.account || 'hello@lundbech.me' }) },
    ScriptApp: { getProjectTriggers: () => triggers.map(n => ({ getHandlerFunction: () => n })),
                 deleteTrigger: x => { const i = triggers.indexOf(x.getHandlerFunction()); if (i > -1) triggers.splice(i, 1); },
                 newTrigger: n => { const t = new Proxy({}, { get: (o, k) => k === 'create' ? () => { triggers.push(n); return t; } : () => t }); return t; } },
    Utilities: {
      formatDate: fmt, getUuid: () => crypto.randomUUID(),
      parseDate: (s, tz) => {               // 'yyyy-MM-dd HH:mm' in Melbourne
        const [d, t] = s.split(' '); const guess = new RealDate(d + 'T' + t + ':00Z');
        const off = (new RealDate(guess.toLocaleString('en-US', { timeZone: tz })) - new RealDate(guess.toLocaleString('en-US', { timeZone: 'UTC' })));
        return new RealDate(guess.getTime() - off);
      },
      computeDigest: (_a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }
    }
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  const api = {
    ctx, ss, sheets, props, gmail, mail, fetched, hooks, triggers, dialogs,
    select: (sheetName, r) => { active = { sh: sheets[sheetName], r }; },
    setNow: d => { now = new Date(d); },
    setLock: b => { lockFree = b; },
    pilot: rows => { ctx.installSignals(); if (!opts.draftOnly) props.SIGNALS_SENDING = 'on';
                     const p = sheets['Signals Pilot']; rows.forEach(r => p.rows.push([r[0], r[1], '', ''])); },
    optout: e => sheets['Signals Optout'].rows.push([e, '', '']),
    queue: () => (sheets['Signals Queue'] ? sheets['Signals Queue'].rows.slice(1) : []),
    col: h => ctx.SIG_QUEUE_HEADERS.indexOf(h),
    setCell: (rowIdx, h, v) => { sheets['Signals Queue'].rows[rowIdx + 1][ctx.SIG_QUEUE_HEADERS.indexOf(h)] = v; },
    edit: (rowIdx, h, v) => {
      const old = sheets['Signals Queue'].rows[rowIdx + 1][ctx.SIG_QUEUE_HEADERS.indexOf(h)];
      api.setCell(rowIdx, h, v);
      const sh = sheets['Signals Queue'];
      ctx.onSignalsEdit({ range: sh.getRange(rowIdx + 2, ctx.SIG_QUEUE_HEADERS.indexOf(h) + 1), oldValue: old });
    },
    idx: gid => api.queue().findIndex(r => r[api.col('garden_id')] === gid),
    status: i => api.queue()[i][api.col('status')]
  };
  return api;
}
const pilotRows = [[PILOT[0], 'richard@example.com'], [PILOT[1], 'sara@example.com'], [PILOT[1], 'fede@example.com'], [PILOT[2], 'refuge@example.com']];

/* ---------- tests ---------- */
test('empty pilot list drafts nothing', () => {
  const e = env(); e.ctx.installSignals();
  ok(e.ctx.previewSignalsNow().length === 0, 'expected no drafts');
  ok(!e.fetched.some(u => u.includes('open-meteo')), 'no weather fetched without pilot gardens');
});

test('pilot gardens only; one lead + at most one supporting signal', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows);
  const d = e.ctx.previewSignalsNow();
  ok(d.length === 3, 'one draft per pilot garden, got ' + d.length);
  e.queue().forEach(r => {
    const sig = r[e.col('signals')].split(', ');
    ok(sig.length <= 2 && sig[0] === 'heat', 'heat leads with ≤1 support: ' + sig);
    ok(e.ctx.SIG_ALERTS.indexOf(sig[1]) === -1, 'support is an observation, not a second alert');
  });
  const vic = e.queue().find(r => r[e.col('garden_id')] === PILOT[1]);
  ok(vic[e.col('to')] === 'sara@example.com, fede@example.com', 'recipients from pilot sheet');
});

test('weather copy uses absolute forecast dates and expires before the event', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const r = e.queue()[0];
  ok(/37°C on Tuesday 3 November/.test(r[e.col('body')]), 'absolute date in body');
  ok(/Tue 3 Nov/.test(r[e.col('subject')]), 'absolute date in subject');
  ok(r[e.col('expires_at')] === '2026-11-02T13:00:00.000Z', 'expires at Melbourne midnight starting 3 Nov, got ' + r[e.col('expires_at')]);
});

test('heat forecast for today is not drafted (too late to act)', () => {
  const e = env({ weather: () => 'heat-today' }); e.pilot(pilotRows); e.ctx.runSignals();
  ok(!e.queue().some(r => /heat/.test(r[e.col('signals')])), 'no same-day heat alert');
});

test('missing or null rainfall never becomes a dry-spell claim', () => {
  const e = env(); e.pilot(pilotRows);
  const g = { garden_id: 'x' }, now = new Date('2026-11-02T06:00:00+11:00');
  ['dry-missing-rain', 'dry-null-rain'].forEach(k => {
    const s = e.ctx._sigWeatherSignals(g, daily(now, k), 11, now.toISOString());
    ok(!s.some(x => x.type === 'dry' || x.type === 'rain'), k + ' produced ' + s.map(x => x.type));
  });
  const real = e.ctx._sigWeatherSignals(g, daily(now, 'dry'), 11, now.toISOString()).find(x => x.type === 'dry');
  ok(real, 'a genuine dry fortnight still fires');
  ok(real && /below atmospheric water demand/.test(real.text) && !/drawn back out/.test(real.text), 'ET0 wording is modelled, not a soil claim');
  ok(real && /reference evapotranspiration/.test(real.evidence.note), 'evidence explains ET0');
});

test('evidence kept with each draft (ALA ids/dates/links, weather dates + retrieval time)', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const ev = JSON.parse(e.queue()[0][e.col('evidence')]);
  const heat = ev.signals.find(s => s.type === 'heat').evidence;
  ok(heat.retrieved_at && heat.dates.length === 2 && heat.temperature_2m_max.length === 2, 'weather evidence complete');
  const nb = ev.signals.find(s => s.type === 'nearby');
  ok(nb && nb.evidence.species[0].records[0].id === 'u2' || nb.evidence.species[0].records.some(x => x.url.endsWith('/u1')), 'ALA occurrence ids + links kept');
  ok(nb && nb.evidence.query.includes('biocache'), 'ALA query kept');
  ok(/we'll review it with you for your garden's record/.test(e.queue()[0][e.col('body')]), 'review wording');
  ok(!/Common Myna/.test(e.queue()[0][e.col('body')]), 'introduced species excluded');
});

test('pause wording is in the plain-text body as well as HTML', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const r = e.queue()[0];
  ok(/Reply "pause"/.test(r[e.col('body')]), 'plain text has pause');
  ok(/Reply &quot;pause&quot;|Reply "pause"/.test(r[e.col('html')]), 'html has pause');
});

test('approved row sends exactly once from the alias; second run sends nothing', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.queue().forEach((_, i) => e.setCell(i, 'status', 'APPROVED'));
  ok(e.ctx.sendApprovedSignals() === 3, 'three sent');
  ok(e.ctx.sendApprovedSignals() === 0 && e.gmail.length === 3, 'no duplicates on re-run');
  ok(e.gmail.every(g => g[3].from === 'hello@ecologicalregistry.org' && g[3].replyTo === 'hello@ecologicalregistry.org'), 'alias from set');
  ok(e.gmail[0][3].htmlBody === e.queue()[0][e.col('html')], 'sends the frozen HTML, not a rebuild');
  ok(e.queue().every(r => r[e.col('status')] === 'SENT' && r[e.col('sent_at')]), 'marked SENT');
});

test('primary account omits `from`; no alias means ERROR, not a send from the wrong address', () => {
  const a = env({ account: 'hello@ecologicalregistry.org', aliases: [] }); a.pilot(pilotRows); a.ctx.previewSignalsNow();
  a.setCell(0, 'status', 'APPROVED'); a.ctx.sendApprovedSignals();
  ok(a.gmail.length === 1 && !('from' in a.gmail[0][3]), 'primary: from omitted');
  const b = env({ aliases: [] }); b.pilot(pilotRows); b.ctx.previewSignalsNow();
  b.setCell(0, 'status', 'APPROVED'); b.ctx.sendApprovedSignals();
  ok(b.gmail.length === 0 && b.queue()[0][b.col('status')] === 'ERROR', 'no alias: ERROR');
});

test('expired approval is never sent', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED');
  e.setNow('2026-11-03T09:00:00+11:00');         // the heat day itself
  e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 0 && e.queue()[0][e.col('status')] === 'EXPIRED', 'expired, not sent');
});

test('editing an approved draft regenerates HTML and resets to DRAFT', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const before = e.queue()[0][e.col('content_hash')];
  e.setCell(0, 'status', 'APPROVED');
  e.edit(0, 'body', 'Hi Richard & Jenny,\n\nEdited by hand.\n\nTyson');
  const r = e.queue()[0];
  ok(r[e.col('status')] === 'DRAFT', 'reset to DRAFT');
  ok(r[e.col('content_hash')] !== before && /Edited by hand/.test(r[e.col('html')]), 'html + hash refrozen');
  e.ctx.sendApprovedSignals(); ok(e.gmail.length === 0, 'not sent until re-approved');
  e.setCell(0, 'status', 'APPROVED'); e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 1 && /Edited by hand/.test(e.gmail[0][2]), 're-approved edit sends');
});

test('content changed without the edit trigger is caught at send time', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED'); e.setCell(0, 'subject', 'Something else');   // no onEdit fired
  e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 0 && e.queue()[0][e.col('status')] === 'DRAFT', 'hash mismatch → DRAFT');
});

test('row stuck in SENDING goes to CHECK, never retried; known send reconciles to SENT', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'SENDING'); e.setCell(1, 'status', 'SENDING');
  e.props['sent:' + e.queue()[1][e.col('message_id')]] = '2026-11-02T00:00:00Z';
  e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 0, 'nothing resent');
  ok(e.queue()[0][e.col('status')] === 'CHECK', 'uncertain → CHECK');
  ok(e.queue()[1][e.col('status')] === 'SENT', 'recorded send → SENT');
  e.setCell(2, 'status', 'APPROVED'); e.props['sent:' + e.queue()[2][e.col('message_id')]] = 'x';
  e.ctx.sendApprovedSignals(); ok(e.gmail.length === 0, 'message_id already sent → not sent again');
});

test('a concurrent run that cannot take the lock sends nothing', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED'); e.setLock(false);
  ok(e.ctx.sendApprovedSignals() === 0 && e.gmail.length === 0, 'locked out');
  ok(e.queue()[0][e.col('status')] === 'APPROVED', 'row left for the lock holder');
});

test('opt-out or removal from pilot after approval blocks the send', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const iSir = e.queue().findIndex(r => r[e.col('garden_id')] === PILOT[0]);
  const iVic = e.queue().findIndex(r => r[e.col('garden_id')] === PILOT[1]);
  e.setCell(iSir, 'status', 'APPROVED'); e.setCell(iVic, 'status', 'APPROVED');
  e.optout('richard@example.com');
  e.sheets['Signals Pilot'].rows = e.sheets['Signals Pilot'].rows.filter(r => r[1] !== 'fede@example.com');
  e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 0, 'neither sent');
  ok(e.queue()[iSir][e.col('status')] === 'SKIP' && e.queue()[iVic][e.col('status')] === 'SKIP', 'both SKIP');
  ok(/fede@example.com/.test(e.queue()[iVic][e.col('note')]), 'note names the blocked address');
});

test('Gmail failure marks ERROR and records no send', () => {
  const e = env({ gmailThrows: true }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED'); e.ctx.sendApprovedSignals();
  ok(e.queue()[0][e.col('status')] === 'ERROR' && !Object.keys(e.props).some(k => k.startsWith('sent:')), 'ERROR, no sent record');
});

test('cooldowns: a second same-day run drafts nothing new', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  ok(e.ctx.previewSignalsNow().length === 0, 'no repeats');
});

test('ALA outage drops sightings, other signals still draft', () => {
  const e = env({ weather: () => 'rain', alaDown: true }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  ok(e.queue().every(r => !/nearby/.test(r[e.col('signals')]) && /^rain/.test(r[e.col('signals')])), 'rain only');
});

/* ---------- second review ---------- */
test('edit made while an earlier row is sending wins (row is not sent in its old form)', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.queue().forEach((_, i) => e.setCell(i, 'status', 'APPROVED'));
  const second = 1;
  e.hooks.onSend = () => e.edit(second, 'body', 'Hi,\n\nRewritten while the first email was sending.\n\nTyson');
  e.ctx.sendApprovedSignals();
  ok(e.status(second) === 'DRAFT', 'edited row back to DRAFT, got ' + e.status(second));
  ok(!e.gmail.some(g => g[0] === e.queue()[second][e.col('to')].replace(/, /g, ',')), 'edited row not sent');
  ok(e.gmail.length === 2, 'the other two still sent, got ' + e.gmail.length);
  e.setCell(second, 'status', 'APPROVED'); e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 3 && /Rewritten while/.test(e.gmail[2][2]), 're-approved edit sends the new text');
});

test('content changed between claim and send is caught after the claim', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED');
  e.hooks.onFlush = () => e.setCell(0, 'body', 'Changed right after SENDING was written');
  e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 0 && e.status(0) === 'DRAFT', 'not sent, back to DRAFT');
});

test('editing a SENT row restores it and leaves history intact', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED'); e.ctx.sendApprovedSignals();
  const sentBody = e.queue()[0][e.col('body')];
  e.edit(0, 'body', 'tampered');
  ok(e.queue()[0][e.col('body')] === sentBody && e.status(0) === 'SENT', 'restored + still SENT');
});

test('an expired, unsent heat draft is replaced by a fresh one', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const n0 = e.queue().length;
  e.setNow('2026-11-03T06:00:00+11:00');            // heat continues: forecast now for 4 Nov
  e.ctx.runSignals();
  const fresh = e.queue().slice(n0);
  ok(fresh.length === 3 && fresh.every(r => /^heat/.test(r[e.col('signals')])), 'three fresh heat drafts, got ' + fresh.length);
  ok(fresh.every(r => /4 November/.test(r[e.col('body')])), 'new forecast date');
  ok(e.queue().slice(0, n0).every(r => r[e.col('status')] === 'EXPIRED'), 'old drafts marked EXPIRED');
});

test('a SENT heat note still cools down the next day', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.queue().forEach((_, i) => e.setCell(i, 'status', 'APPROVED')); e.ctx.sendApprovedSignals();
  e.setNow('2026-11-03T06:00:00+11:00'); e.ctx.runSignals();
  ok(e.queue().length === 3, 'no new heat drafts within the cooldown');
});

test('a SKIPped event is not redrafted; a new event is', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.queue().forEach((_, i) => e.setCell(i, 'status', 'SKIP'));
  e.ctx.runSignals();
  ok(e.queue().length === 3, 'same 3 Nov heat event not redrafted');
  e.setNow('2026-11-03T06:00:00+11:00'); e.ctx.runSignals();
  ok(e.queue().length === 6, 'heat on a new date is drafted, got ' + (e.queue().length - 3));
});

test('v1 sheets are archived on reinstall; old approvals never send; nothing runs before reinstall', () => {
  const e = env();
  const v1 = e.ss.insertSheet('Signals Queue');
  v1.rows.push(['created_at', 'garden_id', 'garden_name', 'to', 'signals', 'subject', 'body', 'status', 'sent_at', 'note']);
  v1.rows.push(['2026-10-31', PILOT[0], 'Native Buffer', 'richard@example.com', 'heat', 'old', 'old body', 'APPROVED', '', '']);
  const l1 = e.ss.insertSheet('Signals Log');
  l1.rows.push(['logged_at', 'garden_id', 'signal', 'key']);
  ok(e.ctx.previewSignalsNow().length === 0 && e.ctx.sendApprovedSignals() === 0 && e.gmail.length === 0, 'refuses old layout');
  ok(/installSignals/.test((e.mail[0] || [])[1] || ''), 'tells you to run installSignals');
  e.pilot(pilotRows);                                 // runs installSignals()
  const names = Object.keys(e.sheets);
  const arch = names.find(n => /^Signals Queue \(archived /.test(n));
  ok(arch && names.some(n => /^Signals Log \(archived /.test(n)), 'queue + log archived: ' + names.join(' | '));
  ok(arch && e.sheets[arch].rows[1][7] === 'ARCHIVED', 'old APPROVED → ARCHIVED');
  ok(e.sheets['Signals Queue'].rows[0].join() === e.ctx.SIG_QUEUE_HEADERS.join(), 'fresh queue has new columns');
  e.ctx.previewSignalsNow(); e.queue().forEach((_, i) => e.setCell(i, 'status', 'APPROVED'));
  e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 3 && !e.gmail.some(g => g[1] === 'old'), 'only new-format drafts sent');
});

/* ---------- third review ---------- */
test('a status change during the send claim is respected (SKIP is not sent)', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED');
  e.hooks.onFlush = () => e.setCell(0, 'status', 'SKIP');
  e.ctx.sendApprovedSignals();
  ok(e.gmail.length === 0, 'not sent');
  ok(e.status(0) === 'SKIP', 'stays SKIP, got ' + e.status(0));
  ok(!Object.keys(e.props).some(k => k.startsWith('sent:')), 'no send record');
});

test('sent-message cooldown runs from sent_at, not the draft date', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();   // drafted Mon 2 Nov
  e.queue().forEach((_, i) => { e.setCell(i, 'status', 'APPROVED'); e.setCell(i, 'expires_at', '2026-12-31T00:00:00Z'); });
  e.queue().forEach((_, i) => e.setCell(i, 'content_hash', e.ctx._sigHash(e.queue()[i][e.col('to')], e.queue()[i][e.col('subject')], e.queue()[i][e.col('body')], e.queue()[i][e.col('html')])));
  e.setNow('2026-11-08T06:00:00+11:00'); e.ctx.sendApprovedSignals();                     // sent Sun 8 Nov
  ok(e.gmail.length === 3, 'sent on 8 Nov');
  e.setNow('2026-11-10T06:00:00+11:00'); e.ctx.runSignals();                              // 2 days after send, 8 after draft
  ok(!e.queue().slice(3).some(r => /heat/.test(r[e.col('signals')])), 'heat still cooling 2 days after send');
  e.setNow('2026-11-14T06:00:00+11:00'); e.ctx.runSignals();                              // 6 days after send
  ok(e.queue().slice(3).some(r => /^heat/.test(r[e.col('signals')])), 'heat drafts again once 5 days past sent_at');
});

/* ---------- draft-only trial ---------- */
test('installSignals() is draft-only: no send trigger, and a manual send does nothing', () => {
  const e = env({ draftOnly: true, weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  ok(e.triggers.indexOf('runSignals') > -1 && e.triggers.indexOf('onSignalsEdit') > -1, 'drafting + edit triggers installed');
  ok(e.triggers.indexOf('sendApprovedSignals') === -1, 'no send trigger');
  e.queue().forEach((_, i) => e.setCell(i, 'status', 'APPROVED'));
  ok(e.ctx.sendApprovedSignals() === 0 && e.gmail.length === 0, 'manual send refused');
  ok(e.queue().every(r => r[e.col('status')] === 'APPROVED'), 'approved rows left untouched');
});

test('enableSending() needs the alias; disableSending() stops sends again', () => {
  const a = env({ draftOnly: true, aliases: [] }); a.pilot(pilotRows);
  let threw = false; try { a.ctx.enableSending(); } catch (err) { threw = true; }
  ok(threw && a.triggers.indexOf('sendApprovedSignals') === -1 && a.props.SIGNALS_SENDING === 'off', 'no alias: stays off');
  const e = env({ draftOnly: true }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.ctx.enableSending();
  ok(e.triggers.filter(n => n === 'sendApprovedSignals').length === 1, 'one send trigger');
  e.setCell(0, 'status', 'APPROVED'); ok(e.ctx.sendApprovedSignals() === 1, 'sends when on');
  e.ctx.disableSending(); e.setCell(1, 'status', 'APPROVED');
  ok(e.ctx.sendApprovedSignals() === 0 && e.triggers.indexOf('sendApprovedSignals') === -1, 'off again');
  e.ctx.installSignals();
  ok(e.props.SIGNALS_SENDING === 'off' && e.triggers.indexOf('sendApprovedSignals') === -1, 'reinstall resets to draft-only');
});

/* ---------- read-only preview ---------- */
test('previewSignalEmail shows the stored HTML and changes nothing', () => {
  const e = env({ draftOnly: true }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const before = JSON.stringify(e.sheets['Signals Queue'].rows), props = JSON.stringify(e.props);
  const r = e.queue()[1];
  e.ctx.previewSignalEmail(r[e.col('message_id')]);
  ok(e.dialogs.length === 1 && e.dialogs[0].html.indexOf(r[e.col('html')]) > -1, 'dialog contains the stored html');
  ok(/PREVIEW ONLY/.test(e.dialogs[0].html) && e.dialogs[0].html.indexOf(r[e.col('subject')].replace(/'/g, '&#39;').split(':')[0]) > -1, 'labelled with subject');
  ok(JSON.stringify(e.sheets['Signals Queue'].rows) === before && JSON.stringify(e.props) === props, 'queue + properties unchanged');
  ok(e.gmail.length === 0 && e.mail.length <= 1, 'nothing sent');
  let threw = false; try { e.ctx.previewSignalEmail('nope'); } catch (err) { threw = true; }
  ok(threw, 'unknown id throws');
});

test('previewSelectedSignal uses the selected row; flags HTML out of sync', () => {
  const e = env({ draftOnly: true }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  e.select('Signals Queue', 3);
  e.ctx.previewSelectedSignal();
  ok(e.dialogs[0].title === 'Signal preview: ' + e.queue()[1][e.col('garden_name')], 'row 3 = second draft');
  e.setCell(1, 'body', 'changed without the trigger');
  e.ctx.previewSelectedSignal();
  ok(/does not match/.test(e.dialogs[1].html), 'stale html flagged');
  e.select('Signals Pilot', 2);
  let threw = false; try { e.ctx.previewSelectedSignal(); } catch (err) { threw = true; }
  ok(threw, 'wrong sheet refused');
});

/* ---------- real-data run (Bush Garden) ---------- */
test('greeting uses first names only', () => {
  const e = env();
  ok(e.ctx._sigFirstNames('Sam Cox') === 'Sam', 'Sam Cox');
  ok(e.ctx._sigFirstNames('Richard and Jenny') === 'Richard & Jenny', 'Richard and Jenny');
  ok(e.ctx._sigFirstNames('Sara & Fede') === 'Sara & Fede', 'Sara & Fede');
});

test('flowering never relabels a species as a cultivar or variety it is not', () => {
  const e = env();
  const lib = { 'correa reflexa var nummulariifolia': { name: 'Correa reflexa var. nummulariifolia', common: 'Roundleaf Correa', months: [11], peak: [] } };
  lib['correa reflexa'] = undefined; delete lib['correa reflexa'];
  const sig = e.ctx._sigFloweringSignal({ garden_id: 'g', species: ['Correa reflexa'] }, (() => { const o = {}; o[e.ctx._sigNorm('Correa reflexa var. nummulariifolia')] = lib['correa reflexa var nummulariifolia']; return o; })(), 11, {});
  ok(sig && /Correa reflexa/.test(sig.text) && !/Roundleaf|nummulariifolia/.test(sig.text), sig && sig.text);
});

test('ALA request stays within the page size the service accepts', () => {
  const e = env(); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  const u = e.fetched.find(x => x.includes('biocache'));
  ok(/pageSize=100\b/.test(u), 'pageSize=100 in ' + u);
});

/* ---------- season around you ---------- */
const BUSH = 'ER-AU-VIC-NIL-BEL-001';
const NOW = '2026-10-31T18:30:00+11:00';
function bush(opts) { const e = env(Object.assign({ now: NOW, seasonFixture: 'ala-recent-bushgarden.json', legacy: false }, opts || {})); e.pilot([[BUSH, 'sam@example.com']]); return e; }

test('Bush Garden (real records, last 30 days): Bogong Moth ~3km, with why-now, asked not assumed', () => {
  const e = bush(); e.ctx.previewSignalsNow();
  const r = e.queue()[0];
  ok(r && r[e.col('signals')] === 'season', 'season only, got ' + (r && r[e.col('signals')]));
  const body = r[e.col('body')];
  ok(r[e.col('subject')] === 'Bush Garden · a Bogong Moth about 3km away', r[e.col('subject')]);
  ok(/^Hi Sam,/.test(body), 'greeting');
  ok(/A Bogong Moth \(Agrotis infusa\) was recorded about 3km from Bush Garden on 18 October\./.test(body), 'dated, distance stated');
  ok(/The record: https:\/\/biocache\.ala\.org\.au\/occurrences\/f2689fa7/.test(body), 'linked');
  ok(/migrate each spring from inland Queensland, New South Wales and western Victoria to the Australian Alps, and can turn up around Melbourne along the way/.test(body), 'sourced why-now wording');
  ok(!/many pass over Melbourne/.test(body), 'unsupported route claim gone');
  const main = body.split('\n--')[0];
  ok(!/\?/.test(main) && !/photo|reply|let us know|send us|have you/i.test(main), 'shares, asks nothing: ' + main);
  ok(!/rare|only record|walking distance|in your garden was/i.test(body), 'no overstated claims');
  ok(/The Correas and eucalypts growing at Bush Garden are among the native plants Bogong Moths are known to feed on\./.test(body), 'horticultural link to the garden planting');
  const ev = JSON.parse(r[e.col('evidence')]).signals[0].evidence;
  ok(ev.lead.tier === 'landscape' && ev.lead.reason === 'seasonal' && ev.lead.record.age_days === 12, 'tier/reason/age: ' + JSON.stringify(ev.lead));
  ok(ev.lead.record.observed === '2026-10-18' && ev.retrieved_at, 'observation and retrieval dates kept');
  ok(ev.lead.why_now_source && ev.lead.why_now_source.url === 'https://www.zoo.org.au/moths', 'why-now source in evidence');
  ok(ev.lead.plant_link && ev.lead.plant_link.source.url.indexOf('ps.org.au') > -1 && ev.lead.plant_link.garden_plants.length === 5, 'plant link source + garden plants in evidence: ' + JSON.stringify(ev.lead.plant_link));
  ok(ev.found_but_no_reason.some(c => /Tachyglossus/.test(c.scientific)), 'echidna found ~4.8km but no reason at that distance');
  ok(ev.excluded.identification > 0, 'needs-ID records excluded');
});

test('season: nothing older than 30 days ever leads; historical-only data writes nothing', () => {
  const e = bush(); e.setNow('2026-12-05T06:00:00+11:00'); e.ctx.previewSignalsNow();
  ok(!e.queue().some(r => /season/.test(r[e.col('signals')])), 'records now 48+ days old → no season note');
  const h = bush({ seasonFixture: 'ala-season-bushgarden.json' }); h.ctx.previewSignalsNow();
  ok(!h.queue().some(r => /season/.test(r[h.col('signals')])), 'past-years fixture → no season note');
});

test('season: a local record needs a reason; with one, it reads as local activity', () => {
  const frog = { uuid: '00000000-0000-4000-8000-000000000001', eventDate: Date.parse('2026-10-25T09:00:00Z'), scientificName: 'Litoria verreauxii',
    vernacularName: "Verreaux's Frog", taxonRank: 'species', family: 'Pelodryadidae', order: 'Anura', classs: 'Amphibia', speciesGroups: ['Animals', 'Amphibians'],
    decimalLatitude: -37.6880, decimalLongitude: 145.1960, coordinateUncertaintyInMeters: 10, assertions: [], dataResourceName: 'FrogID', spatiallyValid: true };
  const e = bush({ extraRecords: [frog] }); e.ctx.previewSignalsNow();
  const r = e.queue()[0], body = r[e.col('body')];
  ok(/Verreaux's Frog \(Litoria verreauxii\) was recorded in the surrounding area on 25 October/.test(body), 'local wording: ' + body.split('\n')[2]);
  ok(/Spotted Marsh Frog, though it hasn't been confirmed yet/.test(body), 'garden link from unresolved observation');
  ok(r[e.col('subject')] === "Bush Garden · a Verreaux's Frog recorded nearby", r[e.col('subject')]);
});

test('season: beyond 5km and obscured locations never qualify', () => {
  const e = env(); const now = new Date('2026-10-31T07:30:00Z');
  const beard = { taxonRank: 'species', coordinateUncertaintyInMeters: 28359, eventDate: Date.parse('2026-10-15'), assertions: [], decimalLatitude: -37.678, decimalLongitude: 145.2,
                  identificationVerificationStatus: 'research', dataResourceName: 'iNaturalist Australia', scientificName: 'Calochilus robertsonii' };
  ok(e.ctx._sigSeasonReject(beard, now, { 'Calochilus robertsonii': false }) === 'location', 'Beard-orchid (28km uncertainty) rejected');
  ok(e.ctx._sigSeasonReject(Object.assign({}, beard, { coordinateUncertaintyInMeters: 20 }), now, {}) === 'native status unknown', 'unknown native status rejected');
  const far = Object.assign({}, beard, { uuid: '00000000-0000-4000-8000-000000000002', coordinateUncertaintyInMeters: 5, decimalLatitude: -37.74, decimalLongitude: 145.195,
    family: 'Orchidaceae', classs: 'Equisetopsida', speciesGroups: ['Plants'], vernacularName: 'Western Beard-orchid', eventDate: Date.parse('2026-10-29') });
  const b = bush({ extraRecords: [far] }); b.ctx.previewSignalsNow();
  ok(!/Beard-orchid/.test(b.queue()[0][b.col('body')]), 'orchid ~6km away excluded');
});

test('season: once Bogong is sent, unsourced orchids do not fill the gap; nothing is drafted', () => {
  const e = bush(); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'APPROVED'); e.ctx.sendApprovedSignals();
  e.setNow('2026-11-07T18:30:00+11:00'); e.ctx.previewSignalsNow();
  ok(e.queue().length === 1, 'no second draft, got ' + (e.queue().length - 1));
});

test('season: SKIP means nothing this week, not "try the next candidate"', () => {
  const e = bush(); e.ctx.previewSignalsNow();
  e.setCell(0, 'status', 'SKIP');
  e.setNow('2026-11-01T18:30:00+11:00'); e.ctx.previewSignalsNow();
  e.setNow('2026-11-04T18:30:00+11:00'); e.ctx.previewSignalsNow();
  ok(e.queue().length === 1, 'no replacement within the week after SKIP, got ' + (e.queue().length - 1));
  const sk = e.ctx._sigKeysFor(e.ctx._sigLogIndex(e.ss), BUSH, 'season', 30);
  ok(sk.indexOf('agrotis infusa') > -1, 'skipped species held back for 30 days');
});

test('pilot default: legacy nearby/flowering notes are off', () => {
  const e = env({ legacy: false, weather: () => 'normal' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  ok(e.queue().length === 0, 'no legacy drafts, got ' + e.queue().map(r => r[e.col('signals')]).join(' | '));
  ok(!e.fetched.some(u => u.includes('biocache') && !u.includes('coordinate_uncertainty')), 'legacy sightings not even fetched');
});

test('season: no plant link when the garden grows none of the plants', () => {
  const e = env();
  ok(e.ctx._sigPlantLink({ garden_name: 'X', species: ['Lomandra longifolia', 'Poa labillardierei'] }, 'Agrotis infusa') === null, 'no overlap → no line');
  const l = e.ctx._sigPlantLink({ garden_name: 'X', species: ['Grevillea rosmarinifolia'] }, 'Agrotis infusa');
  ok(l && l.text === 'The grevilleas growing at X are among the native plants Bogong Moths are known to feed on.', l && l.text);
});

test('season: why-now entries without a source are ignored', () => {
  const e = env();
  e.ctx.SIG_WHY_NOW['family:Orchidaceae'] = { months: [10], text: 'unsourced claim' };
  ok(e.ctx._sigWhyNow({ sci: 'Caladenia parva', family: 'Orchidaceae' }, 10) === '', 'unsourced note not used');
});

test('season: unresolved observation outranks recorded habitat', () => {
  const e = env();
  const base = { species: [], fauna: [], water: true };
  const a = e.ctx._sigThemeLink(Object.assign({}, base, { faunaRecs: [{ name: 'Spotted Marsh Frog', verified: false }] }), 'frogs');
  const b = e.ctx._sigThemeLink(Object.assign({}, base, { faunaRecs: [] }), 'frogs');
  const c = e.ctx._sigThemeLink(Object.assign({}, base, { water: false, faunaRecs: [{ name: 'Spotted Marsh Frog', verified: true }] }), 'frogs');
  ok(a.score > b.score && b.score > c.score, [a.score, b.score, c.score].join(' > '));
});

test('season note adds what else was recorded around the garden, one per theme, with distances and links', () => {
  const e = bush(); e.ctx.previewSignalsNow();
  const body = e.queue()[0][e.col('body')];
  const sect = body.split('Also recorded around Bush Garden in the past few weeks:\n')[1] || '';
  const items = sect.split('\n').filter(l => l.startsWith('– '));
  ok(items.length >= 3 && items.length <= 4, 'three or four items, got ' + items.length + '\n' + sect);
  ok(items.every(l => /about [\d.]+km away|nearby/.test(l) && /https:\/\/biocache\.ala\.org\.au\/occurrences\//.test(l)), 'distance + link on each');
  ok(items.some(l => /orchid/i.test(l)) && items.some(l => /Tachyglossus/.test(l)), 'orchid and echidna included');
  ok(!items.some(l => /Bogong/.test(l)), 'lead species not repeated');
  ok(!/Spotted Medic|Leopard Slug|Cellar Spider/.test(sect), 'introduced species never listed');
  const ev = JSON.parse(e.queue()[0][e.col('evidence')]).signals[0].evidence;
  ok(ev.also_recorded.length === items.length, 'also-recorded kept in evidence');
});

test('season note adds the season so far at the garden from 30 years of modelled weather', () => {
  const e = bush(); e.ctx.previewSignalsNow();
  const body = e.queue()[0][e.col('body')];
  const m = body.match(/Spring so far around Bush Garden: (\d+)mm of rain since 1 September, against a typical (\d+)mm for the same weeks over the past (\d+) years, and (\d+) days over 25°C against a usual (\d+)\./);
  ok(m, 'conditions sentence present:\n' + body);
  ok(m && +m[3] === 30 && +m[1] > +m[2], 'compares against 30 years: ' + (m && m.slice(1).join(',')));
  ok(!/\?/.test(body.split('\n--')[0]), 'still no questions');
  const ev = JSON.parse(e.queue()[0][e.col('evidence')]).signals[0].evidence;
  ok(ev.conditions && /modelled/.test(ev.conditions.source), 'conditions evidence says modelled');
  const d = bush({ archiveDown: true }); d.ctx.previewSignalsNow();
  ok(d.queue().length === 1 && !/so far around/.test(d.queue()[0][d.col('body')]), 'archive down: note still drafts, without the line');
});

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
