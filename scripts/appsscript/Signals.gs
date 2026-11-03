/* ============================================================
   Ecological Registry -- Garden Signals (steward comms, PILOT)

   Lives in the same bound Apps Script project as Code.gs and reuses
   NOTIFY_EMAIL from there. It does NOT use _emailsForGarden(): being a
   known steward is not the same as opting in to these notes.

   WHO RECEIVES ANYTHING
     Only rows in the "Signals Pilot" sheet (garden_id, email). Empty
     sheet = nothing is drafted. Addresses in "Signals Optout" are never
     sent to, and both lists are re-checked at send time.

   WHAT RUNS
     runSignals()          daily 06:00 -- drafts only
     sendApprovedSignals() every 30 min -- sends rows you set to APPROVED

   Each draft carries ONE lead signal and at most ONE supporting
   observation:
     alerts (lead first): heat >=35C, frost <=1C (both 1-2 days ahead),
                          dry fortnight, soaking rain  -- Open-Meteo
     observations (Mondays, priority order):
                          season around you -- one reliable record observed
                            in the last 30 days: within 1.5km with a reason
                            to care, or within 5km only with a seasonal
                            reason or strong garden link (distance stated);
                            often nothing qualifies, and nothing is drafted
                          nearby fauna / flowering -- older notes, OFF in the
                            pilot (SIGNALS_LEGACY_OBS=on to re-enable)

   SAFETY RULES
     - Draft content is frozen: recipients, subject, plain text and the
       rendered HTML are stored with a content hash. Editing to/subject/
       body regenerates the HTML and resets status to DRAFT. A hash
       mismatch at send time also resets to DRAFT.
     - Every draft has expires_at. Weather drafts expire before the event
       they describe; expired rows become EXPIRED and are never sent. An
       expired or failed draft doesn't hold a cooldown, so the next run
       (or previewSignalsNow) drafts a fresh replacement to approve.
     - Cooldowns count SENT messages. A pending draft only blocks a
       duplicate until it expires; a SKIPped draft blocks that same event.
     - The sender re-reads each row just before claiming it and again just
       after, and the edit trigger waits on the same lock, so an edit made
       while other rows are sending always wins.
     - installSignals() archives Signals sheets from an older column layout
       (renamed, approvals marked ARCHIVED). Until it is run, nothing drafts
       or sends against an old layout.
     - Sends run under a script lock with a persistent SENDING state and a
       unique message_id. A row found in SENDING at the start of a run
       (crash mid-send) becomes CHECK for manual review; it is never
       retried automatically.
     - Missing or non-numeric weather data skips the signal; it is never
       treated as zero.
     - Each row keeps its evidence (source, retrieval time, forecast
       dates and values, ALA occurrence IDs/dates/links) in `evidence`.
     - Coordinates are the public ~250m display coordinates only.
     - Nothing here touches scores or badges.

   PAUSE REPLIES
     The script does not read replies. Whoever reads hello@ecologicalregistry.org
     adds the address to the "Signals Optout" sheet. That takes effect
     immediately, including for rows already APPROVED.

   SETUP -- draft-only trial
     1. Add this file to the project as Signals.gs and save.
     2. Run installSignals() and grant permissions. This installs the
        daily drafting trigger and the edit trigger ONLY. Sending is off:
        no send trigger exists, and sendApprovedSignals() refuses to run
        even if called by hand.
     3. Add 2-3 gardens to "Signals Pilot" (garden_id, email).
     4. Run previewSignalsNow() and review the "Signals Queue" sheet.
     5. To see a draft's email layout: click any cell in its row and run
        previewSelectedSignal(), or call previewSignalEmail(messageId).
        Read-only: it opens a dialog in the sheet, sends nothing and
        changes nothing.

   TURNING SENDING ON (later, deliberately)
     enableSending()   checks the send-as alias, sets SIGNALS_SENDING=on
                       and installs the 30-minute send trigger.
     disableSending()  removes the trigger and sets SIGNALS_SENDING=off.
                       APPROVED rows stay put until sending is on again.
   ============================================================ */

var SIG_SITE      = 'https://ecologicalregistry.org';
var SIG_FROM      = 'hello@ecologicalregistry.org';   // Registry notes come from the Registry, not G&S
var SIG_FROM_NAME = 'Ecological Registry';
var SIG_SIGNOFF   = 'Tyson & Natasha\nEcological Registry';
var SIG_TZ        = 'Australia/Melbourne';
var SIG_QUEUE     = 'Signals Queue';
var SIG_LOG       = 'Signals Log';
var SIG_PILOT     = 'Signals Pilot';
var SIG_OPTOUT    = 'Signals Optout';
var SIG_QUEUE_HEADERS = ['created_at', 'message_id', 'garden_id', 'garden_name', 'to', 'signals',
  'subject', 'body', 'status', 'expires_at', 'sent_at', 'note', 'content_hash', 'evidence', 'card', 'html'];
var SIG_C = {};  // column index (1-based) by header name
SIG_QUEUE_HEADERS.forEach(function (h, i) { SIG_C[h] = i + 1; });
var SIG_EDITABLE = ['to', 'subject', 'body'];
var SIG_LOG_HEADERS = ['logged_at', 'garden_id', 'signal', 'key', 'message_id'];
var SIG_STATUSES = ['DRAFT', 'APPROVED', 'SKIP', 'SENDING', 'SENT', 'CHECK', 'EXPIRED', 'ERROR', 'ARCHIVED'];

/* Thresholds */
var SIG_HEAT_C = 35, SIG_FROST_C = 1, SIG_RAIN_MM = 20;
var SIG_DRY_DEFICIT = 35;   // mm: reference ET0 minus rain, past 14 days (modelled)
var SIG_DRY_NEXT_MM = 5;    // ...and less than this forecast over the next 4 days
var SIG_ALA_RADIUS_KM = 1.5, SIG_ALA_DAYS = 30;
var SIG_WEEKLY_DAY = 1;     // Monday
var SIG_GARDEN_GAP_DAYS = 6;
var SIG_COOLDOWN = { heat: 5, frost: 7, rain: 14, dry: 10, season: 6, nearby: 6, flowering: 25 };
var SIG_ALERTS = ['heat', 'frost', 'dry', 'rain'];      // priority order
var SIG_OBS = ['season', 'nearby', 'flowering'];   // priority order

var SIG_INTRODUCED = ['common myna', 'indian myna', 'spotted dove', 'house sparrow',
  'eurasian tree sparrow', 'common blackbird', 'eurasian blackbird', 'rock dove', 'rock pigeon',
  'feral pigeon', 'common starling', 'european starling', 'red fox', 'black rat', 'brown rat',
  'house mouse', 'european rabbit', 'cat', 'dog', 'european honey bee', 'cabbage white',
  'common greenfinch', 'european goldfinch', 'song thrush', 'red-whiskered bulbul',
  'common wasp', 'european wasp', 'mallard'];
var SIG_FAUNA_CLASSES = ['aves', 'amphibia', 'reptilia', 'mammalia', 'insecta'];
var SIG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
var SIG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---------------------------------------------------------------
   Entry points
   --------------------------------------------------------------- */

function installSignals() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var archived = _sigArchiveOldSchema(ss);
  _sigQueueSheet(ss);
  _sigSheet(ss, SIG_LOG, SIG_LOG_HEADERS);
  _sigSheet(ss, SIG_PILOT, ['garden_id', 'email', 'added_at', 'note']);
  _sigSheet(ss, SIG_OPTOUT, ['email', 'added_at', 'note']);
  _sigDeleteTriggers(['runSignals', 'sendApprovedSignals', 'onSignalsEdit']);
  ScriptApp.newTrigger('runSignals').timeBased().everyDays(1).atHour(6).inTimezone(SIG_TZ).create();
  ScriptApp.newTrigger('onSignalsEdit').forSpreadsheet(ss).onEdit().create();
  PropertiesService.getScriptProperties().setProperty('SIGNALS_SENDING', 'off');
  if (archived.length) Logger.log('Older Signals sheets archived (not migrated; approvals in them will never send): ' + archived.join(', '));
  var mode = _sigSendMode();
  Logger.log('Signals installed in DRAFT-ONLY mode (no send trigger). Send-as ' + SIG_FROM + ': ' +
    (mode ? 'OK (' + mode + ')' : 'not available yet -- needed before enableSending()'));
}

/* Deliberate switch: only after the draft-only trial. */
function enableSending() {
  var mode = _sigSendMode();
  if (!mode) throw new Error('Cannot send as ' + SIG_FROM + ': add it as a Gmail send-as alias first. Sending left OFF.');
  _sigDeleteTriggers(['sendApprovedSignals']);
  PropertiesService.getScriptProperties().setProperty('SIGNALS_SENDING', 'on');
  ScriptApp.newTrigger('sendApprovedSignals').timeBased().everyMinutes(30).create();
  Logger.log('Sending ON (' + mode + '). APPROVED rows go out within 30 minutes.');
}

function disableSending() {
  _sigDeleteTriggers(['sendApprovedSignals']);
  PropertiesService.getScriptProperties().setProperty('SIGNALS_SENDING', 'off');
  Logger.log('Sending OFF. Drafting continues; APPROVED rows wait.');
}

/* ---------------------------------------------------------------
   Read-only layout preview (draft-only trial)
   --------------------------------------------------------------- */

/* Show the stored, approved-for-sending HTML for one queue row in a
   dialog. Sends nothing; writes nothing. */
function previewSignalEmail(messageId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SIG_QUEUE);
  if (!sh || sh.getLastRow() < 2) throw new Error('No Signals Queue rows to preview.');
  var ids = sh.getRange(2, SIG_C.message_id, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(messageId)) return _sigShowPreview(_sigRow(sh, i + 2));
  }
  throw new Error('No queue row with message_id ' + messageId);
}

/* Same, for the queue row of the currently selected cell. */
function previewSelectedSignal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();
  var row = ss.getActiveRange() ? ss.getActiveRange().getRow() : 0;
  if (!sh || sh.getName() !== SIG_QUEUE || row < 2) throw new Error('Select a cell in a Signals Queue row first.');
  return _sigShowPreview(_sigRow(sh, row));
}

function _sigShowPreview(r) {
  var esc = function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var stale = _sigHash(r.to, r.subject, r.body, r.html) !== String(r.content_hash);
  var meta = '<div style="font:12px/1.6 Menlo,monospace;color:#555;background:#f4f1ea;border:1px solid #ddd;padding:10px 12px;margin:0 0 16px">' +
    '<b>PREVIEW ONLY — nothing is sent from this window</b><br>' +
    'To: ' + esc(r.to) + '<br>From: ' + esc(SIG_FROM_NAME) + ' &lt;' + esc(SIG_FROM) + '&gt;<br>' +
    'Subject: ' + esc(r.subject) + '<br>' +
    'Status: ' + esc(r.status) + ' · expires ' + esc(r.expires_at) + ' · signals: ' + esc(r.signals) +
    (stale ? '<br><b style="color:#a33">Stored HTML does not match the text cells -- edit or re-approve before sending.</b>' : '') +
    '</div>';
  var out = HtmlService.createHtmlOutput(meta + String(r.html)).setWidth(640).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(out, 'Signal preview: ' + String(r.garden_name));
  return out;
}

function _sigProp(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '')
    .split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String);
}

function _sigSendingOn() {
  return PropertiesService.getScriptProperties().getProperty('SIGNALS_SENDING') === 'on';
}

function _sigDeleteTriggers(names) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names.indexOf(t.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(t);
  });
}

/* A queue or log whose header row doesn't match this version is renamed
   to "<name> (archived <date>)". Nothing is copied across, so an old
   approval can never be sent by this code. Archived rows have their
   APPROVED/SENDING statuses changed to ARCHIVED for the same reason. */
function _sigArchiveOldSchema(ss) {
  var out = [], stamp = Utilities.formatDate(new Date(), SIG_TZ, 'yyyy-MM-dd HHmm');
  [[SIG_QUEUE, SIG_QUEUE_HEADERS], [SIG_LOG, SIG_LOG_HEADERS]].forEach(function (spec) {
    var sh = ss.getSheetByName(spec[0]);
    if (!sh || _sigHeadersMatch(sh, spec[1])) return;
    var name = spec[0] + ' (archived ' + stamp + ')';
    if (sh.getLastRow() > 1 && sh.getLastColumn() > 0) {
      var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      var sc = hdr.indexOf('status');
      if (sc > -1) {
        var rng = sh.getRange(2, sc + 1, sh.getLastRow() - 1, 1), vals = rng.getValues();
        rng.setValues(vals.map(function (r) { return [/^(APPROVED|SENDING|DRAFT)$/.test(String(r[0])) ? 'ARCHIVED' : r[0]]; }));
      }
    }
    sh.setName(name);
    out.push(name);
  });
  return out;
}

function _sigHeadersMatch(sh, headers) {
  if (sh.getLastColumn() < headers.length) return false;
  var hdr = sh.getRange(1, 1, 1, headers.length).getValues()[0].map(String);
  return headers.every(function (h, i) { return hdr[i] === h; });
}

/* Refuse to run against a sheet this version didn't create. */
function _sigSchemaOk(ss) {
  var q = ss.getSheetByName(SIG_QUEUE), l = ss.getSheetByName(SIG_LOG);
  var ok = (!q || _sigHeadersMatch(q, SIG_QUEUE_HEADERS)) && (!l || _sigHeadersMatch(l, SIG_LOG_HEADERS));
  if (!ok) {
    Logger.log('Signals: sheet columns are from an older version. Run installSignals() to archive them. Nothing drafted or sent.');
    try { MailApp.sendEmail(NOTIFY_EMAIL, 'Garden signals paused: run installSignals()',
      'The Signals Queue / Log sheets are from an older version of Signals.gs. Nothing will be drafted or sent until installSignals() is run, which archives them.'); } catch (e) {}
  }
  return ok;
}

function runSignals() { return _sigRun({ forceWeekly: false }); }
function previewSignalsNow() { return _sigRun({ forceWeekly: true }); }

/* Installable onEdit: any change to to/subject/body re-freezes the
   content and sends the row back to DRAFT. */
function onSignalsEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== SIG_QUEUE) return;
  var c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
  var touched = SIG_EDITABLE.some(function (h) { return SIG_C[h] >= c0 && SIG_C[h] <= c1; });
  if (!touched) return;
  var r0 = Math.max(2, e.range.getRow()), r1 = e.range.getRow() + e.range.getNumRows() - 1;
  // Wait for any send in progress to finish. If we still can't get the
  // lock, refreeze anyway: the sender re-checks each row after claiming
  // it, so a row edited mid-send is never delivered in its old form.
  var lock = LockService.getScriptLock(), held = false;
  try { held = lock.tryLock(25000); } catch (err) {}
  try {
    for (var r = r0; r <= r1; r++) {
      var st = String(sh.getRange(r, SIG_C.status).getValue());
      if (/^(SENT|SENDING|CHECK)$/.test(st)) {
        // Sent history is not rewritten. Restore a single-cell edit if we can.
        if (r0 === r1 && e.range.getNumColumns() === 1 && e.oldValue !== undefined) e.range.setValue(e.oldValue);
        _sigSet(sh, r, { note: 'Edit ignored: this message is ' + st + '. The sent version is what was approved.' });
        continue;
      }
      _sigRefreeze(sh, r, 'Edited ' + new Date().toISOString() + ' -- re-approve');
    }
  } finally { if (held) lock.releaseLock(); }
}

function sendApprovedSignals() {
  if (!_sigSendingOn()) { Logger.log('Signals: sending is OFF (run enableSending() when ready). Nothing sent.'); return 0; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!_sigSchemaOk(ss)) return 0;
    var sh = _sigQueueSheet(ss);
    if (sh.getLastRow() < 2) return 0;
    var props = PropertiesService.getScriptProperties();
    var pilot = _sigPilot(ss), optout = _sigOptouts(ss);
    var mode = null, sent = 0;

    // The snapshot only finds candidate rows. Each one is re-read just
    // before it is claimed, and again after the claim, so an edit or
    // status change made while earlier rows were sending always wins.
    var statuses = sh.getRange(2, SIG_C.status, sh.getLastRow() - 1, 1).getValues();
    var candidates = [];
    statuses.forEach(function (s, i) { if (/^(APPROVED|SENDING)$/.test(String(s[0]))) candidates.push(i + 2); });

    for (var c = 0; c < candidates.length; c++) {
      var row = candidates[c];
      var r = _sigRow(sh, row), status = String(r.status), id = String(r.message_id);

      // A row left in SENDING means a previous run stopped mid-send.
      if (status === 'SENDING') {
        if (props.getProperty('sent:' + id)) _sigSet(sh, row, { status: 'SENT', note: 'Reconciled from send record' });
        else _sigSet(sh, row, { status: 'CHECK', note: 'Delivery uncertain -- check Sent mail for "' + r.subject + '" before doing anything. Not retried.' });
        continue;
      }
      if (status !== 'APPROVED') continue;

      var problem = _sigSendCheck(r, props, pilot, optout, sh, row);
      if (problem) continue;
      if (mode === null) mode = _sigSendMode();
      if (!mode) { _sigSet(sh, row, { status: 'ERROR', note: 'Cannot send as ' + SIG_FROM + ' (no send-as alias) -- not sent' }); continue; }

      // Claim, then confirm nothing changed between the read and the claim.
      _sigSet(sh, row, { status: 'SENDING', note: 'Sending ' + new Date().toISOString() });
      SpreadsheetApp.flush();
      var now2 = _sigRow(sh, row);
      if (String(now2.status) !== 'SENDING') {
        // Someone cancelled or changed the status during the claim: respect it.
        _sigSet(sh, row, { note: 'Not sent: status changed to ' + now2.status + ' while being claimed' });
        continue;
      }
      if (now2.message_id !== r.message_id ||
          _sigHash(now2.to, now2.subject, now2.body, now2.html) !== String(r.content_hash) ||
          String(now2.content_hash) !== String(r.content_hash)) {
        _sigRefreeze(sh, row, 'Changed while being claimed for sending -- re-approve', true);
        continue;
      }
      try {
        var opts = { name: SIG_FROM_NAME, replyTo: SIG_FROM, htmlBody: String(r.html) };
        if (mode === 'alias') opts.from = SIG_FROM;          // primary account: omit `from`
        GmailApp.sendEmail(_sigEmails(r.to).join(','), String(r.subject), String(r.body), opts);
      } catch (err) {
        _sigSet(sh, row, { status: 'ERROR', note: String(err).slice(0, 300) });
        continue;
      }
      var at = new Date().toISOString();
      props.setProperty('sent:' + id, at);
      _sigSet(sh, row, { status: 'SENT', sent_at: at, note: '' });
      sent++;
    }
    return sent;
  } finally {
    lock.releaseLock();
  }
}

/* Returns true (and marks the row) if this approved row must not send. */
function _sigSendCheck(r, props, pilot, optout, sh, row) {
  var id = String(r.message_id);
  if (!id) { _sigSet(sh, row, { status: 'ERROR', note: 'Missing message_id' }); return true; }
  if (props.getProperty('sent:' + id)) { _sigSet(sh, row, { status: 'SENT', note: 'Already sent (' + props.getProperty('sent:' + id) + ')' }); return true; }
  var exp = Date.parse(String(r.expires_at));
  if (!isFinite(exp) || Date.now() > exp) { _sigSet(sh, row, { status: 'EXPIRED', note: 'Expired ' + r.expires_at + ' -- not sent' }); return true; }
  if (_sigHash(r.to, r.subject, r.body, r.html) !== String(r.content_hash)) {
    _sigRefreeze(sh, row, 'Content changed after approval -- re-approve'); return true;
  }
  var to = _sigEmails(r.to);
  var allowed = pilot[String(r.garden_id)] || [];
  var blocked = to.filter(function (e) { return allowed.indexOf(e) === -1 || optout.indexOf(e) > -1; });
  if (!to.length || blocked.length) {
    _sigSet(sh, row, { status: 'SKIP', note: to.length ? 'Not in pilot or opted out: ' + blocked.join(', ') : 'No recipients' }); return true;
  }
  return false;
}

/* One queue row, freshly read, as {header: value}. */
function _sigRow(sh, row) {
  var vals = sh.getRange(row, 1, 1, SIG_QUEUE_HEADERS.length).getValues()[0], o = {};
  SIG_QUEUE_HEADERS.forEach(function (h, i) { o[h] = vals[i]; });
  return o;
}

/* ---------------------------------------------------------------
   Drafting run
   --------------------------------------------------------------- */

function _sigRun(opts) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) { Logger.log('Signals: another run holds the lock'); return []; }
  try { return _sigRunLocked(opts); } finally { lock.releaseLock(); }
}

function _sigRunLocked(opts) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!_sigSchemaOk(ss)) return [];
  var now = new Date();
  var pilot = _sigPilot(ss), optout = _sigOptouts(ss);
  var gardens = _sigGardens(Object.keys(pilot));
  if (!gardens.length) { Logger.log('Signals: no pilot gardens (add rows to "' + SIG_PILOT + '")'); return []; }

  var weekly = opts.forceWeekly || _sigMelbDay(now) === SIG_WEEKLY_DAY;
  var fetchedAt = now.toISOString();
  var weather = _sigFetchWeather(gardens);
  // The older 'nearby' (unfiltered 30-day sightings) and 'flowering'
  // (the garden's own plant list) notes are OFF for the pilot: they fail
  // the reliability checks or explain the garden to its own steward.
  // Script property SIGNALS_LEGACY_OBS=on re-enables them.
  var legacy = _sigProp('SIGNALS_LEGACY_OBS').indexOf('on') > -1;
  var nearby = weekly && legacy ? _sigFetchNearby(gardens) : {};
  var season = weekly ? _sigFetchSeason(gardens, now) : {};
  var library = weekly && legacy ? _sigPlantLibrary() : null;
  var log = _sigLogIndex(ss);
  var month = _sigMelbMonth(now);
  var drafts = [], logRows = [];

  gardens.forEach(function (g) {
    var to = (pilot[g.garden_id] || []).filter(function (e) { return optout.indexOf(e) === -1; });
    if (!to.length) return;
    var items = [];
    if (weather[g.garden_id]) _sigWeatherSignals(g, weather[g.garden_id], month, fetchedAt).forEach(function (s) {
      if (!_sigCooling(log, g.garden_id, s.type, now, s.key)) items.push(s);
    });
    var last = _sigLastAny(log, g.garden_id, SIG_OBS);
    if (weekly && (!last || (now - last) / 864e5 >= SIG_GARDEN_GAP_DAYS)) {
      if (season[g.garden_id] && !_sigCooling(log, g.garden_id, 'season', now)) {
        var sn = _sigSeasonSignal(g, season[g.garden_id], log, now, fetchedAt); if (sn) items.push(sn);
      }
      if (legacy && nearby[g.garden_id] && !_sigCooling(log, g.garden_id, 'nearby', now)) {
        var n = _sigNearbySignal(g, nearby[g.garden_id], log, fetchedAt); if (n) items.push(n);
      }
      if (legacy && library && !_sigCooling(log, g.garden_id, 'flowering', now)) {
        var f = _sigFloweringSignal(g, library, month, log); if (f) items.push(f);
      }
    }
    var chosen = _sigChoose(items);
    if (!chosen.length) return;

    var id = Utilities.getUuid();
    var card = { garden_name: g.garden_name, score: g.score, rating: g.rating, provisional: g.provisional, profile: g.profile };
    var draft, html;
    if (chosen[0].type === 'season') {
      // Seasonal update: the steward email template (templates/email/steward_update.py).
      var cond = _sigSeasonSoFar(g, now);
      var model = chosen[0].model;
      model.garden = g.garden_name; model.greeting = g.stewards ? 'Hi ' + _sigFirstNames(g.stewards) + ',' : 'Hello,';
      model.profile = g.profile; model.dateLabel = _sigDate(Utilities.formatDate(now, SIG_TZ, 'yyyy-MM-dd'), true).replace(/^\w+ /, '') + ' ' + Utilities.formatDate(now, SIG_TZ, 'yyyy');
      model.season = _sigSeasonName(month);
      model.stats = cond ? cond.stats : null;
      model.sun = _sigSunrise(g, now);
      model.lookups = _sigLookups(g, now);
      model.studio = _sigStudioPanel(g);
      model.record = _sigRecordSection(g);
      if (model.record) chosen[0].evidence.record = { source: SIG_SITE + '/js/reg-score.js (the Registry scoring engine) on ' + SIG_SITE + '/data registry record',
        score: model.record.score, pillars: model.record.pillars.map(function (p) { return p.key + ' ' + p.score + '/' + p.max; }), gap: model.record.gap.key };
      model.studioNote = String(PropertiesService.getScriptProperties().getProperty('SIGNALS_STUDIO_NOTE') || '').trim().replace(/\{garden\}/g, g.garden_name);
      if (cond) chosen[0].evidence.conditions = cond.evidence;
      if (model.sun) chosen[0].evidence.sun = { source: 'Open-Meteo forecast sunrise; first light = civil dawn (sun 6° below horizon)', date: model.sun.date, first_light: model.sun.firstLight, sunrise: model.sun.sunrise };
      if (model.lookups) chosen[0].evidence.lookups = { source: 'EVC lookup log (distinct places, ~100m; no addresses)', near_10km: model.lookups.near, statewide: model.lookups.all, since: '1 ' + model.lookups.sinceLabel };
      card.model = model;
      draft = { subject: g.garden_name + ' - ' + model.season.charAt(0).toUpperCase() + model.season.slice(1) + ' Update', body: _sigUpdateText(model) };
      html = _sigUpdateHtml(model, card);
    } else {
      draft = _sigCompose(g, chosen);
      html = _sigHtml(draft.body, card);
    }
    var expires = chosen.map(function (s) { return s.expires; }).sort()[0];
    var evidence = JSON.stringify({ garden_id: g.garden_id, generated_at: fetchedAt,
      coordinates: { lat: g.lat, lng: g.lng, note: 'public display coordinates, offset ~250m' },
      signals: chosen.map(function (s) { return { type: s.type, evidence: s.evidence }; }) });
    var rec = {
      created_at: fetchedAt, message_id: id, garden_id: g.garden_id, garden_name: g.garden_name,
      to: to.join(', '), signals: chosen.map(function (s) { return s.type; }).join(', '),
      subject: draft.subject, body: draft.body, status: 'DRAFT', expires_at: expires,
      sent_at: '', note: '', content_hash: _sigHash(to.join(', '), draft.subject, draft.body, html),
      evidence: evidence, card: JSON.stringify(card), html: html };
    drafts.push(SIG_QUEUE_HEADERS.map(function (h) { return rec[h]; }));
    chosen.forEach(function (s) { logRows.push([fetchedAt, g.garden_id, s.type, s.key || '', id]); });
  });

  _sigExpireStale(ss);
  if (drafts.length) {
    var q = _sigQueueSheet(ss);
    q.getRange(q.getLastRow() + 1, 1, drafts.length, SIG_QUEUE_HEADERS.length).setValues(drafts);
    var l = _sigSheet(ss, SIG_LOG, SIG_LOG_HEADERS);
    l.getRange(l.getLastRow() + 1, 1, logRows.length, SIG_LOG_HEADERS.length).setValues(logRows);
    _sigNotify(ss, drafts);
  }
  Logger.log('Signals: ' + gardens.length + ' pilot gardens checked, ' + drafts.length + ' drafts' + (weekly ? ' (weekly run)' : ''));
  return drafts;
}

/* One lead signal + at most one supporting observation. Alerts lead. */
function _sigChoose(items) {
  var alerts = SIG_ALERTS.map(function (t) { return items.filter(function (s) { return s.type === t; })[0]; }).filter(Boolean);
  var obs = SIG_OBS.map(function (t) { return items.filter(function (s) { return s.type === t; })[0]; }).filter(Boolean);
  var lead = alerts[0] || obs[0];
  if (!lead) return [];
  // A "season around you" note stands on its own; nothing is appended to it.
  var support = alerts.length ? obs[0] : (lead.type === 'season' ? null : obs[1]);
  return support ? [lead, support] : [lead];
}

/* ---------------------------------------------------------------
   Gardens (pilot only)
   --------------------------------------------------------------- */

function _sigGardens(ids) {
  if (!ids.length) return [];
  var reg = _sigJson(SIG_SITE + '/data/registry.json');
  var locs = _sigJson(SIG_SITE + '/data/garden-locations.json') || [];
  if (!reg || !reg.gardens) return [];
  var loc = {};
  locs.forEach(function (l) { loc[l.garden_id] = l; });
  var list = reg.gardens.filter(function (g) {
    return ids.indexOf(g.garden_id) > -1 && !g.demo && !/demo/i.test(String(g.status || '')) &&
      loc[g.garden_id] && isFinite(Number(loc[g.garden_id].display_lat));
  });
  var resps = list.length ? UrlFetchApp.fetchAll(list.map(function (g) {
    return { url: SIG_SITE + '/' + String(g.data_file || '').replace(/^\//, ''), muteHttpExceptions: true };
  })) : [];
  return list.map(function (g, i) {
    var rec = {};
    try { if (resps[i].getResponseCode() === 200) rec = JSON.parse(resps[i].getContentText()); } catch (e) {}
    var bio = rec.biodiversity || {}, hab = rec.habitat || {};
    return {
      garden_id: g.garden_id, garden_name: g.garden_name || rec.garden_name || g.garden_id,
      lat: Number(loc[g.garden_id].display_lat), lng: Number(loc[g.garden_id].display_lng),
      stewards: String(rec.stewards || '').trim(),
      species: (bio.species_list || []).map(function (s) { return typeof s === 'string' ? s : (s && (s.name || s.botanical_name)) || ''; }).filter(String),
      fauna: (hab.fauna_sightings || []).map(function (f) { return String(f.species || '').toLowerCase(); }),
      faunaRecs: (hab.fauna_sightings || []).map(function (f) { return { name: String(f.species || ''), verified: f.verified === true }; }),
      water: hab.has_water_feature === true || /\b(pond|dam|wetland|frog)/i.test(String(rec.description || '')),
      score: typeof g.score === 'number' ? g.score : null, rating: (g.rating && g.rating.current) || '',
      nextLevel: (g.rating && g.rating.next) || '', toNext: g.rating && typeof g.rating.points_to_next === 'number' ? g.rating.points_to_next : null,
      record: rec,
      provisional: /provisional/i.test(String(g.status || '')) || /self_reported/i.test(String(g.verification_level || '')),
      profile: SIG_SITE + (String(g.profile_url || '').charAt(0) === '/' ? '' : '/') + String(g.profile_url || '')
    };
  });
}

/* ---------------------------------------------------------------
   Weather (Open-Meteo). daily[0..13] = past 14 days, [14] = today.
   --------------------------------------------------------------- */

function _sigFetchWeather(gardens) {
  var out = {};
  UrlFetchApp.fetchAll(gardens.map(function (g) {
    return { muteHttpExceptions: true, url: 'https://api.open-meteo.com/v1/forecast?latitude=' + g.lat.toFixed(3) +
      '&longitude=' + g.lng.toFixed(3) +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration' +
      '&past_days=14&forecast_days=5&timezone=Australia%2FMelbourne' };
  })).forEach(function (r, i) {
    try { if (r.getResponseCode() === 200) out[gardens[i].garden_id] = JSON.parse(r.getContentText()).daily; } catch (e) {}
  });
  return out;
}

function _sigWeatherSignals(g, d, month, fetchedAt) {
  var out = [], T = 14;
  if (!d || !d.time || d.time.length < T + 5) return out;
  var tmax = d.temperature_2m_max || [], tmin = d.temperature_2m_min || [],
      rain = d.precipitation_sum || [], et0 = d.et0_fao_evapotranspiration || [];
  // All values in [a, b] must be real numbers, or the signal is skipped.
  var ok = function (arr, a, b) {
    for (var i = a; i <= b; i++) if (typeof arr[i] !== 'number' || !isFinite(arr[i])) return false;
    return true;
  };
  var ev = function (src, idx, extra) {
    var o = { source: 'Open-Meteo forecast API (modelled, not measured at the garden)', retrieved_at: fetchedAt,
              dates: idx.map(function (i) { return d.time[i]; }) };
    Object.keys(src).forEach(function (k) { o[k] = idx.map(function (i) { return src[k][i]; }); });
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  };

  // Heat / frost: 1-2 days ahead only, so there is time to approve and act.
  if (ok(tmax, T + 1, T + 2)) {
    var hiDay = tmax[T + 1] >= tmax[T + 2] ? T + 1 : T + 2;
    if (tmax[hiDay] >= SIG_HEAT_C) out.push({ type: 'heat', key: d.time[hiDay], subject: 'heat forecast for ' + _sigDate(d.time[hiDay], true),
      expires: _sigStartOf(d.time[hiDay]),
      evidence: ev({ temperature_2m_max: tmax }, [T + 1, T + 2]),
      text: 'The forecast for your area shows ' + Math.round(tmax[hiDay]) + '°C on ' + _sigDate(d.time[hiDay]) + '. ' +
        'Anything planted in the last year is most at risk. A deep, slow soak the evening before does far more than a daily sprinkle, ' +
        'and a shallow dish of water at ground level helps lizards, birds and bees too.' });
  }
  if (ok(tmin, T + 1, T + 2)) {
    var loDay = tmin[T + 1] <= tmin[T + 2] ? T + 1 : T + 2;
    if (tmin[loDay] <= SIG_FROST_C) out.push({ type: 'frost', key: d.time[loDay], subject: 'possible frost on ' + _sigDate(d.time[loDay], true),
      expires: _sigStartOf(d.time[loDay]),
      evidence: ev({ temperature_2m_min: tmin }, [T + 1, T + 2]),
      text: 'A frost is possible on the morning of ' + _sigDate(d.time[loDay]) + ', with a forecast low around ' + Math.round(tmin[loDay]) +
        '°C in your area. Most indigenous plants take it in their stride, but young or tender plantings in open, low spots are worth checking. ' +
        'Leave the leaf litter where it is; it is doing its job.' });
  }

  // Soaking rain: tomorrow + the two days after.
  if (ok(rain, T + 1, T + 3)) {
    var wet = rain[T + 1] + rain[T + 2] + rain[T + 3];
    if (wet >= SIG_RAIN_MM) {
      var autumn = month >= 3 && month <= 6;
      var span = _sigDate(d.time[T + 1]) + ' and ' + _sigDate(d.time[T + 3]);
      out.push({ type: 'rain', key: d.time[T + 1], subject: autumn ? 'the planting window opens' : 'rain forecast from ' + _sigDate(d.time[T + 1], true),
        expires: _sigStartOf(d.time[T + 1]),
        evidence: ev({ precipitation_sum: rain }, [T + 1, T + 2, T + 3], { total_mm: Math.round(wet * 10) / 10 }),
        text: autumn
          ? 'Around ' + Math.round(wet) + 'mm of rain is forecast for your area between ' + span + '. In autumn this is when the planting window properly opens: warm soil, moisture arriving. If there is a gap you have been meaning to fill, this is the moment.'
          : 'Around ' + Math.round(wet) + 'mm of rain is forecast for your area between ' + span + '. Afterwards is a good time for a slow walk around: where water pools and where it runs off tells you a lot about your garden.' });
    }
  }

  // Dry fortnight: modelled rain vs reference evapotranspiration (ET0).
  if (ok(rain, 0, T + 4) && ok(et0, 0, T - 1)) {
    var pr = 0, pe = 0, next = 0;
    for (var p = 0; p < T; p++) { pr += rain[p]; pe += et0[p]; }
    for (var n = T; n <= T + 4; n++) next += rain[n];
    if (pe - pr >= SIG_DRY_DEFICIT && next < SIG_DRY_NEXT_MM)
      out.push({ type: 'dry', key: d.time[T], subject: 'a dry stretch',
        expires: _sigStartOf(d.time[T + 2]),
        evidence: ev({ precipitation_sum: rain, et0_fao_evapotranspiration: et0 }, _sigRange(0, T - 1),
          { rain_14d_mm: Math.round(pr), et0_14d_mm: Math.round(pe), rain_next_5d_mm: Math.round(next),
            note: 'ET0 is reference evapotranspiration for well-watered grass: atmospheric demand, not measured soil drying' }),
        text: 'Modelled conditions around your garden suggest rainfall has been below atmospheric water demand over the past fortnight, ' +
          'with little rain forecast in the next few days. Established indigenous plants mostly ride this out. ' +
          'It may be worth checking the soil beside recent plantings.' });
  }
  return out;
}

/* ---------------------------------------------------------------
   Nearby sightings (Atlas of Living Australia)
   --------------------------------------------------------------- */

function _sigFetchNearby(gardens) {
  var from = Utilities.formatDate(new Date(Date.now() - SIG_ALA_DAYS * 864e5), 'UTC', 'yyyy-MM-dd');
  var out = {};
  var reqs = gardens.map(function (g) {
    return { muteHttpExceptions: true, url: 'https://biocache-ws.ala.org.au/ws/occurrences/search?q=*:*' +
      '&lat=' + g.lat.toFixed(4) + '&lon=' + g.lng.toFixed(4) + '&radius=' + SIG_ALA_RADIUS_KM +
      '&fq=' + encodeURIComponent('occurrence_date:[' + from + 'T00:00:00Z TO *]') +
      '&pageSize=100&sort=occurrence_date&dir=desc' };   // ALA returns 503 above pageSize=100
  });
  UrlFetchApp.fetchAll(reqs).forEach(function (r, i) {
    try {
      if (r.getResponseCode() !== 200) return;
      var bySp = {};
      (JSON.parse(r.getContentText()).occurrences || []).forEach(function (o) {
        var cls = String(o.classs || o['class'] || '').toLowerCase();
        var groups = (o.speciesGroups || []).join(' ').toLowerCase();
        if (SIG_FAUNA_CLASSES.indexOf(cls) === -1 && !/birds|amphibians|frogs|reptiles|mammals|insects|butterflies/.test(groups)) return;
        var sci = String(o.scientificName || o.raw_scientificName || '').trim();
        if (sci.split(/\s+/).length < 2) return;
        var common = String(o.vernacularName || o.raw_vernacularName || '').trim();
        if (SIG_INTRODUCED.indexOf(common.toLowerCase()) > -1) return;
        var k = sci.toLowerCase();
        var sp = bySp[k] || (bySp[k] = { sci: sci, common: common, cls: cls, records: [] });
        var when = typeof o.eventDate === 'number' ? new Date(o.eventDate).toISOString().slice(0, 10) : String(o.eventDate || o.occurrenceDate || '');
        sp.records.push({ id: String(o.uuid || ''), date: when, dataset: String(o.dataResourceName || ''),
          url: o.uuid ? 'https://biocache.ala.org.au/occurrences/' + o.uuid : '' });
      });
      out[gardens[i].garden_id] = { query: reqs[i].url, species: Object.keys(bySp).map(function (k) { return bySp[k]; }) };
    } catch (e) {}
  });
  return out;
}

function _sigNearbySignal(g, res, log, fetchedAt) {
  var mentioned = _sigKeysFor(log, g.garden_id, 'nearby', 90);
  var fresh = res.species.filter(function (s) {
    var lc = (s.common || s.sci).toLowerCase();
    if (mentioned.indexOf(s.sci.toLowerCase()) > -1) return false;
    return !g.fauna.some(function (f) { return f && (lc.indexOf(f) > -1 || f.indexOf(lc) > -1); });
  });
  if (!fresh.length) return null;
  var rank = { aves: 0, amphibia: 1, reptilia: 2, insecta: 3, mammalia: 4 };
  var rk = function (c) { return rank.hasOwnProperty(c) ? rank[c] : 5; };
  fresh.sort(function (a, b) { return (rk(a.cls) - rk(b.cls)) || (b.records.length - a.records.length); });
  var pick = fresh.slice(0, 3);
  var names = pick.map(function (s) { return s.common ? s.common + ' (' + s.sci + ')' : s.sci; });
  return { type: 'nearby', key: pick.map(function (s) { return s.sci.toLowerCase(); }).join('|'),
    subject: 'who\'s been seen nearby', expires: new Date(Date.now() + 7 * 864e5).toISOString(),
    evidence: { source: 'Atlas of Living Australia biocache', retrieved_at: fetchedAt, query: res.query,
      radius_km: SIG_ALA_RADIUS_KM, window_days: SIG_ALA_DAYS,
      species: pick.map(function (s) { return { scientific: s.sci, common: s.common, class: s.cls,
        record_count: s.records.length, records: s.records.slice(0, 5) }; }) },
    text: 'Recorded within about 1.5km of your garden in the past month, according to the Atlas of Living Australia: ' +
      _sigJoin(names) + '. Have any of them visited you? Send us a photo or a line and we\'ll review it with you for your garden\'s record.' };
}


/* ---------------------------------------------------------------
   Season around you (Atlas of Living Australia, last 30 days)

   Writes only when a reliable, recent record gives this steward a good
   reason to care. Finding records and writing nothing is normal.

     Freshness   lead record observed within the last 30 days, judged from
                 the record's own date (observation and retrieval dates are
                 both kept in evidence).
     Reliability coordinate uncertainty <= 1km (server side), species rank,
                 exact date, research-grade iNaturalist IDs, not on the
                 GRIIS introduced-species list (unknown status = excluded).
     Distance    <= 1.5km: local activity, still needs a connection to the
                 garden or a seasonal reason.
                 1.5-5km: landscape context, only with a clear seasonal
                 reason or a habitat/unresolved-observation link, and the
                 approximate distance is stated.
                 > 5km: excluded in the pilot.
   Historical records are never the reason to write.
   --------------------------------------------------------------- */

var SIG_SEASON_DAYS = 30, SIG_SEASON_UNC_M = 1000, SIG_LOCAL_M = 1500, SIG_LANDSCAPE_M = 5000;
var SIG_GRIIS_LIST = 'dr9884';   // GRIIS: Global Register of Introduced and Invasive Species - Australia

/* Curated "why now" notes. Short, conservative, checked against a cited
   source and reviewed by a person before being added. An entry without a
   source is ignored. Keyed by binomial, or by 'family:<name>'. */
var SIG_WHY_NOW = {
  'Agrotis infusa': { months: [9, 10, 11, 12],
    text: 'Bogong Moths migrate each spring from inland Queensland, New South Wales and western Victoria to the Australian Alps, and can turn up around Melbourne along the way.',
    source: { name: 'Zoos Victoria: Bogong Moths', url: 'https://www.zoo.org.au/moths', checked: '2026-10-31' } }
};

function _sigFetchSeason(gardens, now) {
  var from = Utilities.formatDate(new Date(now.getTime() - SIG_SEASON_DAYS * 864e5), 'UTC', 'yyyy-MM-dd');
  var fq = ['occurrence_date:[' + from + 'T00:00:00Z TO *]',
            'coordinate_uncertainty:[0.1 TO ' + SIG_SEASON_UNC_M + '] AND rank:(species OR subspecies OR variety)'];
  var base = function (g) {
    return 'https://biocache-ws.ala.org.au/ws/occurrences/search?q=*:*' +
      '&lat=' + g.lat.toFixed(4) + '&lon=' + g.lng.toFixed(4) + '&radius=' + (SIG_LANDSCAPE_M / 1000) +
      fq.map(function (f) { return '&fq=' + encodeURIComponent(f); }).join('') + '&pageSize=100&sort=occurrence_date&dir=desc';
  };
  var out = {};
  gardens.forEach(function (g) {
    var occ = [], total = 0, ok = false;
    for (var page = 0; page < 3; page++) {          // ALA returns 503 above pageSize=100, so page instead
      var r = UrlFetchApp.fetch(base(g) + '&startIndex=' + page * 100, { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) break;
      try { var j = JSON.parse(r.getContentText()); } catch (e) { break; }
      ok = true; total = j.totalRecords || 0; occ = occ.concat(j.occurrences || []);
      if (occ.length >= total || !(j.occurrences || []).length) break;
    }
    if (ok) out[g.garden_id] = { query: base(g), total: total, occurrences: occ };
  });
  var names = {};
  Object.keys(out).forEach(function (k) { out[k].occurrences.forEach(function (o) { names[_sigSci(o.scientificName)] = true; }); });
  var introduced = _sigIntroduced(Object.keys(names));
  Object.keys(out).forEach(function (k) { out[k].introduced = introduced; });
  return out;
}

/* name -> true (introduced), false (not on GRIIS), null (couldn't check) */
function _sigIntroduced(names) {
  var cache = CacheService.getScriptCache(), result = {}, todo = [];
  names.forEach(function (n) {
    var c = cache.get('griis:' + n);
    if (c === '1' || c === '0') result[n] = c === '1'; else todo.push(n);
  });
  if (todo.length) {
    var resps = UrlFetchApp.fetchAll(todo.map(function (n) {
      return { muteHttpExceptions: true, url: 'https://lists-ws.ala.org.au/ws/speciesListItems/' + SIG_GRIIS_LIST + '?q=' + encodeURIComponent(n) };
    }));
    resps.forEach(function (r, i) {
      var n = todo[i];
      try {
        if (r.getResponseCode() !== 200) { result[n] = null; return; }
        var items = JSON.parse(r.getContentText());
        if (!Array.isArray(items)) { result[n] = null; return; }
        var hit = items.some(function (it) { return _sigSci(it.scientificName || it.name || it.rawScientificName) === n; });
        result[n] = hit;
        cache.put('griis:' + n, hit ? '1' : '0', 21600);
      } catch (e) { result[n] = null; }
    });
  }
  return result;
}

/* "Hirundo (Hirundo) neoxena neoxena" -> "Hirundo neoxena" (binomial, no subgenus) */
function _sigSci(n) {
  return String(n || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
}

function _sigSeasonName(month) {
  return month >= 9 && month <= 11 ? 'spring' : (month === 12 || month <= 2) ? 'summer' : month <= 5 ? 'autumn' : 'winter';
}

function _sigDistM(lat1, lng1, lat2, lng2) {
  var r = function (x) { return x * Math.PI / 180; };
  var h = Math.pow(Math.sin(r(lat2 - lat1) / 2), 2) + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.pow(Math.sin(r(lng2 - lng1) / 2), 2);
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/* Why a record can't be used (or '' if it can). */
function _sigSeasonReject(o, now, introduced) {
  if (!/^(species|subspecies|variety)$/.test(String(o.taxonRank || ''))) return 'rank';
  var unc = Number(o.coordinateUncertaintyInMeters);
  if (!(unc > 0 && unc <= SIG_SEASON_UNC_M)) return 'location';
  var asserts = o.assertions || [];
  if (asserts.some(function (a) { return /COORDINATE_UNCERTAINTY_METERS_INVALID|PRESUMED_SWAPPED|ZERO_COORDINATE/.test(a); })) return 'location';
  if (o.spatiallyValid === false || !isFinite(Number(o.decimalLatitude))) return 'location';
  if (typeof o.eventDate !== 'number' || asserts.some(function (a) { return /FIRST_OF_|INVALID_DATE|RECORDED_DATE_/.test(a); })) return 'date';
  var age = (now.getTime() - o.eventDate) / 864e5;
  if (age > SIG_SEASON_DAYS || age < -1) return 'older than ' + SIG_SEASON_DAYS + ' days';
  if (/inaturalist/i.test(String(o.dataResourceName || '')) && o.identificationVerificationStatus !== 'research') return 'identification';
  var nat = introduced[_sigSci(o.scientificName)];
  if (nat === true) return 'introduced';
  if (nat !== false) return 'native status unknown';
  return '';
}

function _sigTheme(o) {
  var cls = String(o.classs || '').toLowerCase(), fam = String(o.family || ''), ord = String(o.order || '');
  if (fam === 'Orchidaceae') return 'orchids';
  if ((o.speciesGroups || []).indexOf('Plants') > -1 || /equisetopsida|magnoliopsida|liliopsida/.test(cls)) return 'wildflowers';
  if (cls === 'amphibia') return 'frogs';
  if (cls === 'aves') return 'birds';
  if (cls === 'reptilia') return 'reptiles';
  if (cls === 'mammalia') return 'mammals';
  if (ord === 'Lepidoptera') return 'moths and butterflies';
  if (cls === 'insecta') return 'insects';
  return '';
}

/* Curated horticultural links: plant genera an animal is documented
   using. Only shown when the garden's own species list includes them.
   Same rules as SIG_WHY_NOW: cited source, checked by a person. */
var SIG_PLANT_LINKS = {
  'Agrotis infusa': {
    genera: ['Correa', 'Eucalyptus', 'Grevillea', 'Epacris', 'Leucopogon', 'Prostanthera'],
    relation: 'among the native plants Bogong Moths are known to feed on',
    source: { name: 'PlantingSeeds: Bringing back the Bogong Moth (Alice Owen)', url: 'https://www.ps.org.au/articles/bringing-back-the-bogong-moth', checked: '2026-10-31' } }
};
var SIG_GENUS_LABEL = { Correa: 'Correas', Eucalyptus: 'eucalypts', Grevillea: 'grevilleas', Epacris: 'heaths',
  Leucopogon: 'beard-heaths', Prostanthera: 'mint-bushes', Acacia: 'wattles', Banksia: 'banksias' };

function _sigPlantLink(g, sci) {
  var L = SIG_PLANT_LINKS[sci];
  if (!L || !L.source || !L.source.url) return null;
  var found = [], plants = [];
  g.species.forEach(function (raw) {
    var genus = String(raw).trim().split(/\s+/)[0];
    if (L.genera.indexOf(genus) > -1) { plants.push(raw); if (found.indexOf(genus) === -1) found.push(genus); }
  });
  if (!found.length) return null;
  var labels = found.map(function (x) { return SIG_GENUS_LABEL[x] || x; });
  return { text: 'The ' + _sigJoin(labels) + ' growing at ' + g.garden_name + ' are ' + L.relation + '.',
           genera: found, garden_plants: plants, source: L.source };
}

function _sigWhyNowEntry(sp, month) {
  var w = SIG_WHY_NOW[sp.sci] || SIG_WHY_NOW['family:' + sp.family];
  return w && w.source && w.source.url && w.months.indexOf(month) > -1 ? w : null;
}
function _sigWhyNow(sp, month) { var w = _sigWhyNowEntry(sp, month); return w ? w.text : ''; }

function _sigSeasonSignal(g, res, log, now, fetchedAt) {
  var month = _sigMelbMonth(now), seasonName = _sigSeasonName(month);
  var recentlyFeatured = _sigKeysFor(log, g.garden_id, 'season', 30);
  var featuredCount = {};
  _sigKeysFor(log, g.garden_id, 'season', 3650).forEach(function (k) { featuredCount[k] = (featuredCount[k] || 0) + 1; });
  var own = g.species.map(_sigSci).map(function (n) { return n.toLowerCase(); });
  var rejected = {}, bySp = {};
  var bump = function (why) { rejected[why] = (rejected[why] || 0) + 1; };

  res.occurrences.forEach(function (o) {
    var why = _sigSeasonReject(o, now, res.introduced || {});
    var sci = _sigSci(o.scientificName), common = String(o.vernacularName || '').trim();
    var dist = why ? 0 : _sigDistM(g.lat, g.lng, Number(o.decimalLatitude), Number(o.decimalLongitude));
    if (!why && dist > SIG_LANDSCAPE_M) why = 'beyond ' + (SIG_LANDSCAPE_M / 1000) + 'km';
    if (!why && own.indexOf(sci.toLowerCase()) > -1) why = 'already in garden record';
    if (!why && common && g.fauna.some(function (f) { return f && (f === common.toLowerCase() || common.toLowerCase().indexOf(f) > -1); })) why = 'already in garden record';
    if (!why && recentlyFeatured.indexOf(sci.toLowerCase()) > -1) why = 'featured in the last 30 days';
    if (!why && !_sigTheme(o)) why = 'no theme';
    if (why) return bump(why);
    var sp = bySp[sci] || (bySp[sci] = { sci: sci, common: common, family: String(o.family || ''), theme: _sigTheme(o), records: [] });
    sp.records.push({ id: String(o.uuid), observed: new Date(o.eventDate).toISOString().slice(0, 10),
      age_days: Math.floor((now.getTime() - o.eventDate) / 864e5), distance_m: dist,
      uncertainty_m: Number(o.coordinateUncertaintyInMeters), dataset: String(o.dataResourceName || ''),
      url: 'https://biocache.ala.org.au/occurrences/' + o.uuid });
  });

  // Each species needs a reason this steward would care, stricter with distance.
  var considered = Object.keys(bySp).map(function (k) {
    var sp = bySp[k];
    sp.records.sort(function (a, b) { return (a.distance_m - b.distance_m) || b.observed.localeCompare(a.observed); });
    var best = sp.records[0], local = best.distance_m <= SIG_LOCAL_M;
    var whyNow = _sigWhyNow(sp, month), link = _sigThemeLink(g, sp.theme), plant = _sigPlantLink(g, sp.sci);
    var reason = local ? (whyNow ? 'seasonal' : plant ? 'garden planting' : link.score >= 1 ? 'garden link: ' + link.why : '')
                       : (whyNow ? 'seasonal' : plant ? 'garden planting' : link.score >= 2 ? 'garden link: ' + link.why : '');
    return { sp: sp, rec: best, local: local, whyNow: whyNow, link: link, plant: plant, reason: reason,
             featured: featuredCount[sp.sci.toLowerCase()] || 0 };
  });
  var eligible = considered.filter(function (c) { return c.reason; });
  considered.filter(function (c) { return !c.reason; }).forEach(function () { bump('no reason at this distance'); });
  if (!eligible.length) return null;

  // Local first; then a seasonal reason; then a strong garden link; then
  // species not featured before; then the freshest record; then nearest.
  eligible.sort(function (a, b) {
    return (b.local - a.local) || (!!b.whyNow - !!a.whyNow) || (!!b.plant - !!a.plant) || ((b.link.score >= 2) - (a.link.score >= 2)) ||
      (a.featured - b.featured) || b.rec.observed.localeCompare(a.rec.observed) || (a.rec.distance_m - b.rec.distance_m);
  });
  var lead = eligible[0], sp = lead.sp, rec = lead.rec;
  if (!sp.common) sp.common = _sigCommonName(sp.sci);
  var name = sp.common || sp.sci;
  var article = /^[aeiou]/i.test(name) ? 'an ' : 'a ';
  var km = Math.max(0.5, Math.round(rec.distance_m / 500) / 2);
  var where = lead.local ? 'in the surrounding area' : 'about ' + km + 'km from ' + g.garden_name;
  var when = _sigDate(rec.observed).replace(/^\w+ /, '');
  // A share, not a request: what's happening around the garden, why it's
  // interesting now, and the record. No questions, no asks.
  var lines = [article.charAt(0).toUpperCase() + article.slice(1) + name + (sp.common ? ' (' + sp.sci + ')' : '') + ' was recorded ' + where + ' on ' + when + '.'];
  if (lead.whyNow) lines.push(lead.whyNow);
  if (lead.plant) lines.push(lead.plant.text);
  if (lead.link.text) lines.push(lead.link.text);

  // Also recorded around the garden lately: up to four other reliable,
  // recent, native records within 5km, one per theme for variety.
  var themeOrder = ['orchids', 'mammals', 'birds', 'wildflowers', 'frogs', 'reptiles', 'moths and butterflies', 'insects'];
  var others = considered.filter(function (c) { return c.sp.sci !== sp.sci; });
  others.sort(function (a, b) { return (themeOrder.indexOf(a.sp.theme) - themeOrder.indexOf(b.sp.theme)) || b.rec.observed.localeCompare(a.rec.observed); });
  var seenTheme = {}, also = [];
  others.forEach(function (c) {
    if (also.length >= 4 || seenTheme[c.sp.theme]) return;
    seenTheme[c.sp.theme] = true; also.push(c);
  });
  also.forEach(function (c) { if (!c.sp.common) c.sp.common = _sigCommonName(c.sp.sci); });
  var alsoLines = also.map(function (c) {
    var km2 = Math.max(0.5, Math.round(c.rec.distance_m / 500) / 2);
    return '– ' + (c.sp.common ? c.sp.common + ' (' + c.sp.sci + ')' : c.sp.sci) + ', ' +
      (c.rec.distance_m <= SIG_LOCAL_M ? 'nearby' : 'about ' + km2 + 'km away') + ', ' +
      _sigDate(c.rec.observed).replace(/^\w+ /, '');
  });
  if (alsoLines.length) lines.push('Also recorded around ' + g.garden_name + ' in the past few weeks:\n' + alsoLines.join('\n') + '.');
  // Record links stay in the evidence for review, not in the email.
  // Optional studio note written by you (Script Property SIGNALS_STUDIO_NOTE),
  // e.g. what we're building. {garden} is replaced with the garden's name.
  var studio = String(PropertiesService.getScriptProperties().getProperty('SIGNALS_STUDIO_NOTE') || '').trim();
  if (studio) lines.push(studio.replace(/\{garden\}/g, g.garden_name));
  lines.push('Add your own sightings to ' + g.garden_name + '\'s record: ' + g.profile);
  var subject = lead.local ? article + name + ' recorded nearby' : article + name + ' about ' + km + 'km away';

  return { type: 'season', key: sp.sci.toLowerCase(), subject: subject,
    expires: new Date(Date.now() + 7 * 864e5).toISOString(), standalone: true,
    evidence: { source: 'Atlas of Living Australia biocache + GRIIS introduced-species list (' + SIG_GRIIS_LIST + ')',
      retrieved_at: fetchedAt, query: res.query, records_returned: res.total,
      rules: 'observed within ' + SIG_SEASON_DAYS + ' days; <=' + SIG_LOCAL_M + 'm local (needs a reason); <=' + SIG_LANDSCAPE_M + 'm only with a seasonal reason or strong garden link; beyond excluded',
      distance_note: 'measured from the garden\'s public display coordinates (offset ~250m)',
      excluded: rejected,
      lead: { scientific: sp.sci, common: sp.common, tier: lead.local ? 'local' : 'landscape', reason: lead.reason,
              why_now: lead.whyNow, why_now_source: (_sigWhyNowEntry(sp, month) || {}).source || null, plant_link: lead.plant, garden_link: lead.link.why, previously_featured: lead.featured, record: rec, all_records: sp.records.slice(0, 5) },
      also_recorded: also.map(function (c) { return { scientific: c.sp.sci, common: c.sp.common, theme: c.sp.theme, record: c.rec }; }),
      other_candidates: eligible.slice(1, 6).map(function (c) { return { scientific: c.sp.sci, common: c.sp.common, reason: c.reason, observed: c.rec.observed, distance_m: c.rec.distance_m, url: c.rec.url }; }),
      found_but_no_reason: considered.filter(function (c) { return !c.reason; }).slice(0, 8).map(function (c) { return { scientific: c.sp.sci, common: c.sp.common, distance_m: c.rec.distance_m, observed: c.rec.observed }; }),
      wording_rules: 'records describe the surrounding area or landscape, never the garden; no rarity claims; share, never ask the steward to do anything' },
    also: also.map(function (c) { return { scientific: c.sp.sci, common: c.sp.common, theme: c.sp.theme, record: c.rec }; }),
    model: {
      eyebrow: 'Recorded nearby · ' + when,
      headline: article.charAt(0).toUpperCase() + article.slice(1) + name + (lead.local ? ', recorded near ' + g.garden_name : ', about ' + km + 'km from ' + g.garden_name),
      sci: sp.common ? sp.sci : '', why: lead.whyNow || '', plant: lead.plant ? lead.plant.text : '', link: lead.link.text || '',
      also: also.map(function (c) {
        var k2 = Math.max(0.5, Math.round(c.rec.distance_m / 500) / 2);
        return { theme: c.sp.theme, name: c.sp.common || c.sp.sci, sci: c.sp.common ? c.sp.sci : '',
                 where: c.rec.distance_m <= SIG_LOCAL_M ? 'Nearby' : 'About ' + k2 + 'km away', when: _sigDate(c.rec.observed).replace(/^\w+ /, '') };
      })
    },
    paragraphs: lines, text: lines.join('\n\n') };
}

/* Season so far at the garden, from modelled weather (Open-Meteo
   historical API, ERA5) at the garden's display coordinates, against the
   same days in each of the previous 30 years: rain, hot days, soil
   moisture and soil temperature at 7-28cm, and (August-January) spring
   warmth as growing degree days since 1 August, base 10C, expressed as
   weeks ahead of or behind a typical year. Every figure is turned into
   plain language. Returns null if data is incomplete. */
function _sigSeasonSoFar(g, now) {
  var month = _sigMelbMonth(now), seasonName = _sigSeasonName(month);
  var startMonth = { spring: 9, summer: 12, autumn: 3, winter: 6 }[seasonName];
  var Y = Number(Utilities.formatDate(now, SIG_TZ, 'yyyy'));
  var sy = startMonth === 12 && month !== 12 ? Y - 1 : Y;
  var end = Utilities.formatDate(new Date(now.getTime() - 2 * 864e5), SIG_TZ, 'yyyy-MM-dd');   // archive trails by a few days
  var warmthOn = month >= 8 || month === 1;
  var wy = month === 1 ? Y - 1 : Y;                                                              // year of the 1 August start
  var first = Math.min(sy, wy) - 30;
  var startStr = first + '-' + (warmthOn ? '08' : ('0' + startMonth).slice(-2)) + '-01';
  var url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + g.lat.toFixed(3) + '&longitude=' + g.lng.toFixed(3) +
    '&start_date=' + startStr + '&end_date=' + end +
    '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&hourly=soil_moisture_7_to_28cm,soil_temperature_7_to_28cm' +
    '&timezone=Australia%2FMelbourne';
  var j = _sigJson(url);
  if (!j || !j.daily || !j.daily.time) return null;
  var day = function (str) { var p = String(str).slice(0, 10).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 864e5; };
  var num = function (v) { return typeof v === 'number' && isFinite(v); };
  var med = function (arr) { arr = arr.slice().sort(function (a, b) { return a - b; }); return arr.length ? arr[Math.floor(arr.length / 2)] : null; };
  var endD = day(end), span = endD - Date.UTC(sy, startMonth - 1, 1) / 864e5;

  // Daily rain / hot days per season-year, same span of days from the season start.
  var per = {};
  j.daily.time.forEach(function (t, i) {
    var d = day(t);
    for (var b = sy - 30; b <= sy; b++) {
      var s0 = Date.UTC(b, startMonth - 1, 1) / 864e5;
      if (d < s0 || d > s0 + span) continue;
      var o = per[b] || (per[b] = { rain: 0, hot: 0, n: 0, bad: 0 });
      var r = j.daily.precipitation_sum[i], tx = j.daily.temperature_2m_max[i];
      if (!num(r) || !num(tx)) { o.bad++; continue; }
      o.rain += r; o.n++; if (tx >= 25) o.hot++;
    }
  });
  var cur = per[sy];
  if (!cur || cur.bad || cur.n < 7) return null;
  var past = Object.keys(per).map(Number).filter(function (b) { return b < sy && !per[b].bad && per[b].n === cur.n; });
  if (past.length < 20) return null;
  var rainTyp = med(past.map(function (b) { return per[b].rain; })), hotTyp = med(past.map(function (b) { return per[b].hot; }));

  // Soil: daily means from hourly, same calendar day each year.
  var sm = {}, st = {};
  if (j.hourly && j.hourly.time) j.hourly.time.forEach(function (t, i) {
    var k = String(t).slice(0, 10), m = j.hourly.soil_moisture_7_to_28cm[i], te = j.hourly.soil_temperature_7_to_28cm[i];
    if (num(m)) (sm[k] = sm[k] || []).push(m);
    if (num(te)) (st[k] = st[k] || []).push(te);
  });
  var mean = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
  var md = end.slice(5), soil = null, soilT = null;
  var smNow = sm[end] && sm[end].length === 24 ? mean(sm[end]) : null;
  var smPast = Object.keys(sm).filter(function (k) { return k.slice(5) === md && k < end && sm[k].length === 24; }).map(function (k) { return mean(sm[k]); });
  if (smNow !== null && smPast.length >= 20) {
    var below = smPast.filter(function (v) { return v < smNow; }).length / smPast.length;
    var label = below < 0.25 ? 'Drier than usual' : below > 0.75 ? 'Wetter than usual' : 'Normal';
    var holding = below < 0.25 ? 'less water than usual' : below > 0.75 ? 'more water than usual' : 'about as much water as usual';
    // Biggest one-day rise in the last 14 days = a soaking rain.
    var recent = _sigRange(0, 14).map(function (k) { return Utilities.formatDate(new Date(Date.UTC(1970, 0, 1) + (endD - 14 + k) * 864e5), 'UTC', 'yyyy-MM-dd'); })
      .filter(function (k) { return sm[k] && sm[k].length === 24; }).map(function (k) { return [k, mean(sm[k])]; });
    var rise = null;
    for (var i = 1; i < recent.length; i++) { var dlt = recent[i][1] - recent[i - 1][1]; if (dlt >= 0.03 && (!rise || dlt > rise.d)) rise = { day: recent[i][0], d: dlt, i: i }; }
    var note = '';
    if (rise) {
      var after = recent.slice(rise.i).map(function (x) { return x[1]; });
      var drying = after.length > 2 && after[after.length - 1] < Math.max.apply(null, after);
      note = 'The ' + _sigDate(rise.day).replace(/^\w+ /, '') + ' rain soaked in well' + (drying ? ' and the soil has been drying slowly since' : '') + '. ';
    }
    note += 'Right now it\'s holding ' + holding + '.';
    var smTyp = med(smPast);
    soil = { label: label, note: note, now: smNow, typ: smTyp, scale: Math.max(Math.max.apply(null, smPast), smNow) * 1.05 };
  }
  var stNow = st[end] && st[end].length === 24 ? mean(st[end]) : null;
  var stPast = Object.keys(st).filter(function (k) { return k.slice(5) === md && k < end && st[k].length === 24; }).map(function (k) { return mean(st[k]); });
  if (stNow !== null && stPast.length >= 20) {
    var stTyp = med(stPast), dd = stNow - stTyp, n = Math.round(Math.abs(dd));
    var words = n === 0 ? 'About usual.' : (Math.abs(dd) < n ? 'Nearly ' : Math.abs(dd) > n + 0.2 ? 'Just over ' : 'About ') + n + '°C ' + (dd > 0 ? 'warmer' : 'cooler') + ' than usual.';
    soilT = { now: stNow, typ: stTyp, note: words, scale: Math.max(Math.max.apply(null, stPast), stNow) * 1.1 };
  }

  // Spring warmth: growing degree days since 1 August, base 10C.
  var warmth = null;
  if (warmthOn) {
    var gdd = {}, seq = {};
    j.daily.time.forEach(function (t, i) {
      var y = Number(String(t).slice(0, 4)), m = Number(String(t).slice(5, 7));
      var by = m >= 8 ? y : (m === 1 ? y - 1 : null);
      if (by === null) return;
      var tx = j.daily.temperature_2m_max[i], tn = j.daily.temperature_2m_min[i];
      if (!num(tx) || !num(tn)) return;
      var v = Math.max(0, (tx + tn) / 2 - 10), dIn = day(t) - Date.UTC(by, 7, 1) / 864e5;
      (seq[by] = seq[by] || []).push([dIn, v]);
      if (dIn <= endD - Date.UTC(wy, 7, 1) / 864e5) gdd[by] = (gdd[by] || 0) + v;
    });
    var gNow = gdd[wy], reach = [];
    Object.keys(seq).map(Number).filter(function (b) { return b < wy; }).forEach(function (b) {
      var c = 0; for (var q = 0; q < seq[b].length; q++) { c += seq[b][q][1]; if (c >= gNow) { reach.push(seq[b][q][0]); return; } }
    });
    if (num(gNow) && reach.length >= 20) {
      var todayIn = endD - Date.UTC(wy, 7, 1) / 864e5, typIn = med(reach), ahead = typIn - todayIn;
      var typDate = Utilities.formatDate(new Date(Date.UTC(wy, 7, 1) + typIn * 864e5), 'UTC', 'yyyy-MM-dd');
      var wk = Math.round(Math.abs(ahead) / 7 * 2) / 2, wkTxt = (wk % 1 ? (Math.floor(wk) || '') + '½' : String(wk)) + (wk > 1 ? ' weeks' : ' week');
      var headline = Math.abs(ahead) < 4 ? 'Right on time' : 'About ' + wkTxt + (ahead > 0 ? ' ahead' : ' behind');
      var typLabel = _sigDate(typDate).replace(/^\w+ /, '');
      var text = Math.abs(ahead) < 4 ? 'Warmth since 1 August is about where it usually is by now.'
        : g.garden_name + ' has had as much warmth since 1 August as it usually ' + (ahead > 0 ? 'gets by ' : 'had by ') + typLabel +
          ', so growth and flowering are likely running ' + (ahead > 0 ? 'early.' : 'late.');
      warmth = { headline: headline, text: text, ahead: ahead, todayIn: todayIn + 2, typIn: typIn + 2, typLabel: typLabel.replace(/(\d+) (\w{3})\w*/, '$1 $2'), gdd: Math.round(gNow) };
    }
  }

  var seasonCap = seasonName.charAt(0).toUpperCase() + seasonName.slice(1);
  var ratio = cur.rain / Math.max(rainTyp, 1);
  var rainNote = ratio < 0.75 ? 'Drier than a typical ' + seasonName + '.' : ratio < 0.95 ? 'A little drier than a typical ' + seasonName + '.'
    : ratio <= 1.05 ? 'About a typical ' + seasonName + '.' : ratio <= 1.25 ? 'A little wetter than a typical ' + seasonName + '.' : 'Wetter than a typical ' + seasonName + '.';
  var hotNote = cur.hot === hotTyp ? 'About as many as usual.' : hotTyp > 0 && cur.hot === 2 * hotTyp ? 'Twice as many as usual.'
    : hotTyp > 0 && cur.hot > 2 * hotTyp ? 'More than twice as many as usual.' : cur.hot > hotTyp ? 'More than usual.' : 'Fewer than usual.';
  var stats = { season: seasonName, startLabel: '1 ' + SIG_MONTHS[startMonth - 1],
    rain: { now: Math.round(cur.rain), typ: Math.round(rainTyp), note: rainNote },
    hot: { now: cur.hot, typ: hotTyp, note: hotNote }, soil: soil, soilT: soilT, warmth: warmth };
  var lines = [seasonCap + ' so far around ' + g.garden_name + ': ' + Math.round(cur.rain) + 'mm of rain since 1 ' + SIG_MONTHS[startMonth - 1] +
    ' (typical ' + Math.round(rainTyp) + 'mm), and ' + cur.hot + ' day' + (cur.hot === 1 ? '' : 's') + ' over 25°C (usual ' + hotTyp + ').'];
  return { text: lines[0], stats: stats, evidence: { source: 'Open-Meteo historical weather API (ERA5 reanalysis, modelled, not measured at the garden)',
    url: url, period: '1 ' + SIG_MONTHS[startMonth - 1] + ' to ' + end, comparison_years: past.length,
    rain_mm: Math.round(cur.rain), rain_typical_mm: Math.round(rainTyp), hot_days: cur.hot, hot_days_typical: hotTyp,
    soil_moisture_m3m3: soil && +soil.now.toFixed(3), soil_moisture_typical: soil && +soil.typ.toFixed(3),
    soil_temp_c: soilT && +soilT.now.toFixed(1), soil_temp_typical_c: soilT && +soilT.typ.toFixed(1),
    growing_degree_days_base10_since_1_aug: warmth && warmth.gdd, warmth_days_ahead: warmth && warmth.ahead } };
}

/* Tomorrow's sunrise (Open-Meteo forecast) and first light (civil dawn,
   sun 6 degrees below the horizon, NOAA approximation), local time. */
function _sigSunrise(g, now) {
  var j = _sigJson('https://api.open-meteo.com/v1/forecast?latitude=' + g.lat.toFixed(3) + '&longitude=' + g.lng.toFixed(3) +
    '&daily=sunrise&forecast_days=2&timezone=Australia%2FMelbourne');
  if (!j || !j.daily || !j.daily.sunrise || !j.daily.sunrise[1]) return null;
  var date = j.daily.time[1], sr = String(j.daily.sunrise[1]).slice(11, 16);
  var p = date.split('-').map(Number), rad = Math.PI / 180;
  var N = Math.floor((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(p[0], 0, 0)) / 864e5);
  var gm = 2 * Math.PI / 365 * (N - 1 - 0.25);
  var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(gm) - 0.032077 * Math.sin(gm) - 0.014615 * Math.cos(2 * gm) - 0.040849 * Math.sin(2 * gm));
  var decl = 0.006918 - 0.399912 * Math.cos(gm) + 0.070257 * Math.sin(gm) - 0.006758 * Math.cos(2 * gm) + 0.000907 * Math.sin(2 * gm) - 0.002697 * Math.cos(3 * gm) + 0.00148 * Math.sin(3 * gm);
  var ha = Math.acos(Math.cos(96 * rad) / (Math.cos(g.lat * rad) * Math.cos(decl)) - Math.tan(g.lat * rad) * Math.tan(decl)) / rad;
  var off = Number(j.utc_offset_seconds || 39600) / 60;
  var mins = Math.round(720 - 4 * (g.lng + ha) - eq + off);
  var fmt = function (hhmm) { var h = Number(hhmm.split(':')[0]), m = hhmm.split(':')[1]; return (h % 12 || 12) + ':' + m + (h < 12 ? 'am' : 'pm'); };
  return { date: date, firstLight: fmt(Math.floor(mins / 60) + ':' + ('0' + (mins % 60)).slice(-2)), sunrise: fmt(sr) };
}

/* EVC lookups near the garden since the season began, from the lookup log
   sheet (Script Property SIGNALS_LOOKUP_SHEET = spreadsheet id). Distinct
   places (coordinates to ~100m), never addresses. Null if unavailable. */
function _sigLookups(g, now, stats) {
  var id = String(PropertiesService.getScriptProperties().getProperty('SIGNALS_LOOKUP_SHEET') || '').trim();
  if (!id) return null;
  try {
    var rows = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getValues();
    var month = _sigMelbMonth(now), seasonName = _sigSeasonName(month);
    var startMonth = { spring: 9, summer: 12, autumn: 3, winter: 6 }[seasonName];
    var Y = Number(Utilities.formatDate(now, SIG_TZ, 'yyyy')), sy = startMonth === 12 && month !== 12 ? Y - 1 : Y;
    var since = Date.UTC(sy, startMonth - 1, 1) - 11 * 36e5;
    var near = {}, all = {};
    rows.slice(1).forEach(function (r) {
      var t = r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]);
      if (!isFinite(t) || t < since || /^test$/i.test(String(r[6] || '').trim())) return;
      var lat = Number(r[2]), lng = Number(r[3]);
      if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) return;
      var k = lat.toFixed(3) + ',' + lng.toFixed(3);
      all[k] = true;
      if (_sigDistM(g.lat, g.lng, lat, lng) <= 10000) near[k] = true;
    });
    return { near: Object.keys(near).length, all: Object.keys(all).length, sinceLabel: SIG_MONTHS[startMonth - 1] };
  } catch (e) { return null; }
}

/* Common name from the Atlas species index when a record has none. */
function _sigCommonName(sci) {
  if (!sci) return '';
  var cache = CacheService.getScriptCache(), key = 'cn:' + sci;
  var c = cache.get(key); if (c !== null) return c;
  var j = _sigJson('https://bie-ws.ala.org.au/ws/species/' + encodeURIComponent(sci) + '.json');
  var name = '';
  if (j) {
    name = String(j.commonNameSingle || '');
    if (!name && j.commonNames) { var cn = j.commonNames.filter(function (x) { return x.status === 'common'; })[0]; name = cn ? cn.nameString : ''; }
  }
  name = name.replace(/-([A-Z])/g, function (m, l) { return '-' + l.toLowerCase(); });   // "Short-Beaked" -> "Short-beaked"
  cache.put(key, name, 21600);
  return name;
}

/* How a theme connects to this particular garden's record. An unresolved
   observation (unverified record in the same group) is the strongest
   link; recorded habitat next; a verified record in the group last. */
function _sigThemeLink(g, theme) {
  var pat = { frogs: /frog|froglet|toadlet/i, birds: /wren|bill|eater|bird|robin|thornbill|pardalote|parrot|cockatoo|owl|magpie|kookaburra|rosella|whistler/i,
    reptiles: /skink|lizard|snake|dragon|goanna/i, mammals: /possum|glider|bat|echidna|wallaby|kangaroo|phascogale|antechinus|bandicoot/i }[theme];
  var recs = pat ? g.faunaRecs.filter(function (f) { return pat.test(f.name); }) : [];
  var open = recs.filter(function (f) { return !f.verified; })[0];
  if (open) return { score: 3, why: 'unresolved observation: ' + open.name + ' (unverified)',
    text: 'Your garden\'s record already lists ' + open.name + ', though it hasn\'t been confirmed yet.' };
  if (theme === 'frogs' && g.water) return { score: 2, why: 'recorded water habitat', text: '' };
  if (recs.length) return { score: 1, why: 'garden record has verified ' + theme, text: '' };
  if ((theme === 'orchids' || theme === 'wildflowers') && g.species.length >= 15)
    return { score: 1, why: 'established indigenous planting (' + g.species.length + ' species recorded)', text: '' };
  return { score: 0, why: 'none', text: '' };
}

/* ---------------------------------------------------------------
   Flowering (plant library, Australian plants only)
   --------------------------------------------------------------- */

function _sigPlantLibrary() {
  var lib = _sigJson(SIG_SITE + '/data/plant-library.json');
  if (!lib || !lib.species) return null;
  var idx = {};
  lib.species.forEach(function (p) {
    if (p.australian_native !== true) return;
    var months = _sigBloomMonths(p);
    if (!months.length) return;
    idx[_sigNorm(p.botanical_name)] = { name: p.botanical_name, slug: p.slug, common: p.common_name || '', months: months,
      peak: (p.flowering && p.flowering.peak) || [], basis: p.flowering && (p.flowering.peak || []).length ? 'flowering.peak/shoulder' : 'bloom_time: ' + JSON.stringify(p.bloom_time) };
  });
  return idx;
}

function _sigBloomMonths(p) {
  if (p.flowering && (p.flowering.peak || []).length) return (p.flowering.peak || []).concat(p.flowering.shoulder || []);
  var bt = p.bloom_time;
  if (!bt) return [];
  if (!Array.isArray(bt)) bt = [bt];
  var S = { spring: [9, 10, 11], summer: [12, 1, 2], autumn: [3, 4, 5], winter: [6, 7, 8] };
  var order = ['spring', 'summer', 'autumn', 'winter'], months = [];
  bt.forEach(function (raw) {
    var s = String(raw).toLowerCase();
    if (/all year|evergreen/.test(s)) return;
    var found = order.filter(function (k) { return s.indexOf(k) > -1; });
    if (!found.length) return;
    var span = found;
    if (/\bto\b|-/.test(s) && found.length === 2) {
      var a = s.indexOf(found[0]) < s.indexOf(found[1]) ? found[0] : found[1], b = a === found[0] ? found[1] : found[0];
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
  var seen = {}, cands = [];
  g.species.forEach(function (raw) {
    var p = _sigMatchPlant(raw, lib);
    if (!p || seen[p.name] || recent.indexOf(_sigNorm(p.name)) > -1) return;
    seen[p.name] = true;
    if (p.months.indexOf(month) === -1) return;
    // Always name the plant as the garden's own list does. Borrow the
    // library's common name only when it is the same taxon, never a
    // cultivar, variety or subspecies the steward didn't record.
    var own = String(raw).replace(/['‘’"]/g, '').trim();
    var exact = function (x) { return String(x).toLowerCase().replace(/['‘’".]/g, '').replace(/\s+/g, ' ').trim(); };
    var same = exact(p.name) === exact(own);
    var label = same && p.common ? p.common + ' (' + own + ')' : own;
    cands.push({ p: p, raw: raw, label: label, rank: (p.months.indexOf(prev) === -1 ? 0 : 2) + (p.peak.indexOf(month) > -1 ? 0 : 1) });
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) { return a.rank - b.rank; });
  var pick = cands.slice(0, 3);
  return { type: 'flowering', key: pick.map(function (c) { return _sigNorm(c.p.name); }).join('|'),
    subject: 'what may be in flower', expires: new Date(Date.now() + 7 * 864e5).toISOString(),
    evidence: { source: SIG_SITE + '/data/plant-library.json', month: month,
      species: pick.map(function (c) { return { garden_list_name: c.raw, library_name: c.p.name, slug: c.p.slug, months: c.p.months, basis: c.p.basis }; }) },
    text: 'Going by your garden\'s planting list, ' + _sigJoin(pick.map(function (c) { return c.label; })) +
      (pick.length > 1 ? ' are' : ' is') + ' usually in flower around now. ' + (pick.length > 1 ? 'Have they' : 'Has it') +
      ' started? Let us know what is actually out; a quick photo makes your record far richer than any list.' };
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

function _sigCompose(g, chosen) {
  var greeting = g.stewards ? 'Hi ' + _sigFirstNames(g.stewards) + ',' : 'Hello,';
  var lead = chosen[0], support = chosen[1];
  if (lead.type === 'season') {
    var body = [greeting, ''].concat(lead.paragraphs.join('\n\n').split('\n'))
      .concat(['', SIG_SIGNOFF, '', '--',
        'These notes are part of our Ecological Registry steward pilot. The records above are from the surrounding area, not from your garden. ' +
        'Reply "pause" and we will stop them.']);
    return { subject: g.garden_name + ' · ' + lead.subject, body: body.join('\n') };
  }
  var paras = [greeting, '', lead.text, ''];
  if (support) paras.push('Also, ' + support.text.charAt(0).toLowerCase() + support.text.slice(1), '');
  paras.push(chosen.some(function (s) { return SIG_OBS.indexOf(s.type) > -1; })
    ? 'Just hit reply. It comes straight to us.'
    : 'If anything looks unhappy, reply with a photo and we will take a look.');
  paras.push('', SIG_SIGNOFF, '', '--',
    'These notes are part of our Ecological Registry steward pilot. Weather and sightings describe your local area, not your garden itself. ' +
    'Reply "pause" and we will stop them.');
  return { subject: g.garden_name + ': ' + lead.subject, body: paras.join('\n') };
}

function _sigHtml(body, card) {
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var parts = String(body).split(/\n--\n/);
  var main = parts[0], small = parts.slice(1).join(' ');
  var paras = esc(main).split(/\n{2,}/).map(function (p) {
    p = p.replace(/^(Add your own sightings to .*?): (https:\/\/\S+)$/, '<a href="$2" style="color:#2b2f26">$1 ↗</a>');
    p = p.replace(/https:\/\/biocache\.ala\.org\.au\/occurrences\/([0-9a-f-]{36})/g,
      '<a href="https://biocache.ala.org.au/occurrences/$1" style="color:#2b2f26">View record ↗</a>');
    return '<p style="margin:0 0 16px;font:16px/1.6 Georgia,serif;color:#2b2f26">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  var foot = '';
  if (card && card.garden_name) {
    // Beige card: Gmail strips dark backgrounds, so the Signal panel's
    // dark-green plate doesn't survive in the inbox.
    var accent = card.provisional ? '#a8873f' : '#5f7f47';
    foot = '<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#f4ecdc" style="margin:28px 0 0;width:100%;max-width:360px;background-color:#f4ecdc;border:1px solid #d9ccb2">' +
      '<tr><td bgcolor="#f4ecdc" style="padding:18px 20px;background-color:#f4ecdc">' +
      '<div style="font:11px/1.5 Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:#5b6152">Ecological Registry <span style="color:' + accent + '">●</span></div>' +
      '<div style="font:18px/1.3 Helvetica,Arial,sans-serif;color:#2b2f26;margin-top:12px">' + esc(card.garden_name) + '</div>' +
      '<div style="font:11px/1.6 Menlo,monospace;text-transform:uppercase;color:' + accent + ';margin-top:4px">' + esc(card.rating || '') + (card.provisional ? ' · provisional' : '') + '</div>' +
      (typeof card.score === 'number' ? '<div style="font:500 56px/1.1 Menlo,monospace;color:' + accent + ';margin-top:8px">' + card.score + '<span style="font-size:13px;color:#8a8f80"> / 100</span></div>' : '') +
      '<a href="' + esc(card.profile) + '" style="display:block;margin-top:12px;font:13px/1.5 Helvetica,Arial,sans-serif;color:#2b2f26">View your garden\'s record ↗</a>' +
      '</td></tr></table>';
  }
  var note = small ? '<p style="margin:24px 0 0;font:12px/1.6 Helvetica,Arial,sans-serif;color:#7d8574">' + esc(small).replace(/\n/g, ' ') + '</p>' : '';
  return '<div style="max-width:560px;padding:8px">' + paras + foot + note + '</div>';
}

/* The Registry's own scoring engine, loaded from the site so the email
   always matches the garden profile. Cached for six hours. */
function _sigScorer() {
  var cache = CacheService.getScriptCache(), src = cache.get('reg-score.js');
  if (src === null) {
    try {
      var r = UrlFetchApp.fetch(SIG_SITE + '/js/reg-score.js', { muteHttpExceptions: true });
      src = r.getResponseCode() === 200 ? r.getContentText() : '';
    } catch (e) { src = ''; }
    if (src.length < 90000) cache.put('reg-score.js', src, 21600);
  }
  if (!src) return null;
  try {
    var w = {};
    return new Function('window', 'self', 'module', 'exports', src + '\n;return typeof scoreEcologicalRegistry === "function" ? scoreEcologicalRegistry : (window.scoreEcologicalRegistry || null);')(w, w, undefined, undefined);
  } catch (e) { return null; }
}

var SIG_PILLAR_KEYS = { 'Biodiversity Structure': 'biodiversity', 'Soil & Water Function': 'soil_water', 'Habitat Complexity': 'habitat',
  'Connectivity': 'connectivity', 'Evidence & Verification': 'evidence' };
var SIG_PILLAR_WHY = {
  biodiversity: 'These points come from indigenous species, structural layers and canopy cover.',
  soil_water: 'These points come from soil health, water held on site, rain capture and swales.',
  habitat: 'These points come from logs, rocks, water, nest boxes and fauna recorded in the garden.',
  connectivity: 'These points come from the gardens and green space around it.',
  evidence: 'These points come from photos, field notes and records added to the garden\'s record.'
};

/* Score card, five pillars and the pillar with the most room, scored by
   the Registry engine. Null unless the engine's total matches the score
   published on the Registry (so the email never contradicts the profile). */
function _sigRecordSection(g) {
  if (!g.record || typeof g.score !== 'number') return null;
  var score = _sigScorer(); if (!score) return null;
  var r; try { r = score(g.record); } catch (e) { return null; }
  if (!r || r.total !== g.score || !r.categories) return null;
  var pillars = r.categories.map(function (c) { return { key: SIG_PILLAR_KEYS[c.label] || c.label, label: c.label, score: c.score, max: c.max, notes: c.notes || [] }; });
  var gap = pillars.slice().sort(function (a, b) { return (a.score / a.max) - (b.score / b.max) || (b.max - b.score) - (a.max - a.score); })[0];
  var text = gap.label + ' is where ' + g.garden_name + ' has the most room: ' + gap.score + ' of ' + gap.max + '. ' + (SIG_PILLAR_WHY[gap.key] || '');
  var invite = null;
  if (gap.key === 'connectivity') {
    var c = g.record.connectivity || {}, adj = (c.adjacent_registered_gardens || []).length;
    var park = gap.notes.filter(function (n) { return /park/i.test(n); })[0];
    text += ' ' + (park ? park.replace(/^Park/, 'There\'s a park') + (adj ? '' : ', but') : '') +
      (adj ? (park ? ', and ' : '') + adj + ' registered garden' + (adj === 1 ? '' : 's') + ' next door.' : (park ? ' no' : 'No') + ' registered gardens next door yet.') +
      (adj < 3 ? ' ' + (adj ? 'Each more registered neighbour lifts it further.' : 'One registered neighbour adds 3 points.') : '');
    invite = { text: 'Invite a neighbour', href: g.profile + '#opportunityList', note: 'From ' + g.garden_name + '\'s record, under Biggest Opportunities.' };
  }
  return { score: r.total, rating: g.rating, next: g.nextLevel, toNext: g.toNext, pillars: pillars, gap: { key: gap.key, label: gap.label, text: text.trim() }, invite: invite };
}

/* ---------------------------------------------------------------
   Steward update template (Gmail-safe: tables, inline styles, no
   images or SVG, light palette, direct links). Same layout as
   templates/email/steward_update.py.
   --------------------------------------------------------------- */

var SIG_T = { INK: '#2b2f26', MUTE: '#6f7666', LINE: '#e3d8c3', PAPER: '#fbf6ec', CARD: '#f4ecdc', GREEN: '#5f7f47', LIGHT: '#9cbf7e', GREY: '#cfc5b0',
  SERIF: "Georgia,'Times New Roman',serif", SANS: 'Helvetica,Arial,sans-serif', MONO: 'Menlo,Consolas,monospace' };
var SIG_PILLS = { orchids: ['Orchid', '#8a6aa8'], mammals: ['Mammal', '#8a6a4f'], birds: ['Bird', '#b0574a'], wildflowers: ['Wildflower', '#4f7fa8'],
  frogs: ['Frog', '#4f8a6a'], reptiles: ['Reptile', '#8a7a3f'], 'moths and butterflies': ['Insect', '#6a6a8a'], insects: ['Insect', '#6a6a8a'] };

/* Studio panel shown in updates when Script Property SIGNALS_STUDIO = signal. */
function _sigStudioPanel(g) {
  var which = String(PropertiesService.getScriptProperties().getProperty('SIGNALS_STUDIO') || '').trim().toLowerCase();
  if (which !== 'signal') return null;
  return { eyebrow: 'Something we\'re building', title: 'Signal: a garden sign that measures the garden',
    intro: 'The figures above are estimates for your area. Signal would measure them in the garden itself, and show the garden\'s record at the gate.',
    items: [['Soil moisture', '15cm under the mulch'], ['Soil temperature', 'at root depth'], ['Rain gauge', 'what actually fell'],
            ['Air and humidity', 'under the canopy'], ['Light', 'in the understorey'], ['Birdsong', 'identified on the sign, no audio kept']],
    close: 'We\'d love ' + g.garden_name + ' to be one of the first. If you\'d like one there, just reply.',
    button: ['See the Signal prototype', SIG_SITE + '/sign/'] };
}

function _sigUpdateText(m) {
  var L = [m.greeting], R = m.record;
  if (R) {
    L.push('', (m.garden + '\'s record').toUpperCase(), m.garden + ' is at ' + R.score + ' of 100: ' + R.rating + '.' +
      (R.next && R.toNext ? ' ' + R.toNext + ' point' + (R.toNext === 1 ? '' : 's') + ' from ' + R.next + '.' : ''), '');
    R.pillars.forEach(function (p) { L.push(p.label + ': ' + p.score + ' of ' + p.max); });
    L.push('', R.gap.text);
    if (R.invite) L.push(R.invite.text + ': ' + R.invite.href);
  }
  var st = m.stats;
  if (st) {
    L.push('', (st.season + ' at ' + m.garden + ' so far').toUpperCase(), 'Compared with the same weeks in each of the past 30 years.', '');
    L.push('Rain: ' + st.rain.now + 'mm. ' + st.rain.note + ' (typical ' + st.rain.typ + 'mm)');
    L.push('Hot days: ' + st.hot.now + ' over 25°C. ' + st.hot.note + ' (usual ' + st.hot.typ + ')');
    if (st.soil) L.push('Soil moisture: ' + st.soil.label.toLowerCase() + '. ' + st.soil.note);
    if (st.soilT) L.push('Soil temperature: ' + st.soilT.now.toFixed(1) + '°C at root depth. ' + st.soilT.note);
    if (st.warmth) L.push('Spring warmth: ' + st.warmth.headline.charAt(0).toLowerCase() + st.warmth.headline.slice(1) + '. ' + st.warmth.text);
  }
  if (m.sun) L.push('', 'Tomorrow: first light ' + m.sun.firstLight + ', sunrise ' + m.sun.sunrise + '.');
  L.push('', ('Around ' + m.garden).toUpperCase(), 'Recorded in the surrounding area in the past few weeks.', '', m.eyebrow.toUpperCase(), m.headline + (m.sci ? ' (' + m.sci + ')' : ''));
  if (m.why) L.push(m.why);
  if (m.plant) L.push(m.plant);
  if (m.link) L.push(m.link);
  if (m.also && m.also.length) {
    L.push('', 'Also recorded:');
    m.also.forEach(function (a) { L.push('– ' + a.name + (a.sci ? ' (' + a.sci + ')' : '') + ', ' + a.where.toLowerCase() + ', ' + a.when); });
  }
  if (m.lookups && m.lookups.near) L.push('', 'Since ' + m.lookups.sinceLabel + ', people have looked up what originally grew at ' + m.lookups.near + ' place' + (m.lookups.near === 1 ? '' : 's') +
    ' within 10km of ' + m.garden + ' on findmyevc.com, and at ' + m.lookups.all + ' place' + (m.lookups.all === 1 ? '' : 's') + ' across Victoria.');
  if (m.studio) {
    L.push('', m.studio.eyebrow.toUpperCase(), m.studio.title + '.', m.studio.intro + ' It tracks ' + m.studio.items.map(function (x) { return x[0].toLowerCase() + ' ' + x[1]; }).join(', ') + '.', m.studio.close, m.studio.button[0] + ': ' + m.studio.button[1]);
  }
  if (m.studioNote) L.push('', m.studioNote);
  L.push('', 'Add your own sightings to ' + m.garden + '\'s record: ' + m.profile, '', SIG_SIGNOFF, '', '--',
    'Part of our Ecological Registry steward pilot. Sightings are from the surrounding area, not from your garden, via the Atlas of Living Australia. ' +
    'Weather and soil figures are estimates for your location from Open-Meteo. Reply "pause" and we\'ll stop these notes.');
  return L.join('\n');
}

function _sigUpdateHtml(m, card) {
  var T = SIG_T, e = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var bar = function (pct, color, h) {
    h = h || 10; pct = Math.max(2, Math.min(100, Math.round(pct)));
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td width="' + pct + '%" bgcolor="' + color +
      '" style="background-color:' + color + ';height:' + h + 'px;line-height:' + h + 'px;font-size:0">&nbsp;</td>' +
      (pct < 100 ? '<td width="' + (100 - pct) + '%" style="height:' + h + 'px;line-height:' + h + 'px;font-size:0">&nbsp;</td>' : '') + '</tr></table>';
  };
  var lab = function (t) { return '<div style="font:600 11px/1.4 ' + T.SANS + ';letter-spacing:.08em;text-transform:uppercase;color:' + T.MUTE + '">' + t + '</div>'; };
  var statCard = function (label, big, unit, note, now, typ, scale, typLabel) {
    return '<td width="50%" valign="top" style="padding:14px 14px 16px;border:1px solid ' + T.LINE + ';background-color:#ffffff" bgcolor="#ffffff">' + lab(label) +
      '<div style="font:400 30px/1.15 ' + T.SERIF + ';color:' + T.INK + ';margin:6px 0 2px">' + big + (unit ? '<span style="font:14px ' + T.SANS + ';color:' + T.MUTE + '"> ' + unit + '</span>' : '') + '</div>' +
      '<div style="font:13px/1.45 ' + T.SANS + ';color:' + T.INK + ';margin:0 0 10px">' + note + '</div>' +
      '<div style="font:11px/1.6 ' + T.SANS + ';color:' + T.MUTE + '">This ' + e(m.season) + '</div>' + bar(now / scale * 100, T.GREEN) +
      '<div style="font:11px/1.6 ' + T.SANS + ';color:' + T.MUTE + ';margin-top:4px">' + typLabel + '</div>' + bar(typ / scale * 100, T.GREY) + '</td>';
  };
  var btn = function (text, href, solid) {
    return '<a href="' + e(href) + '" style="display:inline-block;font:600 14px/1 ' + T.SANS + ';color:' + (solid ? '#ffffff' : T.INK) + ';background-color:' + (solid ? T.GREEN : '#ffffff') +
      ';border:1px solid ' + (solid ? T.GREEN : T.INK) + ';padding:13px 18px;text-decoration:none;border-radius:2px">' + e(text) + '</a>';
  };
  var row = function (inner, pad) { return '<tr><td style="padding:' + pad + '">' + inner + '</td></tr>'; };
  var h2 = function (t, sub) { return '<div style="font:400 24px/1.2 ' + T.SERIF + ';color:' + T.INK + '">' + t + '</div>' + (sub ? '<div style="font:13px/1.5 ' + T.SANS + ';color:' + T.MUTE + ';margin-top:4px">' + sub + '</div>' : ''); };
  var seasonCap = m.season.charAt(0).toUpperCase() + m.season.slice(1);
  var out = [];

  out.push(row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:600 11px/1.4 ' + T.MONO + ';letter-spacing:.12em;text-transform:uppercase;color:' + T.INK +
    '">Ecological Registry <span style="color:' + T.GREEN + '">●</span></td><td align="right" style="font:11px/1.4 ' + T.MONO + ';letter-spacing:.08em;text-transform:uppercase;color:' + T.MUTE + '">' +
    e(m.garden) + ' · ' + seasonCap + ' update · ' + e(m.dateLabel) + '</td></tr></table>', '0 0 14px;border-bottom:2px solid ' + T.INK));

  var callout = function (t) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + T.CARD + '" style="background-color:' + T.CARD + ';border-left:3px solid ' + T.GREEN +
      ';margin:0 0 8px"><tr><td style="padding:12px 14px;font:15px/1.5 ' + T.SANS + ';color:' + T.INK + '">' + t + '</td></tr></table>';
  };
  var R = m.record, lead = '<div style="font:15px/1.6 ' + T.SANS + ';color:' + T.INK + ';margin:0 0 18px">' + e(m.greeting) + '</div>';
  if (R) {
    var acc = card && card.provisional ? '#a8873f' : T.GREEN;
    var pill = function (p) {
      var isGap = p.key === R.gap.key, col = isGap ? '#a8873f' : T.GREEN;
      return '<tr><td style="padding:7px 0 0;font:13px/1.4 ' + T.SANS + ';color:' + T.INK + '">' + (isGap ? '<b>' + e(p.label) + '</b>' : e(p.label)) +
        '</td><td align="right" style="padding:7px 0 0;font:12px/1.4 ' + T.MONO + ';color:' + (isGap ? '#a8873f' : T.MUTE) + '">' + p.score + ' / ' + p.max + '</td></tr>' +
        '<tr><td colspan="2" style="padding:4px 0 0">' + bar(p.score / p.max * 100, col, 8) + '</td></tr>';
    };
    lead += '<div style="font:600 11px/1.4 ' + T.SANS + ';letter-spacing:.1em;text-transform:uppercase;color:' + T.GREEN + '">' + e(m.garden) + '&#39;s record · ' + e(seasonCap) + '</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px"><tr>' +
      '<td width="150" valign="top" style="padding:0 18px 0 0"><div style="font:500 64px/1 ' + T.MONO + ';color:' + acc + '">' + R.score + '</div>' +
      '<div style="font:11px/1.6 ' + T.MONO + ';color:' + T.MUTE + ';margin-top:6px">OUT OF 100</div></td>' +
      '<td valign="top"><div style="font:400 28px/1.15 ' + T.SERIF + ';color:' + T.INK + '">' + e(R.rating) + '</div>' +
      (R.next && R.toNext ? '<div style="font:14px/1.5 ' + T.SANS + ';color:' + T.MUTE + ';margin-top:6px"><b style="color:' + T.INK + '">' + R.toNext + ' point' + (R.toNext === 1 ? '' : 's') +
        '</b> from ' + e(R.next) + '</div>' : '') + '</td></tr></table>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ' + T.LINE + ';margin-top:18px"><tr><td style="padding:8px 14px 16px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">' + R.pillars.map(pill).join('') + '</table></td></tr></table>' +
      '<div style="margin-top:14px">' + callout(e(R.gap.text)) + '</div>' +
      (R.invite ? '<div style="margin-top:6px">' + btn(R.invite.text, R.invite.href, true) + '<div style="font:12px/1.5 ' + T.SANS + ';color:' + T.MUTE + ';margin-top:8px">' + e(R.invite.note) + '</div></div>' : '') +
      '<div style="font:13px/1.5 ' + T.SANS + ';margin-top:12px"><a href="' + e(m.profile) + '" style="color:' + T.INK + '">View the full record ↗</a></div>';
  }
  out.push(row(lead, '26px 0 8px'));

  var st = m.stats;
  if (st) {
    out.push(row(h2(seasonCap + ' at ' + e(m.garden) + ' so far', 'Compared with the same weeks in each of the past 30 years.'), '30px 0 6px'));
    var cells = [statCard('Rain', st.rain.now, 'mm', e(st.rain.note), st.rain.now, st.rain.typ, Math.max(st.rain.now, st.rain.typ) * 1.15, 'Typical: ' + st.rain.typ + 'mm'),
                 statCard('Hot days', st.hot.now, 'days over 25°C', e(st.hot.note), st.hot.now, st.hot.typ, Math.max(st.hot.now, st.hot.typ, 1) * 1.3, 'Usual: ' + st.hot.typ)];
    if (st.soil) cells.push(statCard('Soil moisture', e(st.soil.label), '', e(st.soil.note), st.soil.now, st.soil.typ, st.soil.scale, 'Typical for this date'));
    if (st.soilT) cells.push(statCard('Soil temperature', st.soilT.now.toFixed(1), '°C at root depth', e(st.soilT.note), st.soilT.now, st.soilT.typ, st.soilT.scale, 'Typical: ' + st.soilT.typ.toFixed(1) + '°C'));
    var grid = '';
    for (var i = 0; i < cells.length; i += 2) grid += '<tr>' + cells[i] + (cells[i + 1] || '<td width="50%"></td>') + '</tr>';
    out.push(row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0">' + grid + '</table>', '10px 0 0'));
    if (st.warmth) {
      var W = st.warmth, total = 153, a = Math.min(W.todayIn, W.typIn), b2 = Math.abs(W.typIn - W.todayIn);
      var pa = Math.max(1, Math.round(a / total * 100)), pb = Math.round(b2 / total * 100), pc = Math.max(0, 100 - pa - pb);
      var aheadOrOn = W.ahead >= 0;
      var tl = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' +
        '<td width="' + pa + '%" bgcolor="' + T.GREEN + '" style="background-color:' + T.GREEN + ';height:14px;font-size:0">&nbsp;</td>' +
        (pb ? '<td width="' + pb + '%" bgcolor="' + (aheadOrOn ? T.LIGHT : '#d9b98a') + '" style="background-color:' + (aheadOrOn ? T.LIGHT : '#d9b98a') + ';height:14px;font-size:0">&nbsp;</td>' : '') +
        (pc ? '<td width="' + pc + '%" bgcolor="' + T.GREY + '" style="background-color:' + T.GREY + ';height:14px;font-size:0">&nbsp;</td>' : '') + '</tr></table>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:11px/1.5 ' + T.SANS + ';color:' + T.MUTE + ';margin-top:5px"><tr>' +
        '<td width="' + pa + '%" valign="top">1 Aug</td>' +
        (pb ? '<td width="' + pb + '%" valign="top" style="color:' + T.INK + '"><b>' + (aheadOrOn ? 'Today' : W.typLabel) + '</b></td>' : '') +
        '<td width="' + (pc || 20) + '%" valign="top">' + (aheadOrOn ? 'Typical year reaches today\'s warmth on <b style="color:' + T.INK + '">' + e(W.typLabel) + '</b>' : '<b style="color:' + T.INK + '">Today</b>') + '</td></tr></table>';
      out.push(row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ' + T.LINE + '"><tr><td style="padding:14px 14px 16px">' +
        lab('Spring warmth') + '<div style="font:400 24px/1.2 ' + T.SERIF + ';color:' + T.INK + ';margin:6px 0 4px">' + e(W.headline) + '</div>' +
        '<div style="font:13px/1.45 ' + T.SANS + ';color:' + T.INK + ';margin:0 0 12px">' + e(W.text) + '</div>' + tl + '</td></tr></table>', '16px 0 0'));
    }
  }
  if (m.sun) out.push(row('Tomorrow: first light <b style="color:' + T.INK + '">' + e(m.sun.firstLight) + '</b>, sunrise <b style="color:' + T.INK + '">' + e(m.sun.sunrise) + '</b>.', '12px 0 0;font:13px/1.5 ' + T.SANS + ';color:' + T.MUTE));

  out.push(row(h2('Around ' + e(m.garden), 'Recorded in the surrounding area in the past few weeks.'), '32px 0 12px'));
  out.push(row('<div style="font:600 11px/1.4 ' + T.SANS + ';letter-spacing:.1em;text-transform:uppercase;color:' + T.GREEN + '">' + e(m.eyebrow) + '</div>' +
    '<div style="font:400 26px/1.2 ' + T.SERIF + ';color:' + T.INK + ';margin:6px 0 ' + (m.sci ? '2px' : '10px') + '">' + e(m.headline) + '</div>' +
    (m.sci ? '<div style="font:italic 14px/1.5 ' + T.SERIF + ';color:' + T.MUTE + ';margin:0 0 10px">' + e(m.sci) + '</div>' : '') +
    (m.why ? '<div style="font:15px/1.6 ' + T.SERIF + ';color:' + T.INK + ';margin:0 0 10px">' + e(m.why) + '</div>' : '') +
    [m.plant, m.link].filter(String).map(function (t) { return callout(e(t)); }).join(''), '0 0 6px'));
  if (m.also && m.also.length) {
    out.push(row('<div style="font:600 11px/1.4 ' + T.SANS + ';letter-spacing:.08em;text-transform:uppercase;color:' + T.MUTE + '">Also recorded</div>', '18px 0 6px'));
    var rows = m.also.map(function (a) {
      var p = SIG_PILLS[a.theme] || ['Sighting', T.MUTE];
      return '<tr><td style="padding:11px 0;border-bottom:1px solid ' + T.LINE + '" valign="top" width="96"><span style="display:inline-block;font:600 10px/1 ' + T.SANS +
        ';letter-spacing:.08em;text-transform:uppercase;color:#ffffff;background-color:' + p[1] + ';padding:4px 7px;border-radius:2px">' + p[0] + '</span></td>' +
        '<td style="padding:11px 0 11px 10px;border-bottom:1px solid ' + T.LINE + ';font:15px/1.4 ' + T.SANS + ';color:' + T.INK + '" valign="top"><b>' + e(a.name) + '</b>' +
        (a.sci ? ' <i style="color:' + T.MUTE + '">' + e(a.sci) + '</i>' : '') + '<br><span style="font-size:13px;color:' + T.MUTE + '">' + e(a.where) + ' · ' + e(a.when) + '</span></td></tr>';
    }).join('');
    out.push(row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ' + T.LINE + '">' + rows + '</table>', '0'));
  }
  if (m.lookups && m.lookups.near) {
    out.push(row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + T.CARD + '" style="background-color:' + T.CARD + '"><tr>' +
      '<td width="96" align="center" valign="middle" style="padding:16px 0;font:400 40px/1 ' + T.SERIF + ';color:' + T.GREEN + '">' + m.lookups.near + '</td>' +
      '<td valign="middle" style="padding:16px 16px 16px 0;font:14px/1.5 ' + T.SANS + ';color:' + T.INK + '">Since ' + e(m.lookups.sinceLabel) + ', people have looked up what originally grew at <b>' +
      m.lookups.near + ' place' + (m.lookups.near === 1 ? '' : 's') + ' within 10km</b> of ' + e(m.garden) + ' on <a href="https://findmyevc.com" style="color:' + T.INK + '">findmyevc.com</a>, and at <b>' +
      m.lookups.all + ' place' + (m.lookups.all === 1 ? '' : 's') + '</b> across Victoria.</td></tr></table>', '24px 0 0'));
  }
  if (m.studio) {
    var S = m.studio, items = '';
    for (var k = 0; k < S.items.length; k += 3) {
      items += '<tr>' + S.items.slice(k, k + 3).map(function (x) {
        return '<td width="33%" valign="top" style="padding:10px 10px 10px 0"><div style="font:600 13px/1.3 ' + T.SANS + ';color:' + T.INK + '"><span style="color:' + T.GREEN + '">●</span> ' + e(x[0]) +
          '</div><div style="font:12px/1.4 ' + T.SANS + ';color:' + T.MUTE + ';margin-top:3px">' + e(x[1]) + '</div></td>';
      }).join('') + '</tr>';
    }
    out.push(row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ' + T.INK + '"><tr><td style="padding:20px 18px">' +
      '<div style="font:600 11px/1.4 ' + T.SANS + ';letter-spacing:.1em;text-transform:uppercase;color:' + T.GREEN + '">' + e(S.eyebrow) + '</div>' +
      '<div style="font:400 28px/1.15 ' + T.SERIF + ';color:' + T.INK + ';margin:8px 0 8px">' + e(S.title) + '</div>' +
      '<div style="font:15px/1.55 ' + T.SANS + ';color:' + T.INK + ';margin:0 0 6px">' + e(S.intro) + '</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px">' + items + '</table>' +
      '<div style="font:15px/1.55 ' + T.SANS + ';color:' + T.INK + ';margin:12px 0 16px">' + e(S.close) + '</div>' + btn(S.button[0], S.button[1], true) + '</td></tr></table>', '32px 0 0'));
  }
  if (m.studioNote) out.push(row(e(m.studioNote), '22px 0 0;font:15px/1.55 ' + T.SANS + ';color:' + T.INK));
  out.push(row(btn('Add your own sightings to ' + m.garden + '\'s record', m.profile, false), '22px 0 0'));
  out.push(row(e(SIG_SIGNOFF.split('\n')[0]) + '<br><span style="font:13px ' + T.SANS + ';color:' + T.MUTE + '">' + e(SIG_SIGNOFF.split('\n')[1] || '') + '</span>', '26px 0 0;font:15px/1.6 ' + T.SERIF + ';color:' + T.INK));
  if (card && card.garden_name && !R) {
    var acc2 = card.provisional ? '#a8873f' : T.GREEN;
    out.push(row('<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="' + T.CARD + '" style="width:100%;max-width:300px;background-color:' + T.CARD + ';border:1px solid #d9ccb2"><tr><td style="padding:14px 16px">' +
      '<div style="font:11px/1.5 ' + T.MONO + ';letter-spacing:.1em;text-transform:uppercase;color:#5b6152">Ecological Registry <span style="color:' + acc2 + '">●</span></div>' +
      '<div style="font:16px/1.3 ' + T.SANS + ';color:' + T.INK + ';margin-top:8px">' + e(card.garden_name) + '</div>' +
      '<div style="font:11px/1.6 ' + T.MONO + ';text-transform:uppercase;color:' + acc2 + '">' + e(card.rating || '') + (card.provisional ? ' · provisional' : '') + '</div>' +
      (typeof card.score === 'number' ? '<div style="font:500 44px/1.1 ' + T.MONO + ';color:' + acc2 + ';margin-top:4px">' + card.score + '<span style="font-size:12px;color:#8a8f80"> / 100</span></div>' : '') +
      '<a href="' + e(card.profile) + '" style="display:block;margin-top:8px;font:13px/1.5 ' + T.SANS + ';color:' + T.INK + '">View your garden\'s record ↗</a></td></tr></table>', '24px 0 0'));
  }
  out.push(row('Part of our Ecological Registry steward pilot. Sightings are from the surrounding area, not from your garden, via the Atlas of Living Australia. Weather and soil figures are estimates for your location from Open-Meteo. Reply "pause" and we\'ll stop these notes.',
    '24px 0 8px;font:11px/1.6 ' + T.SANS + ';color:' + T.MUTE));

  return '<div style="background-color:' + T.PAPER + ';padding:0;margin:0" bgcolor="' + T.PAPER + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + T.PAPER +
    '" style="background-color:' + T.PAPER + '"><tr><td align="center" style="padding:20px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse">' +
    out.join('\n') + '</table></td></tr></table></div>';
}

/* Rebuild the frozen HTML + hash from the row's current to/subject/body
   and send it back to DRAFT. Used by onSignalsEdit and the send check. */
function _sigRefreeze(sh, row, note, fromOwnClaim) {
  var vals = sh.getRange(row, 1, 1, SIG_QUEUE_HEADERS.length).getValues()[0];
  var v = function (h) { return vals[SIG_C[h] - 1]; };
  if (!v('message_id')) return;
  var st = String(v('status'));
  if (st === 'SENT' || st === 'CHECK' || (st === 'SENDING' && !fromOwnClaim)) return;   // history is not rewritten
  var card = {}; try { card = JSON.parse(String(v('card') || '{}')); } catch (e) {}
  // Template notes keep their layout unless the text itself was edited.
  var html = card.model && String(v('body')) === _sigUpdateText(card.model) ? _sigUpdateHtml(card.model, card) : _sigHtml(v('body'), card);
  _sigSet(sh, row, { html: html, content_hash: _sigHash(v('to'), v('subject'), v('body'), html),
    status: 'DRAFT', note: note });
}

function _sigNotify(ss, drafts) {
  try {
    var lines = drafts.map(function (d) {
      return '• ' + d[SIG_C.garden_name - 1] + ' — ' + d[SIG_C.signals - 1] + ' (expires ' + d[SIG_C.expires_at - 1] + ')';
    });
    MailApp.sendEmail(NOTIFY_EMAIL, 'Garden signals: ' + drafts.length + ' draft' + (drafts.length === 1 ? '' : 's') + ' to review',
      lines.join('\n') + '\n\nReview and set status to APPROVED (evidence is in the row):\n' +
      ss.getUrl() + '#gid=' + _sigQueueSheet(ss).getSheetId());
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
    sh.getRange(2, SIG_C.status, 999, 1).setDataValidation(rule);
    sh.setColumnWidth(SIG_C.subject, 260); sh.setColumnWidth(SIG_C.body, 520);
    sh.getRange(2, SIG_C.body, 999, 1).setWrap(true);
    sh.hideColumns(SIG_C.content_hash, 4);   // content_hash, evidence, card, html
  }
  return sh;
}

function _sigSet(sh, row, fields) {
  Object.keys(fields).forEach(function (h) { sh.getRange(row, SIG_C[h]).setValue(fields[h]); });
}

function _sigPilot(ss) {
  var sh = ss.getSheetByName(SIG_PILOT), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var g = String(r[0]).trim(), e = String(r[1]).toLowerCase().trim();
    if (g && /@/.test(e)) (out[g] = out[g] || []).push(e);
  });
  return out;
}

function _sigOptouts(ss) {
  var sh = ss.getSheetByName(SIG_OPTOUT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).toLowerCase().trim(); }).filter(String);
}

function _sigEmails(s) {
  return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String);
}

/* Log entries joined to the outcome of the draft they went into.
   state: 'sent'    -- SENT, SENDING or CHECK (counts for cooldowns)
          'pending' -- DRAFT/APPROVED and not yet expired (blocks duplicates)
          'skipped' -- SKIP: you declined it (blocks that same event/species)
          'dead'    -- EXPIRED, ERROR, archived or expired-unsent (blocks nothing) */
function _sigLogIndex(ss) {
  var sh = _sigSheet(ss, SIG_LOG, SIG_LOG_HEADERS), out = {};
  if (sh.getLastRow() < 2) return out;
  var outcome = {}, q = ss.getSheetByName(SIG_QUEUE), now = Date.now();
  if (q && q.getLastRow() > 1) q.getRange(2, 1, q.getLastRow() - 1, SIG_QUEUE_HEADERS.length).getValues().forEach(function (r) {
    var st = String(r[SIG_C.status - 1]), exp = Date.parse(String(r[SIG_C.expires_at - 1]));
    var state = /^(SENT|SENDING|CHECK)$/.test(st) ? 'sent'
      : /^(DRAFT|APPROVED)$/.test(st) ? (isFinite(exp) && now <= exp ? 'pending' : 'dead')
      : st === 'SKIP' ? 'skipped' : 'dead';
    var sentAt = Date.parse(String(r[SIG_C.sent_at - 1]));
    outcome[String(r[SIG_C.message_id - 1])] = { state: state, sentAt: isFinite(sentAt) ? new Date(sentAt) : null };
  });
  sh.getRange(2, 1, sh.getLastRow() - 1, SIG_LOG_HEADERS.length).getValues().forEach(function (r) {
    var k = r[1] + '::' + r[2];
    var o = outcome[String(r[4])] || { state: 'dead', sentAt: null };
    // Delivered messages are timed from when they were sent; a SENDING/CHECK
    // row with no sent_at falls back to the draft time (conservative).
    (out[k] = out[k] || []).push({ at: (o.state === 'sent' && o.sentAt) || new Date(r[0]), key: String(r[3]), state: o.state });
  });
  return out;
}

/* Sent messages cool down for SIG_COOLDOWN days from sent_at. A pending draft blocks a
   duplicate until it expires. A skipped draft blocks only the same event
   (same key). Expired or failed drafts never block a replacement. */
function _sigCooling(log, gid, type, now, key) {
  return (log[gid + '::' + type] || []).some(function (x) {
    if (x.state === 'pending') return true;
    if (x.state === 'skipped') return !!key && x.key === key;
    if (x.state === 'sent') return (now.getTime() - x.at.getTime()) / 864e5 < (SIG_COOLDOWN[type] || 7);
    return false;
  });
}

function _sigLastAny(log, gid, types) {
  var last = 0;
  types.forEach(function (t) { (log[gid + '::' + t] || []).forEach(function (x) {
    if (x.state !== 'dead') last = Math.max(last, x.at.getTime());   // a skipped weekly note uses up the week
  }); });
  return last ? new Date(last) : null;
}

/* Unsent DRAFT/APPROVED rows past their expiry become EXPIRED. */
function _sigExpireStale(ss) {
  var q = ss.getSheetByName(SIG_QUEUE);
  if (!q || q.getLastRow() < 2) return;
  var now = Date.now();
  q.getRange(2, 1, q.getLastRow() - 1, SIG_QUEUE_HEADERS.length).getValues().forEach(function (r, i) {
    var st = String(r[SIG_C.status - 1]), exp = Date.parse(String(r[SIG_C.expires_at - 1]));
    if (/^(DRAFT|APPROVED)$/.test(st) && (!isFinite(exp) || now > exp))
      _sigSet(q, i + 2, { status: 'EXPIRED', note: 'Expired ' + r[SIG_C.expires_at - 1] + ' -- not sent' });
  });
}

function _sigKeysFor(log, gid, type, days) {
  var cut = Date.now() - days * 864e5, out = [];
  (log[gid + '::' + type] || []).forEach(function (x) {
    if (x.state !== 'dead' && x.at.getTime() >= cut) out = out.concat(x.key.split('|'));
  });
  return out;
}

/* 'primary' = script runs as hello@ecologicalregistry.org (omit `from`);
   'alias'   = it's a verified send-as alias (pass `from`); null = can't. */
function _sigSendMode() {
  try {
    if (String(Session.getEffectiveUser().getEmail()).toLowerCase() === SIG_FROM) return 'primary';
    return GmailApp.getAliases().map(function (a) { return String(a).toLowerCase(); }).indexOf(SIG_FROM) > -1 ? 'alias' : null;
  } catch (e) { return null; }
}

function _sigHash() {
  var s = Array.prototype.slice.call(arguments).map(String).join('␞');
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function _sigJson(url) {
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
  } catch (e) { return null; }
}

/* Melbourne-local midnight at the start of a YYYY-MM-DD date, as ISO. */
function _sigStartOf(ymd) {
  return Utilities.parseDate(String(ymd) + ' 00:00', SIG_TZ, 'yyyy-MM-dd HH:mm').toISOString();
}

/* 'Tuesday 3 November' (or 'Tue 3 Nov' when short) from YYYY-MM-DD */
function _sigDate(ymd, short) {
  var p = String(ymd).split('-').map(Number);
  var dow = SIG_DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()], mon = SIG_MONTHS[p[1] - 1];
  return short ? dow.slice(0, 3) + ' ' + p[2] + ' ' + mon.slice(0, 3) : dow + ' ' + p[2] + ' ' + mon;
}

/* "Sam Cox" -> "Sam"; "Richard and Jenny" -> "Richard & Jenny";
   "Sara & Fede" unchanged. */
function _sigFirstNames(s) {
  return String(s).split(/\s*(?:&|\band\b|,)\s*/i).filter(String)
    .map(function (n) { return n.trim().split(/\s+/)[0]; }).join(' & ');
}

function _sigRange(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }
function _sigMelbDay(d) { return Number(Utilities.formatDate(d, SIG_TZ, 'u')) % 7; }
function _sigMelbMonth(d) { return Number(Utilities.formatDate(d, SIG_TZ, 'M')); }
function _sigJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
