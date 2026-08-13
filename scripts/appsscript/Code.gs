/* ============================================================
   Ecological Registry -- Self-Enrolment Ramp backend
   Google Apps Script -- deploy as Web App:
     Execute as: Me
     Who has access: Anyone

   Handles two submission types, routed on payload.submission_type:
     (no type / 'enrolment') -> handleEnrolment()  -> Submissions sheet
     'opportunity_claim'     -> handleClaim()       -> Claims sheet

   Claims are routed BEFORE enrolment rate limits because a steward
   may legitimately claim several completed items in one sitting, and
   the per-email enrolment dedup (1/hr) would incorrectly block that.

   Enrolment hardening:
   - Global hourly rate limit via CacheService (20 submissions/hr)
   - Per-email hourly dedup (1 submission per email per hour)

   Claim hardening:
   - Separate global cap (40 claims/hr)
   - Per-email cap (10 claims/hr)
   - Sheet dedup: same garden + opportunity + steward still 'pending'
     is rejected regardless of time elapsed

   Note: shared-secret check was added and then reverted 4 Jul 2026
   (commit d925592) after causing deployment confusion -- see
   pending-work.md 'Self-Enrolment endpoint hardening' for history.
   Do not re-add without also updating the prototype payload to send it.

   Note on IP rate limiting: Apps Script web apps do not expose the
   client IP address, so per-IP limiting is not achievable in pure
   Apps Script. The global hourly cap + per-email dedup is the
   practical ceiling without a Cloud Run or similar proxy layer.

   After editing this file, deploy a NEW version in the Apps Script
   editor (Deploy -> Manage deployments -> New version). The /exec URL
   stays the same; no client changes needed.
   ============================================================ */

var NOTIFY_EMAIL     = 'hello@lundbech.me';
var RATE_GLOBAL_MAX  = 20;   // max enrolment submissions per hour (all users)
var CLAIM_RATE_MAX   = 40;   // max claims per hour (all users)
var CLAIM_EMAIL_MAX  = 10;   // max claims per email per hour
var RATE_CACHE_TTL   = 3600; // cache entry lifetime in seconds (1 hour)
var TOKEN_EXPIRY_MS  = 30 * 60 * 1000; // magic link lifetime: 30 minutes
var BASE_URL         = 'https://ecologicalregistry.org/gardens/';

var CLAIM_TOKEN_HEADERS = ['token', 'garden_id', 'email', 'created_at', 'expires_at', 'used'];

/* ---- Health check + steward verification ---- */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};

  if (params.action === 'verify_steward')  return handleVerifySteward(params);
  if (params.action === 'request_claim')   return handleRequestClaim(params);
  if (params.action === 'verify_claim')    return handleVerifyClaimToken(params);

  return jsonResp({status: 'Self-Enrolment endpoint is live', timestamp: new Date().toISOString()});
}

/*
 * Checks whether an email has a claim record for a garden.
 * Used by reg-identity.js to re-link a steward on a new device.
 * Returns {ok:true} if found, {ok:false, error:...} otherwise.
 * Deliberately returns no data beyond ok/not-ok to avoid enumeration.
 */
function handleVerifySteward(params) {
  var email    = safeStr((params.email     || '').toLowerCase().trim(), 254);
  var gardenId = safeStr((params.garden_id || '').trim(), 40);

  if (!email || !gardenId) {
    return jsonResp({ok: false, error: 'email and garden_id are required.'});
  }

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var claims = ss.getSheetByName('Claims');

  if (!claims || claims.getLastRow() <= 1) {
    return jsonResp({ok: false, error: 'No claim found for this email on this garden.'});
  }

  var data    = claims.getRange(2, 1, claims.getLastRow() - 1, claims.getLastColumn()).getValues();
  var iGarden = CLAIM_HEADERS.indexOf('garden_id');
  var iEmail  = CLAIM_HEADERS.indexOf('steward_email');

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][iGarden]).toLowerCase() === gardenId.toLowerCase() &&
        String(data[i][iEmail]).toLowerCase()  === email) {
      return jsonResp({ok: true});
    }
  }

  return jsonResp({ok: false, error: 'No claim found for this email on this garden.'});
}

/*
 * Returns true if email is on record as a steward for gardenId.
 * Checks three sources in order:
 *   1. 'Steward Emails' sheet — manually managed by G&S for verified gardens
 *      Columns: garden_id | steward_email | notes
 *   2. 'Submissions' sheet — self-enrolled gardens that have been published
 *      Column D = steward_email, Column Z = published_garden_id
 *   3. 'Claims' sheet — existing opportunity claims
 */
function isKnownSteward(email, gardenId) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var eLower = email.toLowerCase().trim();
  var gLower = gardenId.toLowerCase().trim();

  // 1. Steward Emails sheet
  var stewardSheet = ss.getSheetByName('Steward Emails');
  if (stewardSheet && stewardSheet.getLastRow() > 1) {
    var sd = stewardSheet.getRange(2, 1, stewardSheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < sd.length; i++) {
      if (String(sd[i][0]).toLowerCase() === gLower &&
          String(sd[i][1]).toLowerCase() === eLower) return true;
    }
  }

  // 2. Submissions sheet — published gardens only (col Z = published_garden_id)
  var subSheet = ss.getSheetByName('Submissions');
  if (subSheet && subSheet.getLastRow() > 1) {
    var subData = subSheet.getRange(2, 1, subSheet.getLastRow() - 1, 26).getValues();
    for (var j = 0; j < subData.length; j++) {
      if (String(subData[j][25]).toLowerCase() === gLower &&
          String(subData[j][3]).toLowerCase()  === eLower) return true;
    }
  }

  // 3. Claims sheet
  var claimsSheet = ss.getSheetByName('Claims');
  if (claimsSheet && claimsSheet.getLastRow() > 1) {
    var cd = claimsSheet.getRange(2, 1, claimsSheet.getLastRow() - 1, claimsSheet.getLastColumn()).getValues();
    var iG = CLAIM_HEADERS.indexOf('garden_id');
    var iE = CLAIM_HEADERS.indexOf('steward_email');
    for (var k = 0; k < cd.length; k++) {
      if (String(cd[k][iG]).toLowerCase() === gLower &&
          String(cd[k][iE]).toLowerCase() === eLower) return true;
    }
  }

  return false;
}

/* Generates a cryptographically adequate random token (32 chars, url-safe). */
function generateToken() {
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var token = '';
  for (var i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/*
 * request_claim — called via GET ?action=request_claim&email=...&garden_id=...&garden_slug=...
 *
 * Checks whether the email is on record for the garden. If yes, generates a
 * short-lived magic-link token and emails it. Always returns the same success
 * message regardless of whether the email was found (prevents enumeration).
 */
function handleRequestClaim(params) {
  var email      = safeStr((params.email       || '').toLowerCase().trim(), 254);
  var gardenId   = safeStr((params.garden_id   || '').trim(), 40);
  var gardenSlug = safeStr((params.garden_slug || '').trim(), 80);

  if (!email || !gardenId) {
    return jsonResp({ok: false, error: 'email and garden_id are required.'});
  }

  // Rate-limit: max 3 token requests per email per hour
  var cache    = CacheService.getScriptCache();
  var rlKey    = 'claim_req_' + hourBucket() + '_' + email;
  var rlCount  = parseInt(cache.get(rlKey) || '0', 10);
  if (rlCount >= 3) {
    return jsonResp({ok: true, message: 'If your email is on record for this garden, we have sent you a magic link. Check your inbox — it expires in 30 minutes.'});
  }
  cache.put(rlKey, String(rlCount + 1), RATE_CACHE_TTL);

  var SAFE_MSG = 'If your email is on record for this garden, we have sent you a magic link. Check your inbox — it expires in 30 minutes.';

  if (!isKnownSteward(email, gardenId)) {
    return jsonResp({ok: true, message: SAFE_MSG});
  }

  // Generate and store token
  var token      = generateToken();
  var now        = new Date();
  var expiresAt  = new Date(now.getTime() + TOKEN_EXPIRY_MS);
  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var tokenSheet = ss.getSheetByName('Claim Tokens');
  if (!tokenSheet) {
    tokenSheet = ss.insertSheet('Claim Tokens');
    tokenSheet.appendRow(CLAIM_TOKEN_HEADERS);
  } else if (tokenSheet.getLastRow() === 0) {
    tokenSheet.appendRow(CLAIM_TOKEN_HEADERS);
  }
  tokenSheet.appendRow([token, gardenId, email, now.toISOString(), expiresAt.toISOString(), false]);

  // Build and send magic link
  var link = BASE_URL + (gardenSlug ? gardenSlug + '/' : '') + '?claim=' + token;
  try {
    MailApp.sendEmail({
      to:      email,
      subject: 'Claim your garden profile — Ecological Registry',
      body: [
        'Click the link below to claim your garden profile on the Ecological Registry.',
        '',
        link,
        '',
        'This link expires in 30 minutes and can only be used once.',
        'If you did not request this, you can ignore this email.',
        '',
        'Ecological Registry',
        'ecologicalregistry.org'
      ].join('\n')
    });
  } catch (mailErr) {
    try {
      var dbg = ss.getSheetByName('Debug log') || ss.insertSheet('Debug log');
      dbg.appendRow([new Date().toISOString(), 'claim token email', mailErr.message]);
    } catch (e2) {}
  }

  return jsonResp({ok: true, message: SAFE_MSG});
}

/*
 * verify_claim — called via GET ?action=verify_claim&token=...&garden_id=...
 *
 * Validates the token. If valid, marks it used and returns {ok:true, email:...}
 * so the client can call markSteward(gardenId, email).
 */
function handleVerifyClaimToken(params) {
  var token    = safeStr((params.token     || '').trim(), 64);
  var gardenId = safeStr((params.garden_id || '').trim(), 40);

  if (!token || !gardenId) {
    return jsonResp({ok: false, error: 'token and garden_id are required.'});
  }

  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var tokenSheet = ss.getSheetByName('Claim Tokens');

  if (!tokenSheet || tokenSheet.getLastRow() <= 1) {
    return jsonResp({ok: false, error: 'Invalid or expired link.'});
  }

  var data     = tokenSheet.getRange(2, 1, tokenSheet.getLastRow() - 1, CLAIM_TOKEN_HEADERS.length).getValues();
  var iToken   = CLAIM_TOKEN_HEADERS.indexOf('token');
  var iGarden  = CLAIM_TOKEN_HEADERS.indexOf('garden_id');
  var iEmail   = CLAIM_TOKEN_HEADERS.indexOf('email');
  var iExpires = CLAIM_TOKEN_HEADERS.indexOf('expires_at');
  var iUsed    = CLAIM_TOKEN_HEADERS.indexOf('used');

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[iToken]) !== token) continue;

    if (String(row[iGarden]).toLowerCase() !== gardenId.toLowerCase()) {
      return jsonResp({ok: false, error: 'Invalid or expired link.'});
    }
    if (row[iUsed] === true || String(row[iUsed]).toLowerCase() === 'true') {
      return jsonResp({ok: false, error: 'This link has already been used. Request a new one from your garden profile.'});
    }
    var expires = new Date(String(row[iExpires]));
    if (isNaN(expires.getTime()) || new Date() > expires) {
      return jsonResp({ok: false, error: 'This link has expired. Request a new one from your garden profile.'});
    }

    // Valid — mark used (sheet row = i + 2, column = iUsed + 1, both 1-indexed)
    tokenSheet.getRange(i + 2, iUsed + 1).setValue(true);

    return jsonResp({ok: true, email: String(row[iEmail])});
  }

  return jsonResp({ok: false, error: 'Invalid or expired link.'});
}

/* ---- Auth helper (run once from editor to grant MailApp scope) ---- */
function authorizeMail() {
  MailApp.sendEmail({
    to:      NOTIFY_EMAIL,
    subject: 'Auth test -- Self-Enrolment endpoint',
    body:    'If you received this, MailApp is now authorized.'
  });
}

/* ---- Router ---- */
function doPost(e) {
  var cache = CacheService.getScriptCache();

  try {
    var payload = JSON.parse(e.postData.contents);

    // Claims bypass enrolment rate limits -- route first.
    if (payload.submission_type === 'opportunity_claim') {
      return handleClaim(payload, cache);
    }

    if (payload.submission_type === 'voucher_email') {
      return handleVoucherEmail(payload);
    }

    return handleEnrolment(payload, cache);

  } catch (err) {
    return jsonResp({ok: false, error: 'Server error: ' + err.message});
  }
}

/* ---- Payload sanitisation ---- */

// Strips leading formula-injection characters from a string cell value.
function safeStr(v, maxLen) {
  var s = String(v == null ? '' : v).trim();
  if (s.length > (maxLen || 500)) s = s.slice(0, maxLen || 500);
  return /^[=+\-@|]/.test(s) ? ("'" + s) : s;
}

var KNOWN_TIERS = [
  'Basic Garden', 'Habitat Garden', 'Ecological Garden',
  'Registered Ecological Garden', 'High Habitat Garden', 'Urban Biodiversity Node'
];

/* ---- Enrolment handler ---- */
function handleEnrolment(payload, cache) {
  var bucket      = hourBucket();
  var globalKey   = 'global_' + bucket;
  var globalCount = parseInt(cache.get(globalKey) || '0', 10);

  if (globalCount >= RATE_GLOBAL_MAX) {
    return jsonResp({ok: false, error: 'Too many submissions -- try again in an hour.'});
  }

  var email = safeStr((payload.steward_email || '').toLowerCase(), 254);
  if (!email) {
    return jsonResp({ok: false, error: 'steward_email is required.'});
  }
  if (email) {
    var emailKey = 'email_' + bucket + '_' + email;
    if (cache.get(emailKey)) {
      return jsonResp({ok: false, error: 'A submission from this email was already received this hour.'});
    }
  }

  var name        = safeStr(payload.steward_name    || '', 120);
  var address     = safeStr(payload.garden_address  || '', 200);
  var suburb      = safeStr(payload.garden_suburb   || '', 120);
  var gardenName  = safeStr(payload.garden_name     || '', 120);
  var gardenLat   = safeStr(payload.garden_lat      || '', 20);
  var gardenLng   = safeStr(payload.garden_lng      || '', 20);
  var parkName    = safeStr(payload.park_name       || '', 120);
  var parkLat     = safeStr(payload.park_lat        || '', 20);
  var parkLng     = safeStr(payload.park_lng        || '', 20);
  var parkDistM   = safeStr(payload.park_distance_m || '', 10);
  if (!name)    return jsonResp({ok: false, error: 'steward_name is required.'});
  if (!address) return jsonResp({ok: false, error: 'garden_address is required.'});

  // Accept client score only if it is a reasonable integer in range; discard otherwise.
  var rawScore = parseInt(payload.provisional_score_total, 10);
  var score    = (isNaN(rawScore) || rawScore < 0 || rawScore > 100) ? 0 : rawScore;
  // Accept client tier only if it is one of the known tier strings.
  var tier     = (KNOWN_TIERS.indexOf(payload.provisional_tier) !== -1)
                 ? payload.provisional_tier : '';

  var submissionId = 'SUB-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  var submittedAt  = new Date().toISOString();

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Submissions') || ss.getActiveSheet();

  sheet.appendRow([
    submittedAt,                                   // A  timestamp
    submissionId,                                  // B  submission_id
    name,                                          // C  steward_name
    email,                                         // D  steward_email
    address,                                       // E  garden_address
    parseInt(payload.bio_q1_indigenous_species,  10) || 0,  // F  bio_q1_indigenous_species
    parseInt(payload.bio_q2_indigenous_dominant, 10) || 0,  // G  bio_q2_indigenous_dominant
    parseInt(payload.bio_q3_layers,              10) || 0,  // H  bio_q3_layers
    parseInt(payload.bio_q4_canopy,              10) || 0,  // I  bio_q4_canopy
    parseInt(payload.soil_q1_condition,          10) || 0,  // J  soil_q1_condition
    parseInt(payload.soil_q2_water,              10) || 0,  // K  soil_q2_water
    parseInt(payload.soil_q3_features,           10) || 0,  // L  soil_q3_features
    parseInt(payload.habitat_q1_zones,           10) || 0,  // M  habitat_q1_zones
    parseInt(payload.habitat_q2_features,        10) || 0,  // N  habitat_q2_features
    parseInt(payload.habitat_q3_wildlife,        10) || 0,  // O  habitat_q3_wildlife
    parseInt(payload.conn_q1_park,               10) || 0,  // P  conn_q1_park
    parseInt(payload.evidence_q1_records,        10) || 0,  // Q  evidence_q1_records
    score,                                         // R  provisional_score_total
    tier,                                          // S  provisional_tier
    payload.consent_record,                        // T  consent_record (boolean)
    payload.consent_public_score,                  // U  consent_public_score (boolean)
    payload.consent_contact_about_visit,           // V  consent_contact_about_visit (boolean)
    payload.consent_aggregate_stats,               // W  consent_aggregate_stats (boolean)
    'pending',                                     // X  review_status
    '',                                            // Y  review_notes
    '',                                            // Z  published_garden_id
    safeStr(payload.evc_code      || '', 50),      // AA evc_code
    safeStr(payload.evc_name      || '', 120),     // AB evc_name
    safeStr(payload.garden_country || '', 80),     // AC garden_country
    safeStr(payload.garden_region  || '', 80),     // AD garden_region
    gardenName,                                    // AE garden_name
    suburb,                                        // AF garden_suburb
    gardenLat,                                     // AG garden_lat
    gardenLng,                                     // AH garden_lng
    parkName,                                      // AI park_name
    parkLat,                                       // AJ park_lat
    parkLng,                                       // AK park_lng
    parkDistM                                      // AL park_distance_m
  ]);

  cache.put(globalKey, String(globalCount + 1), RATE_CACHE_TTL);
  if (email) {
    cache.put('email_' + bucket + '_' + email, '1', RATE_CACHE_TTL);
  }

  // Notification to Tyson
  try {
    var sheetUrl    = ss.getUrl();
    var notifyBody  = [
      'New self-enrolment submission',
      '',
      'Steward name:    ' + name,
      'Steward email:   ' + email,
      'Garden address:  ' + address,
      'Garden name:     ' + (gardenName || '(not provided)'),
      'Suburb:          ' + (suburb || '(not provided)'),
      'Coordinates:     ' + (gardenLat && gardenLng ? gardenLat + ', ' + gardenLng : '(not resolved)'),
      'EVC:             ' + (safeStr(payload.evc_code || '', 50) || '(not resolved)') + ' ' + (safeStr(payload.evc_name || '', 120) || ''),
      'Nearest park:    ' + (parkName || '(not resolved)') + (parkDistM ? ' · ' + parkDistM + 'm' : ''),
      'Score:           ' + score + '/100',
      'Tier:            ' + tier,
      'Submission ID:   ' + submissionId,
      'Submitted:       ' + submittedAt,
      '',
      'Review at: ' + sheetUrl
    ].join('\n');
    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: 'New self-enrolment: ' + tier + ' - ' + score + '/100',
      body:    notifyBody
    });
  } catch (mailErr) {
    try {
      var dbg = ss.getSheetByName('Debug log') || ss.insertSheet('Debug log');
      dbg.appendRow([new Date().toISOString(), 'enrolment notification email', mailErr.message]);
    } catch (e2) {}
  }

  // Confirmation to steward
  if (email) {
    try {
      var stewardBody = [
        'Thank you for registering your garden with the Ecological Registry.',
        '',
        'We have received your submission and your provisional ecological score is ' + score + '/100 -- tier: ' + tier + '.',
        '',
        'Your garden will appear on the public registry as a provisional entry within 48 hours. Provisional means your score is self-reported and awaiting a steward visit to confirm it. A verification visit is what turns a provisional score into a verified one. We will be in touch separately about that pathway if you would like to explore it.',
        '',
        'Your submission ID is: ' + submissionId,
        '',
        'If you would like to update or withdraw your registration at any time, just reply to this email.',
        '',
        'Warmly,',
        'Tyson Lundbech',
        'Gardener and Son',
        'Ecological Registry',
        'ecologicalregistry.org'
      ].join('\n');
      MailApp.sendEmail({
        to:      email,
        subject: 'Your garden registration was received -- Ecological Registry',
        body:    stewardBody
      });
    } catch (mailErr) {
      try {
        var dbg2 = ss.getSheetByName('Debug log') || ss.insertSheet('Debug log');
        dbg2.appendRow([new Date().toISOString(), 'enrolment steward email', mailErr.message]);
      } catch (e2) {}
    }
  }

  return jsonResp({ok: true});
}

/* ---- Claim photo storage ---- */

var CLAIM_PHOTO_FOLDER = 'Ecological Registry — Claim Photos';

/*
 * Decodes a canvas data URL (data:image/jpeg;base64,...) and saves it
 * to a Drive folder. Returns the view URL, or '' on any failure.
 * Only accepts data:image/* URLs — rejects anything else before touching Drive.
 */
function saveClaimPhoto(dataUrl, gardenId, oppId) {
  try {
    if (!dataUrl || dataUrl.indexOf('data:image/') !== 0) return '';
    var comma = dataUrl.indexOf(',');
    if (comma === -1) return '';
    var base64 = dataUrl.slice(comma + 1);
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64),
      'image/jpeg',
      safeStr(gardenId, 40) + '_' + safeStr(oppId, 60) + '_' + Date.now() + '.jpg'
    );
    var folders = DriveApp.getFoldersByName(CLAIM_PHOTO_FOLDER);
    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(CLAIM_PHOTO_FOLDER);
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return '';
  }
}

/* ---- Claim handler ---- */

var CLAIM_HEADERS = [
  'timestamp', 'garden_id', 'garden_name', 'opportunity_id',
  'opportunity_action', 'opportunity_points', 'steward_name',
  'steward_email', 'note', 'claimed_at', 'review_status', 'photo_url'
];

function handleClaim(payload, cache) {
  var bucket   = hourBucket();
  var email    = safeStr((payload.steward_email  || '').toLowerCase(), 254);
  var gardenId = safeStr((payload.garden_id      || '').trim(), 40);
  var oppId    = safeStr((payload.opportunity_id || '').trim(), 60);

  if (!gardenId || !oppId) {
    return jsonResp({ok: false, error: 'garden_id and opportunity_id are required.'});
  }

  // Global claim rate limit
  var cGlobalKey   = 'claim_global_' + bucket;
  var cGlobalCount = parseInt(cache.get(cGlobalKey) || '0', 10);
  if (cGlobalCount >= CLAIM_RATE_MAX) {
    return jsonResp({ok: false, error: 'Too many claims -- try again in an hour.'});
  }

  // Per-email claim rate limit
  var cEmailCount = 0;
  if (email) {
    var cEmailKey = 'claim_email_' + bucket + '_' + email;
    cEmailCount   = parseInt(cache.get(cEmailKey) || '0', 10);
    if (cEmailCount >= CLAIM_EMAIL_MAX) {
      return jsonResp({ok: false, error: 'Too many claims from this email -- try again in an hour.'});
    }
  }

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var claims = ss.getSheetByName('Claims');

  // Create sheet with headers on first use; backfill photo_url header if missing
  if (!claims) {
    claims = ss.insertSheet('Claims');
    claims.appendRow(CLAIM_HEADERS);
  } else if (claims.getLastRow() === 0) {
    claims.appendRow(CLAIM_HEADERS);
  } else if (claims.getLastColumn() < CLAIM_HEADERS.length) {
    claims.getRange(1, CLAIM_HEADERS.length).setValue('photo_url');
  }

  // Sheet dedup: same garden + opportunity + steward with review_status = 'pending'
  var lastRow = claims.getLastRow();
  if (lastRow > 1) {
    var data      = claims.getRange(2, 1, lastRow - 1, claims.getLastColumn()).getValues();
    var iGarden   = CLAIM_HEADERS.indexOf('garden_id');
    var iOpp      = CLAIM_HEADERS.indexOf('opportunity_id');
    var iEmail    = CLAIM_HEADERS.indexOf('steward_email');
    var iStatus   = CLAIM_HEADERS.indexOf('review_status');
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[iGarden]).toLowerCase() === gardenId.toLowerCase() &&
          String(row[iOpp]).toLowerCase()    === oppId.toLowerCase()    &&
          String(row[iEmail]).toLowerCase()  === email                  &&
          String(row[iStatus]).toLowerCase() === 'pending') {
        return jsonResp({ok: false, error: 'This claim is already pending review.'});
      }
    }
  }

  var now = new Date().toISOString();

  // Save photo to Drive before writing the row (non-fatal — empty string if it fails)
  var photoUrl = '';
  if (payload.photo_base64 && String(payload.photo_base64).indexOf('data:image/') === 0) {
    photoUrl = saveClaimPhoto(payload.photo_base64, gardenId, oppId);
  }

  claims.appendRow([
    now,                                              // timestamp
    safeStr(gardenId, 40),                            // garden_id
    safeStr(payload.garden_name       || '', 120),    // garden_name
    safeStr(oppId, 60),                               // opportunity_id
    safeStr(payload.opportunity_action || '', 200),   // opportunity_action
    parseInt(payload.opportunity_points, 10) || '',   // opportunity_points
    safeStr(payload.steward_name      || '', 120),    // steward_name
    email,                                            // steward_email (already safeStr'd)
    safeStr(payload.note              || '', 500),    // note
    payload.claimed_at        || now,                 // claimed_at
    'pending',                                        // review_status
    photoUrl                                          // photo_url (Drive view link or '')
  ]);

  // Increment rate-limit counters
  cache.put(cGlobalKey, String(cGlobalCount + 1), RATE_CACHE_TTL);
  if (email) {
    cache.put('claim_email_' + bucket + '_' + email, String(cEmailCount + 1), RATE_CACHE_TTL);
  }

  // Non-fatal notification
  try {
    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: 'Claim: ' + (payload.opportunity_action || oppId) + ' -- ' + (payload.garden_name || gardenId),
      body: [
        'New opportunity claim',
        '',
        'Garden:      ' + (payload.garden_name || gardenId) + ' (' + gardenId + ')',
        'Opportunity: ' + (payload.opportunity_action || oppId) + ' (' + oppId + ')',
        'Points:      ' + (payload.opportunity_points || '--'),
        'Steward:     ' + (payload.steward_name || '') + ' <' + email + '>',
        'Note:        ' + (payload.note || '--'),
        'Claimed at:  ' + (payload.claimed_at || now),
        'Photo:       ' + (photoUrl || 'none'),
        '',
        'Review in the Claims tab.'
      ].join('\n')
    });
  } catch (mailErr) {
    try {
      var dbg3 = ss.getSheetByName('Debug log') || ss.insertSheet('Debug log');
      dbg3.appendRow([new Date().toISOString(), 'claim notification email', mailErr.message]);
    } catch (e2) {}
  }

  return jsonResp({ok: true});
}

/* ---- Voucher email log handler ---- */

var VOUCHER_EMAIL_HEADERS = [
  'timestamp', 'garden_id', 'garden_name', 'email', 'plants_selected', 'plant_list'
];

function handleVoucherEmail(payload) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheet  = ss.getSheetByName('Voucher Emails');
  if (!sheet) {
    sheet = ss.insertSheet('Voucher Emails');
    sheet.appendRow(VOUCHER_EMAIL_HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(VOUCHER_EMAIL_HEADERS);
  }

  var email      = safeStr((payload.email       || '').toLowerCase().trim(), 254);
  var gardenId   = safeStr((payload.garden_id   || '').trim(), 40);
  var gardenName = safeStr((payload.garden_name || '').trim(), 120);
  var plantList  = safeStr((payload.plant_list  || '').trim(), 2000);
  var plantCount = parseInt(payload.plants_selected, 10) || 0;

  if (!email) {
    return jsonResp({ok: false, error: 'email is required.'});
  }

  sheet.appendRow([
    new Date().toISOString(),
    gardenId,
    gardenName,
    email,
    plantCount,
    plantList
  ]);

  return jsonResp({ok: true});
}

/* ---- Utilities ---- */
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
