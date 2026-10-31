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
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
    setFrozenRows() {} setColumnWidth() {} hideColumns() {} getSheetId() { return this.id; }
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST' };
  const props = {}, gmail = [], mail = [], fetched = [];
  const resp = (code, t) => ({ getResponseCode: () => code, getContentText: () => t });
  function fetch(u) {
    u = typeof u === 'string' ? u : u.url; fetched.push(u);
    if (u.startsWith('https://ecologicalregistry.org/')) {
      const p = path.join(REPO, u.slice('https://ecologicalregistry.org/'.length));
      return fs.existsSync(p) ? resp(200, fs.readFileSync(p, 'utf8')) : resp(404, '');
    }
    if (u.includes('open-meteo')) {
      const lat = +u.match(/latitude=([-\d.]+)/)[1];
      const g = LOCS.find(l => Math.abs(l.display_lat - lat) < 0.001);
      return resp(200, JSON.stringify({ daily: daily(now, weatherKind(g && g.garden_id)) }));
    }
    if (u.includes('biocache')) return resp(opts.alaDown ? 500 : 200, JSON.stringify(ALA));
    return resp(404, '');
  }
  const RealDate = Date;
  class FD extends RealDate { constructor(...a) { a.length ? super(...a) : super(now.getTime()); } static now() { return now.getTime(); } }
  let lockFree = opts.lockFree !== false;
  const fmt = (d, tz, f) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(d).map(x => [x.type, x.value]));
    if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
    if (f === 'M') return p.month;
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  };
  const ctx = {
    console, JSON, Math, Date: FD, NOTIFY_EMAIL: 'hello@lundbech.me',
    UrlFetchApp: { fetch, fetchAll: r => r.map(fetch) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {}, newDataValidation: () => ({ requireValueInList() { return this; }, build() { return {}; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => lockFree, releaseLock() {} }) },
    Logger: { log: () => {} },
    MailApp: { sendEmail: (...a) => mail.push(a) },
    GmailApp: { sendEmail: (...a) => { if (opts.gmailThrows) throw new Error('Service invoked too many times'); gmail.push(a); },
                getAliases: () => opts.aliases || ['hello@gardenerandson.com'] },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.account || 'hello@lundbech.me' }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => { const t = new Proxy({}, { get: (o, k) => () => t }); return t; } },
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
    ctx, ss, sheets, props, gmail, mail, fetched,
    setNow: d => { now = new Date(d); },
    setLock: b => { lockFree = b; },
    pilot: rows => { ctx.installSignals(); const p = sheets['Signals Pilot']; rows.forEach(r => p.rows.push([r[0], r[1], '', ''])); },
    optout: e => sheets['Signals Optout'].rows.push([e, '', '']),
    queue: () => (sheets['Signals Queue'] ? sheets['Signals Queue'].rows.slice(1) : []),
    col: h => ctx.SIG_QUEUE_HEADERS.indexOf(h),
    setCell: (rowIdx, h, v) => { sheets['Signals Queue'].rows[rowIdx + 1][ctx.SIG_QUEUE_HEADERS.indexOf(h)] = v; },
    edit: (rowIdx, h, v) => {
      api.setCell(rowIdx, h, v);
      const sh = sheets['Signals Queue'];
      ctx.onSignalsEdit({ range: sh.getRange(rowIdx + 2, ctx.SIG_QUEUE_HEADERS.indexOf(h) + 1) });
    }
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
  ok(e.gmail.every(g => g[3].from === 'hello@gardenerandson.com' && g[3].replyTo === 'hello@gardenerandson.com'), 'alias from set');
  ok(e.gmail[0][3].htmlBody === e.queue()[0][e.col('html')], 'sends the frozen HTML, not a rebuild');
  ok(e.queue().every(r => r[e.col('status')] === 'SENT' && r[e.col('sent_at')]), 'marked SENT');
});

test('primary account omits `from`; no alias means ERROR, not a send from the wrong address', () => {
  const a = env({ account: 'hello@gardenerandson.com', aliases: [] }); a.pilot(pilotRows); a.ctx.previewSignalsNow();
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
  ok(e.queue()[0][e.col('status')] === 'ERROR' && !Object.keys(e.props).length, 'ERROR, no sent record');
});

test('cooldowns: a second same-day run drafts nothing new', () => {
  const e = env({ weather: () => 'heat' }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  ok(e.ctx.previewSignalsNow().length === 0, 'no repeats');
});

test('ALA outage drops sightings, other signals still draft', () => {
  const e = env({ weather: () => 'rain', alaDown: true }); e.pilot(pilotRows); e.ctx.previewSignalsNow();
  ok(e.queue().every(r => !/nearby/.test(r[e.col('signals')]) && /^rain/.test(r[e.col('signals')])), 'rain only');
});

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
