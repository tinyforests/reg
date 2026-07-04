/* ============================================================
   Ecological Registry — Self-Enrolment Ramp backend
   Google Apps Script — deploy as Web App:
     Execute as: Me
     Who has access: Anyone

   Hardening (Jul 2026):
   - Shared secret check (same value as SHARED_SECRET in prototype JS)
   - Global hourly rate limit via CacheService (20 submissions/hr)
   - Per-email hourly dedup (1 submission per email per hour)

   Note on IP rate limiting: Apps Script web apps do not expose the
   client IP address, so per-IP limiting (as originally described in
   pending-work.md) is not achievable in pure Apps Script. The global
   hourly cap + per-email dedup is the practical ceiling without a
   Cloud Run or similar proxy layer.

   After editing this file, deploy a NEW version in the Apps Script
   editor (Deploy → Manage deployments → New version). The /exec URL
   stays the same; the prototype does not need updating.
   ============================================================ */

var SHARED_SECRET   = 'er-reg-7f4a2b9d';
var RATE_GLOBAL_MAX = 20;    // max total submissions per hour (all users)
var RATE_CACHE_TTL  = 3600;  // cache entry lifetime in seconds (1 hour)

function doGet(e) {
  return jsonResp({status: 'Self-Enrolment endpoint is live', timestamp: new Date().toISOString()});
}

function doPost(e) {
  var cache = CacheService.getScriptCache();

  try {
    var payload = JSON.parse(e.postData.contents);

    // Shared secret
    if (payload.shared_secret !== SHARED_SECRET) {
      return jsonResp({ok: false, error: 'Forbidden'});
    }

    // Global hourly rate limit
    var bucket    = hourBucket();
    var globalKey = 'global_' + bucket;
    var globalCount = parseInt(cache.get(globalKey) || '0', 10);
    if (globalCount >= RATE_GLOBAL_MAX) {
      return jsonResp({ok: false, error: 'Too many submissions — try again in an hour.'});
    }

    // Per-email dedup
    var email = (payload.steward_email || '').toLowerCase().trim();
    if (email) {
      var emailKey = 'email_' + bucket + '_' + email;
      if (cache.get(emailKey)) {
        return jsonResp({ok: false, error: 'A submission from this email was already received this hour.'});
      }
    }

    // Write to sheet — strip secret before logging
    delete payload.shared_secret;
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Submissions') || ss.getActiveSheet();
    sheet.appendRow([
      new Date().toISOString(),
      payload.steward_name             || '',
      payload.steward_email            || '',
      payload.garden_address           || '',
      payload.provisional_score_total  || 0,
      payload.provisional_tier         || '',
      payload.consent_record           ? 'yes' : 'no',
      payload.consent_public_score     ? 'yes' : 'no',
      payload.consent_contact_about_visit ? 'yes' : 'no',
      payload.consent_aggregate_stats  ? 'yes' : 'no',
      JSON.stringify(payload)
    ]);

    // Increment counters after successful write
    cache.put(globalKey, String(globalCount + 1), RATE_CACHE_TTL);
    if (email) {
      cache.put('email_' + bucket + '_' + email, '1', RATE_CACHE_TTL);
    }

    return jsonResp({ok: true});

  } catch (err) {
    return jsonResp({ok: false, error: 'Server error: ' + err.message});
  }
}

function hourBucket() {
  var d = new Date();
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' +
         pad(d.getUTCDate()) + '-' + pad(d.getUTCHours());
}

function pad(n) { return n < 10 ? '0' + n : String(n); }

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
