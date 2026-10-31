/* ============================================================
   Ecological Registry -- Garden Signals (steward comms engine)

   Lives in the same bound Apps Script project as Code.gs and reuses
   NOTIFY_EMAIL and _emailsForGarden() from there.

   What it does, every morning:
     1. Reads the live Registry (registry.json + garden-locations.json +
        each garden's data file + plant-library.json) from the website.
     2. For every real garden, checks its surrounds:
          - Open-Meteo: heat (>=35C), frost (<=1C), soaking rain,
            and a rainfall-vs-evaporation dry spell (14-day window)
          - Atlas of Living Australia: fauna recorded within 1.5km in the
            last 30 days (weekly)
          - Plant library: species on the garden's own list coming into
            flower this month (weekly)
     3. Writes ONE draft note per garden into the "Signals Queue" sheet,
        respecting per-signal cooldowns, and emails you a summary.

   Nothing reaches a steward until you set a row's status to APPROVED.
   sendApprovedSignals() (every 30 min) sends approved rows from
   hello@gardenerandson.com and marks them SENT.

   Honesty rules baked into the copy:
     - Weather and sightings are about the garden's SURROUNDS, never
       claimed as things observed in the garden.
     - Flowering is "may be coming into flower", phrased as a question.
     - Coordinates used are the public ~250m display coordinates only.
     - Nothing here touches scores or badges.

   SETUP (once):
     1. Paste this file into the project as Signals.gs and save.
     2. Run installSignals() from the editor and grant permissions.
     3. Run previewSignalsNow() to generate a first round of drafts.
   Script Properties (optional):
     SIGNALS_PILOT    comma list of garden_ids; empty = all real gardens
     SIGNALS_EXCLUDE  comma list of garden_ids to skip
     SIGNALS_AUTOSEND comma list of signal types that skip approval,
                      e.g. "heat,frost". Empty = everything needs approval.
   ============================================================ */

var SIG_SITE        = 'https://ecologicalregistry.org';
var SIG_FROM        = 'hello@gardenerandson.com';
var SIG_FROM_NAME   = 'Gardener & Son';
var SIG_SIGNOFF     = 'Tyson & Natasha\nGardener & Son · Ecological Registry';
var SIG_QUEUE       = 'Signals Queue';
var SIG_LOG         = 'Signals Log';
var SIG_OPTOUT      = 'Signals Optout';
var SIG_QUEUE_HEADERS = ['created_at', 'garden_id', 'garden_name', 'to', 'signals',
                         'subject', 'body', 'status', 'sent_at', 'note'];
var SIG_LOG_HEADERS = ['logged_at', 'garden_id', 'signal', 'key'];
var SIG_STATUSES    = ['DRAFT', 'APPROVED', 'SKIP', 'SENT', 'ERROR', 'NO_EMAIL'];

/* Thresholds */
var SIG_HEAT_C        = 35;
var SIG_FROST_C       = 1;
var SIG_RAIN_MM       = 20;   // forecast over today + next 2 days
var SIG_DRY_DEFICIT   = 35;   // mm: (evaporation - rain) over the last 14 days
var SIG_DRY_NEXT_MM   = 5;    // ...and less than this forecast for the next 3 days
var SIG_ALA_RADIUS_KM = 1.5;
var SIG_ALA_DAYS      = 30;
var SIG_WEEKLY_DAY    = 1;    // Monday: nearby sightings + flowering
var SIG_GARDEN_GAP_DAYS = 6;  // at most one weekly note per garden per this many days

/* Cooldowns (days) per signal type, judged from the log of drafted signals */
var SIG_COOLDOWN = { heat: 5, frost: 7, rain: 14, dry: 10, nearby: 6, flowering: 25 };

/* Common introduced fauna we don't headline */
var SIG_INTRODUCED = ['common myna', 'indian myna', 'spotted dove', 'house sparrow',
  'eurasian tree sparrow', 'common blackbird', 'eurasian blackbird', 'rock dove', 'rock pigeon',
  'feral pigeon', 'common starling', 'european starling', 'red fox', 'black rat', 'brown rat',
  'house mouse', 'european rabbit', 'cat', 'dog', 'european honey bee', 'cabbage white',
  'common greenfinch', 'european goldfinch', 'song thrush', 'red-whiskered bulbul',
  'common wasp', 'european wasp', 'mallard'];
var SIG_FAUNA_CLASSES = ['aves', 'amphibia', 'reptilia', 'mammalia', 'insecta'];

/* ---------------------------------------------------------------
   Entry points
   --------------------------------------------------------------- */

/* Run once from the editor: sheets, triggers, permission prompts. */
function installSignals() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _sigQueueSheet(ss); _sigSheet(ss, SIG_LOG, SIG_LOG_HEADERS); _sigSheet(ss, SIG_OPTOUT, ['email', 'added_at', 'note']);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'runSignals' || f === 'sendApprovedSignals') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runSignals').timeBased().everyDays(1).atHour(6).inTimezone('Australia/Melbourne').create();
  ScriptApp.newTrigger('sendApprovedSignals').timeBased().everyMinutes(30).create();
  var alias = _sigAliasOk();
  Logger.log('Signals installed. Send-as alias ' + SIG_FROM + (alias ? ' found.' : ' NOT FOUND -- add it in Gmail settings before approving anything.'));
}

/* Daily trigger. */
function runSignals() { return _sigRun({ forceWeekly: false }); }

/* Manual: generate drafts now, including the weekly components. */
function previewSignalsNow() { return _sigRun({ forceWeekly: true }); }

/* Every 30 min: send rows marked APPROVED (and auto-send types). */
function sendApprovedSignals() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = _sigQueueSheet(ss);
  if (sh.getLastRow() < 2) return 0;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, SIG_QUEUE_HEADERS.length).getValues();
  var auto = _sigProp('SIGNALS_AUTOSEND');
  var optout = _sigOptouts(ss);
  var aliasOk = null, sent = 0;
  var cards = _sigCardIndex();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], status = String(r[7]);
    var types = String(r[4]).split(',').map(function (s) { return s.trim(); }).filter(String);
    var autoOk = status === 'DRAFT' && types.length && auto.length &&
                 types.every(function (t) { return auto.indexOf(t) > -1; });
    if (status !== 'APPROVED' && !autoOk) continue;
    var rowNum = i + 2;
    var to = String(r[3]).split(',').map(function (s) { return s.trim().toLowerCase(); })
               .filter(function (e) { return e && optout.indexOf(e) === -1; });
    if (!to.length) { _sigMark(sh, rowNum, 'NO_EMAIL', '', 'No (opted-in) steward email on file'); continue; }
    if (aliasOk === null) aliasOk = _sigAliasOk();
    if (!aliasOk) { _sigMark(sh, rowNum, 'ERROR', '', 'Send-as alias ' + SIG_FROM + ' missing in Gmail -- not sent'); continue; }
    try {
      GmailApp.sendEmail(to.join(','), String(r[5]), String(r[6]), {
        from: SIG_FROM, name: SIG_FROM_NAME, replyTo: SIG_FROM,
        htmlBody: _sigHtml(String(r[6]), cards[String(r[1])])
      });
      _sigMark(sh, rowNum, 'SENT', new Date().toISOString(), autoOk ? 'auto-sent' : '');
      sent++;
    } catch (err) {
      _sigMark(sh, rowNum, 'ERROR', '', String(err).slice(0, 300));
    }
  }
  return sent;
}

/* ---------------------------------------------------------------
   The run
   --------------------------------------------------------------- */

function _sigRun(opts) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();
  var weekly = opts.forceWeekly || _sigMelbDay(now) === SIG_WEEKLY_DAY;
  var gardens = _sigGardens();
  if (!gardens.length) { Logger.log('Signals: no gardens loaded'); return []; }

  var weather = _sigFetchWeather(gardens);
  var nearby = weekly ? _sigFetchNearby(gardens) : {};
  var library = weekly ? _sigPlantLibrary() : null;
  var log = _sigLogIndex(ss);
  var logRows = [], drafts = [], noEmail = [];
  var month = _sigMelbMonth(now);

  gardens.forEach(function (g) {
    var items = [];
    var w = weather[g.garden_id];
    if (w) {
      _sigWeatherSignals(g, w, month).forEach(function (s) {
        if (!_sigCooling(log, g.garden_id, s.type, now)) items.push(s);
      });
    }
    var lastWeekly = _sigLastAny(log, g.garden_id, ['nearby', 'flowering']);
    var weeklyOpen = !lastWeekly || (now - lastWeekly) / 864e5 >= SIG_GARDEN_GAP_DAYS;
    if (weekly && weeklyOpen) {
      var nb = nearby[g.garden_id];
      if (nb && !_sigCooling(log, g.garden_id, 'nearby', now)) {
        var s1 = _sigNearbySignal(g, nb, log);
        if (s1) items.push(s1);
      }
      if (library && !_sigCooling(log, g.garden_id, 'flowering', now)) {
        var s2 = _sigFloweringSignal(g, library, month, log);
        if (s2) items.push(s2);
      }
    }
    if (!items.length) return;

    var emails = [];
    try { emails = _emailsForGarden(g.garden_id, ss); } catch (e) { emails = []; }
    emails = emails.filter(function (e, i, a) { return a.indexOf(e) === i; });
    if (!emails.length) { noEmail.push(g.garden_name); return; }   // nothing queued or logged
    var draft = _sigCompose(g, items);
    drafts.push([now.toISOString(), g.garden_id, g.garden_name, emails.join(', '),
                 items.map(function (s) { return s.type; }).join(', '),
                 draft.subject, draft.body, 'DRAFT', '', '']);
    items.forEach(function (s) { logRows.push([now.toISOString(), g.garden_id, s.type, s.key || '']); });
  });

  if (drafts.length) {
    var q = _sigQueueSheet(ss);
    q.getRange(q.getLastRow() + 1, 1, drafts.length, SIG_QUEUE_HEADERS.length).setValues(drafts);
    var l = _sigSheet(ss, SIG_LOG, SIG_LOG_HEADERS);
    l.getRange(l.getLastRow() + 1, 1, logRows.length, SIG_LOG_HEADERS.length).setValues(logRows);
  }
  if (drafts.length || noEmail.length) _sigNotify(ss, drafts, noEmail);
  Logger.log('Signals: ' + gardens.length + ' gardens checked, ' + drafts.length + ' drafts written' + (weekly ? ' (weekly run)' : ''));
  return drafts;
}

/* ---------------------------------------------------------------
   Gardens
   --------------------------------------------------------------- */

function _sigGardens() {
  var reg = _sigJson(SIG_SITE + '/data/registry.json');
  var locs = _sigJson(SIG_SITE + '/data/garden-locations.json') || [];
  if (!reg || !reg.gardens) return [];
  var loc = {};
  locs.forEach(function (l) { loc[l.garden_id] = l; });
  var pilot = _sigProp('SIGNALS_PILOT'), exclude = _sigProp('SIGNALS_EXCLUDE');
  var list = reg.gardens.filter(function (g) {
    if (g.demo || /demo/i.test(String(g.status || ''))) return false;
    if (exclude.indexOf(g.garden_id) > -1) return false;
    if (pilot.length && pilot.indexOf(g.garden_id) === -1) return false;
    return loc[g.garden_id] && loc[g.garden_id].display_lat;
  });
  var reqs = list.map(function (g) { return { url: SIG_SITE + '/' + String(g.data_file || '').replace(/^\//, ''), muteHttpExceptions: true }; });
  var resps = reqs.length ? UrlFetchApp.fetchAll(reqs) : [];
  return list.map(function (g, i) {
    var rec = {};
    try { if (resps[i].getResponseCode() === 200) rec = JSON.parse(resps[i].getContentText()); } catch (e) {}
    var bio = rec.biodiversity || {}, hab = rec.habitat || {};
    return {
      garden_id: g.garden_id,
      garden_name: g.garden_name || rec.garden_name || g.garden_id,
      suburb: g.suburb || rec.suburb || '',
      lat: Number(loc[g.garden_id].display_lat),
      lng: Number(loc[g.garden_id].display_lng),
      stewards: String(rec.stewards || '').trim(),
      species: (bio.species_list || []).map(function (s) { return typeof s === 'string' ? s : (s && (s.name || s.botanical_name)) || ''; }).filter(String),
      fauna: (hab.fauna_sightings || []).map(function (f) { return String(f.species || '').toLowerCase(); }),
      score: g.score, rating: (g.rating && g.rating.current) || '',
      provisional: /provisional/i.test(String(g.status || '')) || /self_reported/i.test(String(g.verification_level || '')),
      profile: SIG_SITE + (String(g.profile_url || '').charAt(0) === '/' ? '' : '/') + String(g.profile_url || '')
    };
  });
}

/* garden_id -> card data for the email footer */
function _sigCardIndex() {
  var out = {};
  try {
    _sigGardens().forEach(function (g) { out[g.garden_id] = g; });
  } catch (e) {}
  return out;
}

/* ---------------------------------------------------------------
   Weather (Open-Meteo, no key)
   --------------------------------------------------------------- */

function _sigFetchWeather(gardens) {
  var reqs = gardens.map(function (g) {
    return { muteHttpExceptions: true, url: 'https://api.open-meteo.com/v1/forecast?latitude=' + g.lat.toFixed(3) +
      '&longitude=' + g.lng.toFixed(3) +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration' +
      '&past_days=14&forecast_days=4&timezone=Australia%2FMelbourne' };
  });
  var out = {};
  var resps = UrlFetchApp.fetchAll(reqs);
  resps.forEach(function (r, i) {
    try { if (r.getResponseCode() === 200) out[gardens[i].garden_id] = JSON.parse(r.getContentText()).daily; } catch (e) {}
  });
  return out;
}

/* daily arrays: indices 0..13 = past 14 days, 14 = today, 15.. = next days */
function _sigWeatherSignals(g, d, month) {
  var out = [], T = 14;
  if (!d || !d.time || d.time.length < T + 3) return out;
  var tmax = d.temperature_2m_max, tmin = d.temperature_2m_min,
      rain = d.precipitation_sum, et0 = d.et0_fao_evapotranspiration;
  var num = function (v) { return typeof v === 'number' ? v : 0; };
  var dayName = function (i) { return _sigDayName(d.time[i], i - T); };

  // Heat: hottest of today + next 2 days
  var hi = -99, hiDay = -1;
  for (var i = T; i <= T + 2; i++) if (num(tmax[i]) > hi) { hi = num(tmax[i]); hiDay = i; }
  if (hi >= SIG_HEAT_C) out.push({ type: 'heat', key: d.time[hiDay], subject: 'heat on the way',
    text: 'Our forecast for your area shows ' + Math.round(hi) + '°C ' + dayName(hiDay) + '. ' +
      'Anything planted in the last year is most at risk. A deep, slow soak the evening before does far more than a daily sprinkle, ' +
      'and a shallow dish of water at ground level helps lizards, birds and bees ride it out too.' });

  // Frost
  var lo = 99, loDay = -1;
  for (var j = T; j <= T + 2; j++) if (typeof tmin[j] === 'number' && tmin[j] < lo) { lo = tmin[j]; loDay = j; }
  if (lo <= SIG_FROST_C) out.push({ type: 'frost', key: d.time[loDay], subject: 'a cold morning ahead',
    text: 'A frost is possible ' + dayName(loDay) + ' morning, with a forecast low around ' + Math.round(lo) + '°C near you. ' +
      'Most indigenous plants take it in their stride, but young or tender plantings in open, low spots are worth checking. ' +
      'Leave the leaf litter where it is; it is doing its job.' });

  // Soaking rain: today + next 2 days
  var wet = 0;
  for (var k = T; k <= T + 2; k++) wet += num(rain[k]);
  if (wet >= SIG_RAIN_MM) {
    var autumn = month >= 3 && month <= 6;
    out.push({ type: 'rain', key: d.time[T], subject: autumn ? 'the planting window opens' : 'rain on the way',
      text: autumn
        ? 'Around ' + Math.round(wet) + 'mm of rain is forecast for your area over the next three days. In autumn this is the moment the planting window properly opens: warm soil, moisture arriving. If there is a gap you have been meaning to fill, this is the week.'
        : 'Around ' + Math.round(wet) + 'mm of rain is forecast for your area over the next three days. Afterwards is a good time for a slow walk around: where water pools and where it runs off tells you a lot about your garden.' });
  }

  // Dry spell: evaporation outrunning rain over the last 14 days, little rain coming
  var pastRain = 0, pastEt = 0, next = 0;
  for (var p = 0; p < T; p++) { pastRain += num(rain[p]); pastEt += num(et0[p]); }
  for (var n = T; n <= T + 3 && n < rain.length; n++) next += num(rain[n]);
  if (pastEt - pastRain >= SIG_DRY_DEFICIT && next < SIG_DRY_NEXT_MM && wet < SIG_RAIN_MM)
    out.push({ type: 'dry', key: d.time[T], subject: 'a dry stretch',
      text: 'It has been a dry fortnight around your garden: about ' + Math.round(pastRain) + 'mm of rain, against roughly ' +
        Math.round(pastEt) + 'mm drawn back out of the ground by sun and wind, and little rain in the forecast. ' +
        'Established indigenous plants mostly ride this out. The newest plantings are the ones to check: push a finger into the soil beside them.' });
  return out;
}

/* ---------------------------------------------------------------
   Nearby sightings (Atlas of Living Australia)
   --------------------------------------------------------------- */

function _sigFetchNearby(gardens) {
  var from = Utilities.formatDate(new Date(Date.now() - SIG_ALA_DAYS * 864e5), 'UTC', 'yyyy-MM-dd');
  var reqs = gardens.map(function (g) {
    return { muteHttpExceptions: true, url: 'https://biocache-ws.ala.org.au/ws/occurrences/search?q=*:*' +
      '&lat=' + g.lat.toFixed(4) + '&lon=' + g.lng.toFixed(4) + '&radius=' + SIG_ALA_RADIUS_KM +
      '&fq=' + encodeURIComponent('occurrence_date:[' + from + 'T00:00:00Z TO *]') +
      '&pageSize=300&sort=occurrence_date&dir=desc' };
  });
  var out = {};
  var resps = UrlFetchApp.fetchAll(reqs);
  resps.forEach(function (r, i) {
    try {
      if (r.getResponseCode() !== 200) return;
      var occ = JSON.parse(r.getContentText()).occurrences || [];
      var bySp = {};
      occ.forEach(function (o) {
        var cls = String(o.classs || o['class'] || '').toLowerCase();
        var groups = (o.speciesGroups || []).join(' ').toLowerCase();
        var fauna = SIG_FAUNA_CLASSES.indexOf(cls) > -1 || /birds|amphibians|frogs|reptiles|mammals|insects|butterflies/.test(groups);
        if (!fauna) return;
        var sci = String(o.scientificName || o.raw_scientificName || '').trim();
        if (sci.split(/\s+/).length < 2) return;            // species-level only
        var common = String(o.vernacularName || o.raw_vernacularName || '').trim();
        if (SIG_INTRODUCED.indexOf(common.toLowerCase()) > -1) return;
        var k = sci.toLowerCase();
        if (!bySp[k]) bySp[k] = { sci: sci, common: common, cls: cls, n: 0 };
        bySp[k].n++;
      });
      out[gardens[i].garden_id] = Object.keys(bySp).map(function (k) { return bySp[k]; });
    } catch (e) {}
  });
  return out;
}

function _sigNearbySignal(g, list, log) {
  var mentioned = _sigKeysFor(log, g.garden_id, 'nearby', 90);
  var fresh = list.filter(function (s) {
    var lc = (s.common || s.sci).toLowerCase();
    if (mentioned.indexOf(s.sci.toLowerCase()) > -1) return false;
    return !g.fauna.some(function (f) { return f && (lc.indexOf(f) > -1 || f.indexOf(lc) > -1); });
  });
  if (!fresh.length) return null;
  var rank = { aves: 0, amphibia: 1, reptilia: 2, insecta: 3, mammalia: 4 };
  var r = function (c) { return rank.hasOwnProperty(c) ? rank[c] : 5; };
  fresh.sort(function (a, b) { return (r(a.cls) - r(b.cls)) || (b.n - a.n); });
  var pick = fresh.slice(0, 4);
  var names = pick.map(function (s) { return s.common ? s.common + ' (' + s.sci + ')' : s.sci; });
  return { type: 'nearby', key: pick.map(function (s) { return s.sci.toLowerCase(); }).join('|'), subject: 'who\'s been seen nearby',
    text: 'Recorded within about 1.5km of your garden in the past month, according to the Atlas of Living Australia: ' +
      _sigJoin(names) + '. Have any of them visited you? Reply with a photo or a line and we will add it to your garden\'s record.' };
}

/* ---------------------------------------------------------------
   Flowering (plant library)
   --------------------------------------------------------------- */

function _sigPlantLibrary() {
  var lib = _sigJson(SIG_SITE + '/data/plant-library.json');
  if (!lib || !lib.species) return null;
  var idx = {};
  lib.species.forEach(function (p) {
    if (p.australian_native !== true) return;   // only headline Australian plants
    var months = _sigBloomMonths(p);
    if (!months.length) return;
    idx[_sigNorm(p.botanical_name)] = { name: p.botanical_name, common: p.common_name || '', months: months,
      peak: (p.flowering && p.flowering.peak) || [] };
  });
  return idx;
}

function _sigBloomMonths(p) {
  if (p.flowering && (p.flowering.peak || []).length)
    return (p.flowering.peak || []).concat(p.flowering.shoulder || []);
  var bt = p.bloom_time;
  if (!bt) return [];
  if (!Array.isArray(bt)) bt = [bt];
  var S = { spring: [9, 10, 11], summer: [12, 1, 2], autumn: [3, 4, 5], winter: [6, 7, 8] };
  var order = ['spring', 'summer', 'autumn', 'winter'];
  var months = [];
  bt.forEach(function (raw) {
    var s = String(raw).toLowerCase();
    if (/all year|evergreen/.test(s)) return;
    var found = order.filter(function (k) { return s.indexOf(k) > -1; });
    if (!found.length) return;
    var span = found;
    if (/\bto\b|-/.test(s) && found.length === 2) {
      var a = s.indexOf(found[0]) < s.indexOf(found[1]) ? found[0] : found[1];
      var b = a === found[0] ? found[1] : found[0];
      span = []; var i = order.indexOf(a);
      while (true) { span.push(order[i]); if (order[i] === b || span.length > 4) break; i = (i + 1) % 4; }
    }
    span.forEach(function (k) {
      var m = S[k];
      if (/early/.test(s) && span.length === 1) m = [m[0]];
      else if (/late/.test(s) && span.length === 1) m = [m[2]];
      months = months.concat(m);
    });
  });
  return months.filter(function (m, i, a) { return a.indexOf(m) === i; });
}

function _sigFloweringSignal(g, lib, month, log) {
  var prev = month === 1 ? 12 : month - 1;
  var recent = _sigKeysFor(log, g.garden_id, 'flowering', 150);
  var seen = {}, coming = [];
  g.species.forEach(function (raw) {
    var p = _sigMatchPlant(raw, lib);
    if (!p || seen[p.name]) return;
    seen[p.name] = true;
    if (recent.indexOf(_sigNorm(p.name)) > -1) return;
    // Genus-level library entries (e.g. a cultivar) keep the garden's own name
    var label = p.name.split(' ').length > 1 && p.common ? p.common + ' (' + p.name + ')'
              : String(raw).replace(/['‘’"]/g, '').trim();
    if (p.months.indexOf(month) > -1) coming.push({ name: p.name, months: p.months, peak: p.peak, label: label });
  });
  if (!coming.length) return null;
  // Prefer plants just starting this month, then those at peak, then the rest.
  var rankP = function (p) { return (p.months.indexOf(prev) === -1 ? 0 : 2) + (p.peak.indexOf(month) > -1 ? 0 : 1); };
  coming.sort(function (a, b) { return rankP(a) - rankP(b); });
  var pick = coming.slice(0, 3);
  var names = pick.map(function (p) { return p.label; });
  return { type: 'flowering', key: pick.map(function (p) { return _sigNorm(p.name); }).join('|'), subject: 'what may be coming into flower',
    text: 'Going by your garden\'s planting list, ' + _sigJoin(names) + (pick.length > 1 ? ' are' : ' is') +
      ' usually in flower around now. ' + (pick.length > 1 ? 'Have they' : 'Has it') + ' started? Let us know what is actually out; ' +
      'a quick photo makes your record far richer than any list.' };
}

function _sigMatchPlant(raw, lib) {
  var n = _sigNorm(raw);
  if (!n) return null;
  if (lib[n]) return lib[n];
  var two = n.split(' ').slice(0, 2).join(' ');
  if (lib[two]) return lib[two];
  var keys = Object.keys(lib);
  for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(two + ' ') === 0 || n.indexOf(keys[i] + ' ') === 0) return lib[keys[i]];
  return null;
}

function _sigNorm(s) {
  return String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/['"‘’“”]/g, '')
    .replace(/\b(subsp|ssp|var|cv)\.?\b.*$/, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------------------------------------------------------------
   Composition
   --------------------------------------------------------------- */

function _sigCompose(g, items) {
  var order = { heat: 0, frost: 1, dry: 2, rain: 3, nearby: 4, flowering: 5 };
  items.sort(function (a, b) { return order[a.type] - order[b.type]; });
  var greeting = g.stewards ? 'Hi ' + g.stewards.replace(/\s+and\s+/i, ' & ') + ',' : 'Hello,';
  var lead = items.length > 1 ? 'A few things around ' + g.garden_name + ' this week.' : 'A quick note about ' + g.garden_name + '.';
  var subject = g.garden_name + ': ' + items[0].subject;
  var close = items.some(function (s) { return s.type === 'nearby' || s.type === 'flowering'; })
    ? 'Just hit reply. It comes straight to us.'
    : 'If anything looks unhappy, reply with a photo and we will take a look.';
  var body = [greeting, '', lead, '']
    .concat(items.map(function (s) { return s.text + '\n'; }))
    .concat([close, '', SIG_SIGNOFF]).join('\n');
  return { subject: subject, body: body };
}

function _sigHtml(body, card) {
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var paras = esc(body).split(/\n{2,}/).map(function (p) {
    return '<p style="margin:0 0 16px;font:16px/1.6 Georgia,serif;color:#2b2f26">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  var foot = '';
  if (card) {
    var light = card.provisional ? '#d4bb87' : '#b3ff6c';
    foot = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;width:100%;max-width:360px;background:#11170f;border:1px solid #47513e">' +
      '<tr><td style="padding:18px 20px">' +
      '<div style="font:11px/1.5 Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:#d2dbca">Ecological Registry <span style="color:' + light + '">●</span></div>' +
      '<div style="font:18px/1.3 Helvetica,Arial,sans-serif;color:#fff0dc;margin-top:12px">' + esc(card.garden_name) + '</div>' +
      '<div style="font:11px/1.6 Menlo,monospace;text-transform:uppercase;color:' + light + ';margin-top:4px">' + esc(card.rating || '') + (card.provisional ? ' · provisional' : '') + '</div>' +
      (typeof card.score === 'number' ? '<div style="font:500 56px/1.1 Menlo,monospace;color:' + light + ';margin-top:8px">' + card.score + '<span style="font-size:13px;color:#a4af9c"> / 100</span></div>' : '') +
      '<a href="' + esc(card.profile) + '" style="display:block;margin-top:12px;font:13px/1.5 Helvetica,Arial,sans-serif;color:#fff0dc">View your garden\'s record ↗</a>' +
      '</td></tr></table>';
  }
  var small = '<p style="margin:24px 0 0;font:12px/1.6 Helvetica,Arial,sans-serif;color:#7d8574">These notes are part of our steward pilot. ' +
    'Weather and sightings describe your local area, not your garden itself. Reply "pause" and we will stop them.</p>';
  return '<div style="max-width:560px;padding:8px">' + paras + foot + small + '</div>';
}

/* Internal summary to you after each run that produced drafts */
function _sigNotify(ss, drafts, noEmail) {
  try {
    var lines = drafts.map(function (d) { return '• ' + d[2] + ' — ' + d[4]; });
    var text = (lines.length ? lines.join('\n') + '\n\nReview and set status to APPROVED:\n' +
      ss.getUrl() + '#gid=' + _sigQueueSheet(ss).getSheetId() : 'No drafts this run.');
    if (noEmail && noEmail.length)
      text += '\n\nHad something to say but no steward email on file (add to the Steward Emails sheet):\n' + noEmail.join(', ');
    MailApp.sendEmail(NOTIFY_EMAIL, 'Garden signals: ' + drafts.length + ' draft' + (drafts.length === 1 ? '' : 's') + ' to review', text);
  } catch (e) {}
}

/* ---------------------------------------------------------------
   Sheets, log, helpers
   --------------------------------------------------------------- */

function _sigSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _sigQueueSheet(ss) {
  var existed = !!ss.getSheetByName(SIG_QUEUE);
  var sh = _sigSheet(ss, SIG_QUEUE, SIG_QUEUE_HEADERS);
  if (!existed) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(SIG_STATUSES, true).build();
    sh.getRange('H2:H').setDataValidation(rule);
    sh.setColumnWidth(6, 260); sh.setColumnWidth(7, 520);
    sh.getRange('G2:G').setWrap(true);
  }
  return sh;
}

function _sigMark(sh, row, status, sentAt, note) {
  sh.getRange(row, 8, 1, 3).setValues([[status, sentAt, note]]);
}

function _sigLogIndex(ss) {
  var sh = _sigSheet(ss, SIG_LOG, SIG_LOG_HEADERS);
  var out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var k = r[1] + '::' + r[2];
    (out[k] = out[k] || []).push({ at: new Date(r[0]), key: String(r[3]) });
  });
  return out;
}

function _sigCooling(log, gid, type, now) {
  var e = log[gid + '::' + type];
  if (!e || !e.length) return false;
  var last = Math.max.apply(null, e.map(function (x) { return x.at.getTime(); }));
  return (now.getTime() - last) / 864e5 < (SIG_COOLDOWN[type] || 7);
}

function _sigLastAny(log, gid, types) {
  var last = 0;
  types.forEach(function (t) { (log[gid + '::' + t] || []).forEach(function (x) { last = Math.max(last, x.at.getTime()); }); });
  return last ? new Date(last) : null;
}

function _sigKeysFor(log, gid, type, days) {
  var cut = Date.now() - days * 864e5, out = [];
  (log[gid + '::' + type] || []).forEach(function (x) {
    if (x.at.getTime() >= cut) out = out.concat(x.key.split('|'));
  });
  return out;
}

function _sigOptouts(ss) {
  var sh = ss.getSheetByName(SIG_OPTOUT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).toLowerCase().trim(); }).filter(String);
}

function _sigAliasOk() {
  try {
    if (Session.getEffectiveUser().getEmail().toLowerCase() === SIG_FROM) return true;
    return GmailApp.getAliases().map(function (a) { return a.toLowerCase(); }).indexOf(SIG_FROM) > -1;
  } catch (e) { return false; }
}

function _sigJson(url) {
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
  } catch (e) { return null; }
}

function _sigProp(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '')
    .split(',').map(function (s) { return s.trim(); }).filter(String);
}

function _sigMelbDay(d) { return Number(Utilities.formatDate(d, 'Australia/Melbourne', 'u')) % 7; }   // 1=Mon .. 0=Sun
function _sigMelbMonth(d) { return Number(Utilities.formatDate(d, 'Australia/Melbourne', 'M')); }

function _sigDayName(iso, offset) {
  if (offset === 0) return 'today';
  if (offset === 1) return 'tomorrow';
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var p = String(iso).split('-');
  return 'on ' + days[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()];
}

function _sigJoin(a) {
  if (a.length < 2) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}
