/* ============================================================
   Ecological Registry -- Self-Enrolment Ramp backend
   Google Apps Script -- deploy as Web App:
     Execute as: Me
     Who has access: Anyone

   Hardening (Jul 2026):
   - Global hourly rate limit via CacheService (20 submissions/hr)
   - Per-email hourly dedup (1 submission per email per hour)

   Note: shared-secret check was added and then reverted 4 Jul 2026
   (commit d925592) after causing deployment confusion -- see
   pending-work.md 'Self-Enrolment endpoint hardening' entry for
   full history. Do not re-add without also updating the prototype's
   payload to send it.

   Note on IP rate limiting: Apps Script web apps do not expose the
   client IP address, so per-IP limiting (as originally described in
   pending-work.md) is not achievable in pure Apps Script. The global
   hourly cap + per-email dedup is the practical ceiling without a
   Cloud Run or similar proxy layer.

   Notifications (Jul 2026):
   - Email to NOTIFY_EMAIL on every submission
   - Confirmation email to steward on every submission (if email given)
   Both non-fatal -- a MailApp failure does not block the submission
   from being recorded.

   After editing this file, deploy a NEW version in the Apps Script
   editor (Deploy -> Manage deployments -> New version). The /exec URL
   stays the same; the prototype does not need updating.
   ============================================================ */

var NOTIFY_EMAIL    = 'hello@lundbech.me';
var RATE_GLOBAL_MAX = 20;    // max total submissions per hour (all users)
var RATE_CACHE_TTL  = 3600;  // cache entry lifetime in seconds (1 hour)

function doGet(e) {
  return jsonResp({status: 'Self-Enrolment endpoint is live', timestamp: new Date().toISOString()});
}

function doPost(e) {
  var cache = CacheService.getScriptCache();

  try {
    var payload = JSON.parse(e.postData.contents);

    // Global hourly rate limit
    var bucket    = hourBucket();
    var globalKey = 'global_' + bucket;
    var globalCount = parseInt(cache.get(globalKey) || '0', 10);
    if (globalCount >= RATE_GLOBAL_MAX) {
      return jsonResp({ok: false, error: 'Too many submissions -- try again in an hour.'});
    }

    // Per-email dedup
    var email = (payload.steward_email || '').toLowerCase().trim();
    if (email) {
      var emailKey = 'email_' + bucket + '_' + email;
      if (cache.get(emailKey)) {
        return jsonResp({ok: false, error: 'A submission from this email was already received this hour.'});
      }
    }

    // Generate once -- threaded through sheet write and both emails
    var submissionId = 'SUB-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    var submittedAt  = new Date().toISOString();
    var name    = payload.steward_name            || '';
    var address = payload.garden_address          || '';
    var score   = payload.provisional_score_total || 0;
    var tier    = payload.provisional_tier        || '';

    // Write to sheet -- 26 columns matching live sheet structure exactly
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Submissions') || ss.getActiveSheet();
    sheet.appendRow([
      submittedAt,                                   // A  timestamp
      submissionId,                                  // B  submission_id
      name,                                          // C  steward_name
      email,                                         // D  steward_email
      address,                                       // E  garden_address
      payload.bio_q1_indigenous_species   || 0,      // F  bio_q1_indigenous_species
      payload.bio_q2_indigenous_dominant  || 0,      // G  bio_q2_indigenous_dominant
      payload.bio_q3_layers               || 0,      // H  bio_q3_layers
      payload.bio_q4_canopy               || 0,      // I  bio_q4_canopy
      payload.soil_q1_condition           || 0,      // J  soil_q1_condition
      payload.soil_q2_water               || 0,      // K  soil_q2_water
      payload.soil_q3_features            || 0,      // L  soil_q3_features
      payload.habitat_q1_zones            || 0,      // M  habitat_q1_zones
      payload.habitat_q2_features         || 0,      // N  habitat_q2_features
      payload.habitat_q3_wildlife         || 0,      // O  habitat_q3_wildlife
      payload.conn_q1_park                || 0,      // P  conn_q1_park
      payload.evidence_q1_records         || 0,      // Q  evidence_q1_records
      score,                                         // R  provisional_score_total
      tier,                                          // S  provisional_tier
      payload.consent_record,                        // T  consent_record (boolean)
      payload.consent_public_score,                  // U  consent_public_score (boolean)
      payload.consent_contact_about_visit,           // V  consent_contact_about_visit (boolean)
      payload.consent_aggregate_stats,               // W  consent_aggregate_stats (boolean)
      'pending',                                     // X  review_status
      '',                                            // Y  review_notes
      ''                                             // Z  published_garden_id
    ]);

    // Increment rate-limit counters
    cache.put(globalKey, String(globalCount + 1), RATE_CACHE_TTL);
    if (email) {
      cache.put('email_' + bucket + '_' + email, '1', RATE_CACHE_TTL);
    }

    // Email 1 -- notification to Tyson
    try {
      var sheetUrl = ss.getUrl();
      var notifyBody =
        'New self-enrolment submission\n' +
        '\n' +
        'Steward name:    ' + name         + '\n' +
        'Steward email:   ' + email        + '\n' +
        'Garden address:  ' + address      + '\n' +
        'Score:           ' + score        + '/100\n' +
        'Tier:            ' + tier         + '\n' +
        'Submission ID:   ' + submissionId + '\n' +
        'Submitted:       ' + submittedAt  + '\n' +
        '\n' +
        'Review this submission at: ' + sheetUrl;
      MailApp.sendEmail({
        to:      NOTIFY_EMAIL,
        subject: 'New self-enrolment submission: ' + tier + ' - ' + score + '/100',
        body:    notifyBody
      });
    } catch (mailErr) {}

    // Email 2 -- confirmation to steward
    if (email) {
      try {
        var stewardBody =
          'Thank you for registering your garden with the Ecological Registry.\n' +
          '\n' +
          'We\'ve received your submission and your provisional ecological score is ' + score + '/100 -- tier: ' + tier + '.\n' +
          '\n' +
          'Your garden will appear on the public registry as a provisional entry within 48 hours. \'Provisional\' means your score is self-reported and awaiting a steward visit to confirm it. A verification visit is what turns a provisional score into a verified one -- we\'ll be in touch separately about that pathway if you\'d like to explore it.\n' +
          '\n' +
          'Your submission ID is: ' + submissionId + '\n' +
          '\n' +
          'If you\'d like to update or withdraw your registration at any time, just reply to this email.\n' +
          '\n' +
          'Warmly,\n' +
          'Tyson Lundbech\n' +
          'Gardener & Son\n' +
          'Ecological Registry\n' +
          'ecologicalregistry.org';
        MailApp.sendEmail({
          to:      email,
          subject: 'Your garden registration was received -- Ecological Registry',
          body:    stewardBody
        });
      } catch (mailErr) {}
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
