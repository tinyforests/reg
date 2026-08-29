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

  if (params.action === 'verify_steward')    return handleVerifySteward(params);
  if (params.action === 'request_claim')     return handleRequestClaim(params);
  if (params.action === 'verify_claim')      return handleVerifyClaimToken(params);
  if (params.action === 'get_log_visibility')  return handleGetLogVisibility(params);
  if (params.action === 'set_log_visibility')  return handleSetLogVisibility(params);
  if (params.action === 'get_steward_data')    return handleGetStewardData(params);
  if (params.action === 'add_field_note')      return handleAddFieldNote(params);
  if (params.action === 'add_species')         return handleAddSpecies(params);
  if (params.action === 'save_garden_coords')    return handleSaveGardenCoords(params);
  if (params.action === 'get_all_coords')        return handleGetAllCoords(params);
  if (params.action === 'get_garden_admin_data') return handleGetGardenAdminData(params);
  if (params.action === 'get_garden_record')     return handleGetGardenRecord(params);
  if (params.action === 'get_precise_map')       return handleGetPreciseMap(params);

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

    // Issue a persistent steward session token so the client can later request
    // gated data (precise map coords) without re-doing the magic-link flow.
    var session = _issueStewardSession(gardenId, String(row[iEmail]), ss);
    return jsonResp({ok: true, email: String(row[iEmail]), session_token: session});
  }

  return jsonResp({ok: false, error: 'Invalid or expired link.'});
}

/* ---- Steward sessions + gated precise-map ---------------------------------
 * Precise garden coordinates are private and never reach the public repo or the
 * public get_garden_record response. A verified steward gets a long-lived session
 * token (issued at magic-link verify) which the profile exchanges here for the
 * precise coords of their own garden — so the accurate network map is drawn only
 * for the authenticated owner, in the browser, live.
 */
var STEWARD_SESSION_SHEET = 'Steward Sessions';
var STEWARD_SESSION_HEADERS = ['garden_id', 'email', 'session_token', 'issued_at'];
var STEWARD_SESSION_DAYS = 180;

function _issueStewardSession(gardenId, email, ss) {
  var sheet = ss.getSheetByName(STEWARD_SESSION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(STEWARD_SESSION_SHEET);
    sheet.appendRow(STEWARD_SESSION_HEADERS);
    sheet.setFrozenRows(1);
  }
  var token = generateToken() + generateToken();  // 64 chars
  sheet.appendRow([gardenId, String(email || '').toLowerCase(), token, new Date().toISOString()]);
  return token;
}

function _validStewardSession(gardenId, sessionToken, ss) {
  var sheet = ss.getSheetByName(STEWARD_SESSION_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return false;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var cutoff = new Date(Date.now() - STEWARD_SESSION_DAYS * 86400000);
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === gardenId.toLowerCase() &&
        String(data[i][2]) === sessionToken) {
      var issued = new Date(String(data[i][3]));
      if (!isNaN(issued.getTime()) && issued > cutoff) return true;
    }
  }
  return false;
}

/* Load a stored record blob (with its precise coords) from the Records sheet. */
function _recordBlob(gardenId, ss) {
  var sh = ss.getSheetByName('Records');
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++)
    if (String(data[i][0]).trim() === gardenId) {
      try { return JSON.parse(data[i][2]); } catch (e) { return null; }
    }
  return null;
}

/* get_precise_map — precise garden + park + neighbour coords, steward-gated. */
function handleGetPreciseMap(params) {
  var gardenId = safeStr((params.garden_id || '').trim(), 40);
  var token    = safeStr((params.session_token || '').trim(), 160);
  if (!gardenId || !token) return jsonResp({ok: false, error: 'garden_id and session_token required'});

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!_validStewardSession(gardenId, token, ss)) return jsonResp({ok: false, error: 'Not authorised'});

  var rec = _recordBlob(gardenId, ss);
  if (!rec) return jsonResp({ok: false, error: 'Not found'});
  var c = rec.connectivity || {};

  var out = {
    lat: c.lat != null ? c.lat : c.display_lat,
    lng: c.lng != null ? c.lng : c.display_lng,
    park_name: c.park_name || null,
    park_lat: c.park_lat != null ? c.park_lat : null,
    park_lng: c.park_lng != null ? c.park_lng : null,
    neighbours: []
  };
  var adj = c.adjacent_registered_gardens || [];
  for (var i = 0; i < adj.length; i++) {
    var nid = adj[i].garden_id || adj[i].id;
    var nrec = nid ? _recordBlob(nid, ss) : null;
    var nc = (nrec && nrec.connectivity) || {};
    out.neighbours.push({
      garden_id: nid, name: adj[i].name || nid,
      lat: nc.lat != null ? nc.lat : nc.display_lat,
      lng: nc.lng != null ? nc.lng : nc.display_lng,
      verified: adj[i].verified === true, source: adj[i].source || null
    });
  }
  return jsonResp({ok: true, precise: out});
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

    if (payload.submission_type === 'save_garden_record') {
      return handleSaveGardenRecord(payload);
    }

    if (payload.submission_type === 'invite_neighbour') {
      return handleInviteNeighbour(payload);
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
    parkDistM,                                     // AL park_distance_m
    parseInt(payload.area_sqm, 10) || '',          // AM area_sqm
    parseFloat(payload.effective_ecological_area_ha) || ''  // AN effective_ecological_area_ha
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
      'Garden area:     ' + (payload.area_sqm ? payload.area_sqm + ' m²' : '(not provided)'),
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
/* ---- Steward-contributed species and field notes ---- */
var STEWARD_NOTES_SHEET    = 'Steward Notes';
var STEWARD_SPECIES_SHEET  = 'Steward Species';
var STEWARD_NOTES_HEADERS  = ['garden_id','title','date','type','notes','email','added_at'];
var STEWARD_SPECIES_HEADERS = ['garden_id','species','email','added_at'];

function handleGetStewardData(params) {
  var gardenId = safeStr((params.garden_id || '').trim(), 40);
  if (!gardenId) return jsonResp({ ok: false, error: 'garden_id required' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var notes = [];
  var ns = ss.getSheetByName(STEWARD_NOTES_SHEET);
  if (ns && ns.getLastRow() > 1) {
    var nd = ns.getRange(2, 1, ns.getLastRow() - 1, STEWARD_NOTES_HEADERS.length).getValues();
    for (var i = 0; i < nd.length; i++) {
      if (String(nd[i][0]).trim() === gardenId) {
        notes.push({ title: nd[i][1], date: nd[i][2], type: nd[i][3],
                     notes: nd[i][4], public: false, steward_added: true });
      }
    }
  }

  var species = [];
  var ss2 = ss.getSheetByName(STEWARD_SPECIES_SHEET);
  if (ss2 && ss2.getLastRow() > 1) {
    var sd = ss2.getRange(2, 1, ss2.getLastRow() - 1, 2).getValues();
    for (var j = 0; j < sd.length; j++) {
      if (String(sd[j][0]).trim() === gardenId) species.push(String(sd[j][1]).trim());
    }
  }

  return jsonResp({ ok: true, notes: notes, species: species });
}

function handleAddFieldNote(params) {
  var gardenId = safeStr((params.garden_id || '').trim(), 40);
  var title    = safeStr((params.title  || '').trim(), 200);
  var date     = safeStr((params.date   || '').trim(), 50);
  var type     = safeStr((params.type   || 'Field Note').trim(), 50);
  var notes    = safeStr((params.notes  || '').trim(), 2000);
  var email    = safeStr((params.email  || '').toLowerCase().trim(), 254);
  if (!gardenId || !title || !notes) return jsonResp({ ok: false, error: 'garden_id, title and notes required' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STEWARD_NOTES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(STEWARD_NOTES_SHEET);
    sheet.getRange(1, 1, 1, STEWARD_NOTES_HEADERS.length).setValues([STEWARD_NOTES_HEADERS]);
  }
  sheet.appendRow([gardenId, title, date, type, notes, email, new Date().toISOString()]);
  try { MailApp.sendEmail(NOTIFY_EMAIL, 'New field note — ' + gardenId,
    'Steward ' + email + ' added a field note to ' + gardenId + ':\n\n' + title + '\n\n' + notes); } catch(e) {}
  return jsonResp({ ok: true });
}

function handleAddSpecies(params) {
  var gardenId = safeStr((params.garden_id || '').trim(), 40);
  var species  = safeStr((params.species   || '').trim(), 200);
  var email    = safeStr((params.email     || '').toLowerCase().trim(), 254);
  if (!gardenId || !species) return jsonResp({ ok: false, error: 'garden_id and species required' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STEWARD_SPECIES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(STEWARD_SPECIES_SHEET);
    sheet.getRange(1, 1, 1, STEWARD_SPECIES_HEADERS.length).setValues([STEWARD_SPECIES_HEADERS]);
  }
  if (sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === gardenId &&
          String(data[i][1]).trim().toLowerCase() === species.toLowerCase())
        return jsonResp({ ok: true, duplicate: true });
    }
  }
  sheet.appendRow([gardenId, species, email, new Date().toISOString()]);
  return jsonResp({ ok: true });
}

/*
 * invite_neighbour — a steward invites a neighbouring garden to register.
 * Records the invite and emails the neighbour. Gated to the garden's known
 * steward so the endpoint can't be used as an open email relay; rate-limited.
 */
function handleInviteNeighbour(payload) {
  var gardenId      = safeStr(String(payload.garden_id      || '').trim(), 40);
  var gardenName    = safeStr(String(payload.garden_name    || '').trim(), 120);
  var inviter       = safeStr(String(payload.inviter_email  || '').toLowerCase().trim(), 254);
  var neighbour     = safeStr(String(payload.neighbour_email|| '').toLowerCase().trim(), 254);
  var neighbourName = safeStr(String(payload.neighbour_name || '').trim(), 120);

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!gardenId || !EMAIL_RE.test(neighbour) || !EMAIL_RE.test(inviter)) {
    return jsonResp({ ok: false, error: 'garden_id, a valid your-email and neighbour email are required.' });
  }
  if (inviter === neighbour) {
    return jsonResp({ ok: false, error: 'The neighbour email must be different from your own.' });
  }
  if (!isKnownSteward(inviter, gardenId)) {
    return jsonResp({ ok: false, error: 'Only the garden\'s registered steward can send invitations.' });
  }

  // Rate-limit: max 5 invites per inviter per hour
  var cache   = CacheService.getScriptCache();
  var rlKey   = 'invite_' + hourBucket() + '_' + inviter;
  var rlCount = parseInt(cache.get(rlKey) || '0', 10);
  if (rlCount >= 5) {
    return jsonResp({ ok: false, error: 'Invitation limit reached for now — please try again later.' });
  }
  cache.put(rlKey, String(rlCount + 1), RATE_CACHE_TTL);

  // Record the invite
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Neighbour Invites');
  if (!sheet) {
    sheet = ss.insertSheet('Neighbour Invites');
    sheet.appendRow(['garden_id', 'garden_name', 'inviter_email', 'neighbour_email', 'neighbour_name', 'invited_at', 'status']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([gardenId, gardenName, inviter, neighbour, neighbourName, new Date().toISOString(), 'invited']);

  // Email the neighbour
  var gname    = gardenName || 'a nearby garden';
  var greeting = neighbourName ? ('Hi ' + neighbourName + ',') : 'Hello,';
  try {
    MailApp.sendEmail({
      to:      neighbour,
      subject: 'You have been invited to the Ecological Registry',
      body: [
        greeting,
        '',
        'The steward of ' + gname + ', near you, has invited your garden to join the Ecological Registry —',
        'a public record of ecological gardens with field-noted baselines, scoring and verified stewardship.',
        '',
        'Neighbouring gardens that register strengthen a local wildlife corridor, and each one lifts the whole',
        'cluster\'s connectivity. Yours could be the next stepping-stone.',
        '',
        'See how it works and enrol your garden:',
        'https://ecologicalregistry.org/',
        '',
        'If this is not for you, you can simply ignore this email.',
        '',
        'Ecological Registry',
        'ecologicalregistry.org'
      ].join('\n')
    });
  } catch (mailErr) {
    try {
      var dbg = ss.getSheetByName('Debug log') || ss.insertSheet('Debug log');
      dbg.appendRow([new Date().toISOString(), 'invite email', mailErr.message]);
    } catch (e2) {}
  }

  // Notify G&S
  try {
    MailApp.sendEmail(NOTIFY_EMAIL, 'Neighbour invite — ' + gardenId,
      inviter + ' invited ' + neighbour + (neighbourName ? ' (' + neighbourName + ')' : '') +
      ' to register, from ' + gname + ' (' + gardenId + ').');
  } catch (e3) {}

  return jsonResp({ ok: true, message: 'Invitation sent.' });
}

/* ---- Log visibility (steward-controlled public/private per entry) ---- */
var LOG_VIS_SHEET   = 'Log Visibility';
var LOG_VIS_HEADERS = ['garden_id', 'entry_index', 'public', 'email', 'updated_at'];

function handleGetLogVisibility(params) {
  var gardenId = safeStr((params.garden_id || '').trim(), 40);
  if (!gardenId) return jsonResp({ ok: false, error: 'garden_id required' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOG_VIS_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResp({ ok: true, overrides: {} });

  var data      = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  var overrides = {};
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === gardenId) {
      var idx = parseInt(data[i][1], 10);
      overrides[idx] = (data[i][2] === true || String(data[i][2]).toUpperCase() === 'TRUE');
    }
  }
  return jsonResp({ ok: true, overrides: overrides });
}

function handleSetLogVisibility(params) {
  var gardenId = safeStr((params.garden_id || '').trim(), 40);
  var idx      = parseInt(params.entry_index, 10);
  var isPublic = params.public === 'true' || params.public === true;
  var email    = safeStr((params.email || '').toLowerCase().trim(), 254);

  if (!gardenId || isNaN(idx)) return jsonResp({ ok: false, error: 'garden_id and entry_index required' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOG_VIS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_VIS_SHEET);
    sheet.getRange(1, 1, 1, LOG_VIS_HEADERS.length).setValues([LOG_VIS_HEADERS]);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === gardenId && parseInt(data[i][1], 10) === idx) {
        sheet.getRange(i + 2, 3, 1, 3).setValues([[isPublic, email, new Date().toISOString()]]);
        return jsonResp({ ok: true });
      }
    }
  }
  sheet.appendRow([gardenId, idx, isPublic, email, new Date().toISOString()]);
  return jsonResp({ ok: true });
}

/* ---- Garden Coordinates ---- */

/*
 * Called by assess.html after geocoding a garden address.
 * Appends a row to the "Garden Coords" sheet — latest row per
 * garden_id wins when get_all_coords reads it back.
 * No admin token required: writing a coord for a known garden_id
 * is low-risk and the sheet is private to the spreadsheet owner.
 */
function handleSaveGardenCoords(params) {
  var gardenId = safeStr(params.garden_id || '', 60);
  var lat      = parseFloat(params.lat);
  var lng      = parseFloat(params.lng);
  var address  = safeStr(params.address  || '', 200);

  if (!gardenId)          return jsonResp({ok: false, error: 'garden_id is required'});
  if (isNaN(lat) || isNaN(lng)) return jsonResp({ok: false, error: 'lat and lng must be numbers'});
  if (lat < -44 || lat > -10 || lng < 112 || lng > 155)
    return jsonResp({ok: false, error: 'Coordinates outside Australia'});

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheet  = ss.getSheetByName('Garden Coords');
  if (!sheet) {
    sheet = ss.insertSheet('Garden Coords');
    sheet.appendRow(['timestamp', 'garden_id', 'lat', 'lng', 'address']);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([new Date().toISOString(), gardenId, lat, lng, address]);
  return jsonResp({ok: true});
}

/*
 * Returns precise coords for every garden, merged from two sources:
 *   1. Submissions sheet cols AG/AH (garden_lat/lng from enrolment form)
 *   2. Garden Coords sheet (from assess.html geocoding — takes precedence)
 * Protected by ADMIN_TOKEN stored in Script Properties.
 * Set it once via the Apps Script editor console:
 *   PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN','your-token')
 */
function handleGetAllCoords(params) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '';
  if (!stored || (params.admin_token || '') !== stored)
    return jsonResp({ok: false, error: 'Unauthorized'});

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};

  // Source 1: Submissions sheet — enrolment-form geocoded coords (cols AG=32, AH=33, Z=25, E=4)
  var subSheet = ss.getSheetByName('Submissions') || ss.getActiveSheet();
  if (subSheet && subSheet.getLastRow() > 1) {
    var lastCol = Math.max(subSheet.getLastColumn(), 34);
    var rows = subSheet.getRange(2, 1, subSheet.getLastRow() - 1, lastCol).getValues();
    for (var i = 0; i < rows.length; i++) {
      var pubGid = String(rows[i][25] || '').trim();   // col Z
      var sLat   = parseFloat(rows[i][32]);             // col AG
      var sLng   = parseFloat(rows[i][33]);             // col AH
      var sAddr  = String(rows[i][4]  || '').trim();   // col E
      if (pubGid && !isNaN(sLat) && !isNaN(sLng)) {
        result[pubGid] = {lat: sLat, lng: sLng, address: sAddr};
      }
    }
  }

  // Source 2: Garden Coords sheet — assess.html saves here; latest row wins
  var coordSheet = ss.getSheetByName('Garden Coords');
  if (coordSheet && coordSheet.getLastRow() > 1) {
    var cRows = coordSheet.getRange(2, 1, coordSheet.getLastRow() - 1, 5).getValues();
    for (var j = 0; j < cRows.length; j++) {
      var gid  = String(cRows[j][1] || '').trim();
      var cLat = parseFloat(cRows[j][2]);
      var cLng = parseFloat(cRows[j][3]);
      var cAddr = String(cRows[j][4] || '').trim();
      if (gid && !isNaN(cLat) && !isNaN(cLng)) {
        result[gid] = {lat: cLat, lng: cLng, address: cAddr || (result[gid] || {}).address || ''};
      }
    }
  }

  return jsonResp({ok: true, coords: result});
}

/*
 * Returns admin data for a single garden: steward contact, address, review
 * status, and the most precise coords available (Garden Coords tab wins over
 * Submissions sheet, since assess.html geocoding is newer / higher precision).
 * Protected by ADMIN_TOKEN stored in Script Properties.
 */
function handleGetGardenAdminData(params) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '';
  if (!stored || (params.admin_token || '') !== stored)
    return jsonResp({ok: false, error: 'Unauthorized'});

  var gardenId = safeStr((params.garden_id || '').trim(), 60);
  if (!gardenId) return jsonResp({ok: false, error: 'garden_id required'});

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    garden_id: gardenId, found: false,
    lat: null, lng: null,
    garden_address: '', garden_suburb: '',
    steward_name: '', steward_email: '',
    review_status: '', submission_id: '', submitted_at: ''
  };

  // Source 1: Submissions sheet — col Z (index 25) = published_garden_id
  var subSheet = ss.getSheetByName('Submissions');
  if (subSheet && subSheet.getLastRow() > 1) {
    var lastCol = Math.max(subSheet.getLastColumn(), 34);
    var rows    = subSheet.getRange(2, 1, subSheet.getLastRow() - 1, lastCol).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][25] || '').trim().toLowerCase() !== gardenId.toLowerCase()) continue;
      result.found          = true;
      result.submitted_at   = String(rows[i][0]  || '');  // A
      result.submission_id  = String(rows[i][1]  || '');  // B
      result.steward_name   = String(rows[i][2]  || '');  // C
      result.steward_email  = String(rows[i][3]  || '');  // D
      result.garden_address = String(rows[i][4]  || '');  // E
      result.review_status  = String(rows[i][23] || '');  // X
      result.garden_suburb  = String(rows[i][31] || '');  // AF
      var sLat = parseFloat(rows[i][32]);                  // AG
      var sLng = parseFloat(rows[i][33]);                  // AH
      if (!isNaN(sLat) && !isNaN(sLng)) { result.lat = sLat; result.lng = sLng; }
      // keep scanning — latest matching row wins for mutable fields
    }
  }

  // Source 2: Garden Coords sheet — assess.html saves here; latest row wins
  var coordSheet = ss.getSheetByName('Garden Coords');
  if (coordSheet && coordSheet.getLastRow() > 1) {
    var cRows = coordSheet.getRange(2, 1, coordSheet.getLastRow() - 1, 5).getValues();
    for (var j = 0; j < cRows.length; j++) {
      if (String(cRows[j][1] || '').trim().toLowerCase() !== gardenId.toLowerCase()) continue;
      var cLat = parseFloat(cRows[j][2]);
      var cLng = parseFloat(cRows[j][3]);
      if (!isNaN(cLat) && !isNaN(cLng)) {
        result.lat = cLat;
        result.lng = cLng;
        result.coord_updated_at = String(cRows[j][0] || '');
        if (!result.garden_address && cRows[j][4]) result.garden_address = String(cRows[j][4]);
      }
    }
  }

  return jsonResp({ok: true, data: result});
}

/*
 * Stores a full garden record JSON for a given garden_id in the "Records" sheet.
 * Called via doPost with submission_type === 'save_garden_record'.
 * Protected by ADMIN_TOKEN.
 */
/*
 * Compares two garden records and returns an array of human-readable change
 * descriptions, e.g. "Added to species list: Eucalyptus tricarpa",
 * "Canopy cover 45% → 50%", "Moisture basin added", "Ecological score 65 → 62".
 * The activity_log itself is never diffed. Returns [] when nothing tracked changed.
 */
function diffGardenRecords(oldRec, newRec) {
  oldRec = oldRec || {};
  newRec = newRec || {};
  var changes = [];

  function get(obj, path) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  // Scalar fields: "Label from → to". Third element is an optional unit suffix.
  var scalars = [
    ['garden_name',                             'Garden name'],
    ['typology',                                'Typology'],
    ['target_score',                            'Target score'],
    ['stewards',                                'Stewards'],
    ['designer',                                'Designer'],
    ['biodiversity.indigenous_species_current', 'Indigenous species'],
    ['biodiversity.structural_layers_current',  'Structural layers'],
    ['biodiversity.canopy_cover_pct_current',   'Canopy cover', '%'],
    ['biodiversity.weed_pressure',              'Weed pressure'],
    ['soil_water.soil_health_score',            'Soil health'],
    ['soil_water.water_function_score',         'Water function'],
    ['soil_water.mulch_depth_mm',               'Mulch depth', 'mm'],
    ['habitat.habitat_nodes',                   'Habitat nodes'],
    ['connectivity.park_name',                  'Adjacent park'],
    ['connectivity.park_distance_m',            'Park distance', 'm'],
    ['evidence.verification_level',             'Verification level'],
    ['score.total',                             'Ecological score']
  ];
  for (var i = 0; i < scalars.length; i++) {
    var path = scalars[i][0], label = scalars[i][1], unit = scalars[i][2] || '';
    var ov = get(oldRec, path), nv = get(newRec, path);
    if (nv === undefined) continue;
    if (String(ov == null ? '' : ov) === String(nv == null ? '' : nv)) continue;
    var from = (ov == null || ov === '') ? '—' : (ov + unit);
    changes.push(label + ' ' + from + ' → ' + (nv + unit));
  }

  // Free-text fields: note that they changed, don't dump the contents.
  var texts = [['description', 'Description'], ['notes', 'Notes']];
  for (var t = 0; t < texts.length; t++) {
    var to = get(oldRec, texts[t][0]), tn = get(newRec, texts[t][0]);
    if (tn !== undefined && String(to == null ? '' : to) !== String(tn == null ? '' : tn))
      changes.push(texts[t][1] + ' updated');
  }

  // Boolean feature flags: "Label added" / "Label removed".
  var bools = [
    ['biodiversity.indigenous_dominant',     'Indigenous-dominant status'],
    ['soil_water.has_rainwater_system',      'Rainwater system'],
    ['soil_water.has_moisture_basin',        'Moisture basin'],
    ['soil_water.has_swale',                 'Swale'],
    ['habitat.has_embedded_logs',            'Embedded logs'],
    ['habitat.has_rock_refuges',             'Rock refuges'],
    ['habitat.has_water_feature',            'Water feature'],
    ['habitat.has_nest_boxes',               'Nest boxes'],
    ['connectivity.adjacent_park',           'Adjacent park'],
    ['connectivity.corridor_node_confirmed', 'Corridor node'],
    ['evidence.has_photos',                  'Photos'],
    ['evidence.has_field_notes',             'Field notes'],
    ['evidence.has_species_list',            'Species list evidence'],
    ['evidence.has_fauna_record',            'Fauna record'],
    ['evidence.has_professional_assessment', 'Professional assessment']
  ];
  for (var j = 0; j < bools.length; j++) {
    var bo = !!get(oldRec, bools[j][0]), bn = !!get(newRec, bools[j][0]);
    if (bo !== bn) changes.push(bools[j][1] + (bn ? ' added' : ' removed'));
  }

  // List fields: what was added / removed.
  changes = changes.concat(diffList(
    get(oldRec, 'biodiversity.species_list'),
    get(newRec, 'biodiversity.species_list'), 'species list'));
  changes = changes.concat(diffList(
    faunaNames(get(oldRec, 'habitat.fauna_sightings')),
    faunaNames(get(newRec, 'habitat.fauna_sightings')), 'fauna sightings'));

  return changes;
}

function diffList(oldArr, newArr, label) {
  oldArr = oldArr || [];
  newArr = newArr || [];
  var out = [], oldSet = {}, newSet = {}, added = [], removed = [], i;
  for (i = 0; i < oldArr.length; i++) oldSet[String(oldArr[i]).toLowerCase()] = true;
  for (i = 0; i < newArr.length; i++) newSet[String(newArr[i]).toLowerCase()] = true;
  for (i = 0; i < newArr.length; i++) if (!oldSet[String(newArr[i]).toLowerCase()]) added.push(newArr[i]);
  for (i = 0; i < oldArr.length; i++) if (!newSet[String(oldArr[i]).toLowerCase()]) removed.push(oldArr[i]);
  if (added.length)   out.push('Added to ' + label + ': ' + added.join(', '));
  if (removed.length) out.push('Removed from ' + label + ': ' + removed.join(', '));
  return out;
}

function faunaNames(arr) {
  arr = arr || [];
  var out = [];
  for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].species) out.push(arr[i].species);
  return out;
}

function handleSaveGardenRecord(payload) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '';
  if (!stored || (payload.admin_token || '') !== stored) {
    return jsonResp({ok: false, error: 'Unauthorized'});
  }
  var gardenId = safeStr(String(payload.garden_id || '').trim(), 60);
  var record   = payload.record;
  if (!gardenId || !record) return jsonResp({ok: false, error: 'Missing garden_id or record'});

  // Dedupe adjacent_registered_gardens by id before storing. Repeated invites /
  // nearest-garden adds have appended the same neighbour multiple times, which
  // inflates the connectivity score (the scorer counts verified entries). The
  // authority for adjacency is sync_registry's 500 m recompute; this just stops
  // the stored list drifting away from it. Keeps first occurrence.
  if (record.connectivity && record.connectivity.adjacent_registered_gardens) {
    var adj = record.connectivity.adjacent_registered_gardens, seen = {}, out = [];
    for (var ai = 0; ai < adj.length; ai++) {
      var k = adj[ai].garden_id || adj[ai].id || adj[ai].garden_name || adj[ai].name;
      if (k && seen[k]) continue;
      if (k) seen[k] = true;
      out.push(adj[ai]);
    }
    record.connectivity.adjacent_registered_gardens = out;
  }

  var now      = new Date().toISOString();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Records');
  if (!sh) {
    sh = ss.insertSheet('Records');
    sh.appendRow(['garden_id', 'updated_at', 'json_blob']);
    sh.setFrozenRows(1);
  }

  var data      = sh.getDataRange().getValues();
  var foundRow  = -1;
  var oldRecord = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === gardenId) {
      foundRow = i + 1;
      try { oldRecord = JSON.parse(data[i][2]); } catch (e) { oldRecord = null; }
      break;
    }
  }

  // Auto-log what actually changed versus the previously stored record.
  // Runs for every save, so both the assessment tool and steward profile
  // edits get a descriptive change entry with no client-side log logic.
  // A no-op save (nothing changed) adds no entry.
  if (oldRecord) {
    var changes = diffGardenRecords(oldRecord, record);
    if (changes.length) {
      var editor = safeStr(String(payload.editor || 'Gardener & Son').trim(), 80) || 'Gardener & Son';
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var dt     = new Date();
      record.activity_log = [{
        title:    'Record updated — ' + editor,
        date:     months[dt.getMonth()] + ' ' + dt.getFullYear(),
        ts:       dt.toISOString(),   // precise timestamp for the updates feed
        type:     'Record Update',
        category: 'record_update',
        public:   true,
        notes:    changes.join('; ') + '.'
      }].concat(record.activity_log || []);
    }
  }

  var jsonBlob = JSON.stringify(record);

  if (foundRow > 0) {
    sh.getRange(foundRow, 1, 1, 3).setValues([[gardenId, now, jsonBlob]]);
  } else {
    sh.appendRow([gardenId, now, jsonBlob]);
  }

  // Auto-link invited neighbours: if this garden's steward was invited by another
  // registered garden, create the mutual invited adjacency link now that it exists.
  try { linkInvitedNeighbours(gardenId); } catch (e) {}

  return jsonResp({ok: true, garden_id: gardenId, updated_at: now});
}

/* ---- Invited-neighbour auto-link -------------------------------------------
 * When an invited neighbour registers (this garden now has an id), find any
 * pending Neighbour Invites addressed to this garden's steward email and create a
 * MUTUAL invited adjacency link (source:'invited'), which counts regardless of the
 * 500 m radius and survives sync_registry (which preserves source:'invited').
 * Idempotent: each invite row is marked 'linked' once actioned. The link reaches
 * the public profile after the normal pipeline (pull_live_records -> sync -> commit).
 */
function linkInvitedNeighbours(gardenId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = ss.getSheetByName('Neighbour Invites');
  if (!inv || inv.getLastRow() <= 1) return;

  var emails = _emailsForGarden(gardenId, ss);
  if (!emails.length) return;

  // cols: 0 garden_id(inviter) 2 inviter_email 3 neighbour_email 6 status
  var rows = inv.getRange(2, 1, inv.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][6] || '').toLowerCase() === 'linked') continue;
    var nEmail = String(rows[i][3] || '').toLowerCase().trim();
    if (emails.indexOf(nEmail) < 0) continue;
    var inviterId = String(rows[i][0] || '').trim();
    if (!inviterId || inviterId === gardenId) continue;
    _addInvitedLink(inviterId, gardenId, ss);
    _addInvitedLink(gardenId, inviterId, ss);
    inv.getRange(i + 2, 7).setValue('linked');
  }
}

/* Steward email(s) for a garden: Steward Emails sheet + Submissions (col Z id -> col D email). */
function _emailsForGarden(gardenId, ss) {
  var out = [], g = gardenId.toLowerCase();
  var se = ss.getSheetByName('Steward Emails');
  if (se && se.getLastRow() > 1) {
    var sd = se.getRange(2, 1, se.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < sd.length; i++)
      if (String(sd[i][0]).toLowerCase() === g && sd[i][1]) out.push(String(sd[i][1]).toLowerCase().trim());
  }
  var sub = ss.getSheetByName('Submissions');
  if (sub && sub.getLastRow() > 1) {
    var bd = sub.getRange(2, 1, sub.getLastRow() - 1, 26).getValues();
    for (var j = 0; j < bd.length; j++)
      if (String(bd[j][25]).toLowerCase() === g && bd[j][3]) out.push(String(bd[j][3]).toLowerCase().trim());
  }
  return out;
}

/* Add a source:'invited' neighbour entry to gardenId's stored record (deduped by id). */
function _addInvitedLink(gardenId, neighbourId, ss) {
  var sh = ss.getSheetByName('Records');
  if (!sh) return;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== gardenId) continue;
    var rec; try { rec = JSON.parse(data[i][2]); } catch (e) { return; }
    var c = rec.connectivity || (rec.connectivity = {});
    var adj = c.adjacent_registered_gardens || (c.adjacent_registered_gardens = []);
    for (var k = 0; k < adj.length; k++)
      if ((adj[k].garden_id || adj[k].id) === neighbourId) return;  // already linked
    adj.push({ id: neighbourId, garden_id: neighbourId,
               name: _gardenName(neighbourId, ss) || neighbourId,
               verified: true, source: 'invited' });
    sh.getRange(i + 1, 1, 1, 3).setValues([[gardenId, new Date().toISOString(), JSON.stringify(rec)]]);
    return;
  }
}

function _gardenName(gardenId, ss) {
  var sh = ss.getSheetByName('Records');
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++)
    if (String(data[i][0]).trim() === gardenId) {
      try { return JSON.parse(data[i][2]).garden_name || null; } catch (e) { return null; }
    }
  return null;
}

/*
 * Returns the latest published garden record for a garden_id from the "Records" sheet.
 * Public (no token required) — the data is already public on the profile page.
 * Falls through to {ok:false} if not yet published, so profile pages can fall back to static JSON.
 */
function handleGetGardenRecord(params) {
  var gardenId = safeStr(String(params.garden_id || '').trim(), 60);
  if (!gardenId) return jsonResp({ok: false, error: 'Missing garden_id'});

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Records');
  if (!sh) return jsonResp({ok: false, error: 'No published records yet'});

  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === gardenId) {
      try {
        var record = JSON.parse(data[i][2]);
        // Strip precise coordinates — this endpoint is public. Precise coords are
        // steward-gated via get_precise_map. Fuzzed display_lat/lng + public park
        // coords remain. (Garden-extent geometry under canopy is left as-is; it is
        // client-gated on the profile.)
        var pc = record.connectivity;
        if (pc) {
          delete pc.lat; delete pc.lng;
          var pa = pc.adjacent_registered_gardens || [];
          for (var k = 0; k < pa.length; k++) { delete pa[k].lat; delete pa[k].lng; }
        }
        return jsonResp({ok: true, data: record, updated_at: String(data[i][1])});
      } catch (e) {
        return jsonResp({ok: false, error: 'Stored record is invalid JSON'});
      }
    }
  }
  return jsonResp({ok: false, error: 'Not found'});
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
