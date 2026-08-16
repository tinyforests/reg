/**
 * reg-claims.js
 * Ecological Registry — Steward Opportunity Claims · v1 (claim-only)
 *
 * Lets a steward tell us they've completed an opportunity from their garden
 * profile. It submits a CLAIM. It does not award points and never touches the
 * score.
 *
 * Why claim-only
 * --------------
 * The canonical principle is "the inputs are the truth, the score is the
 * consequence". A click is not an input — a water bowl is. So a claim goes to
 * the review sheet, a human confirms it, the INPUT flips in the garden record
 * (has_water_feature: true), sync_registry.py regenerates, and the score moves
 * then. This keeps verified records from silently absorbing unverified claims.
 *
 * No provisional number is displayed. We can't read pending claims back without
 * a backend read, so rather than invent a number the profile can't substantiate,
 * a claimed item is simply marked "pending review" for the rest of the session.
 *
 * Depends on: nothing. Call attachClaims(record) after the opportunity list
 * renders; cards must carry data-opp-id.
 */

(function (root) {
  'use strict';

  /* Same endpoint the self-enrolment ramp posts to.
     NOTE: the Apps Script doPost() needs a branch for submission_type ===
     'opportunity_claim' — without it, claims will not be written. That change
     lives in Apps Script, not in this repo. */
  var ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';

  /* Which opportunities a steward may claim.
     Deliberately an explicit allowlist, not an inferred rule — gaming risk
     isn't uniform, so this is a decision, not a side effect.

     Included: discrete physical additions a steward makes and we can confirm
     from a photo, plus self-held documentation.
     Excluded on purpose:
       - species counts / canopy / indigenous-dominant — need botanical ID,
         a photo can't prove them
       - corridor_node, assessment, verify_* — someone else confirms these
         by definition
       - adjacent_* — depends on another property registering */
  var CLAIMABLE = {
    water_feature: 1, rocks: 1, logs: 1, nest_boxes: 1,
    nodes_to_1: 1, nodes_to_3: 1, nodes_to_5: 1,
    moisture_basin: 1, rainwater: 1, swale: 1,
    fauna_first: 1,
    photos: 1, field_notes: 1, species_list: 1, fauna_record: 1
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* session-scoped guard against duplicate rows in the review sheet */
  function claimKey(gardenId, oppId) { return 'erclaim:' + gardenId + ':' + oppId; }
  function alreadyClaimed(gardenId, oppId) {
    try { return sessionStorage.getItem(claimKey(gardenId, oppId)) === '1'; } catch (e) { return false; }
  }
  function markClaimed(gardenId, oppId) {
    try { sessionStorage.setItem(claimKey(gardenId, oppId), '1'); } catch (e) { /* storage blocked — fine */ }
  }

  function pendingNotice(hasPhoto) {
    return '<div class="text-xs mt-2" style="opacity:.75">Claim submitted · pending review' +
      (hasPhoto ? ' · photo attached' : '') + '</div>';
  }

  /* Resize a photo to maxPx on the longest side, encode as JPEG at quality 0–1, cb(dataUrl|null) */
  function resizePhoto(file, maxPx, quality, cb) {
    var reader = new FileReader();
    reader.onerror = function () { cb(null); };
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = function () { cb(null); };
      img.onload = function () {
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxPx / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function formHtml(oppId, knownEmail) {
    var i = 'c_' + oppId;
    var emailField = knownEmail
      ? '<input id="' + i + '_email" type="hidden" value="' + esc(knownEmail) + '" />'
      : '<input id="' + i + '_email" type="email" placeholder="Email" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit" />';
    var hint = knownEmail
      ? '<div class="text-xs mb-2" style="opacity:.7">Tell us it\'s done and we\'ll confirm it at your next check. Points are added once confirmed.</div>'
      : '<div class="text-xs mb-2" style="opacity:.7">Tell us it\'s done and we\'ll confirm it at your next check. Points are added once confirmed.</div>';
    return '' +
    '<div class="mt-3 pt-3" style="border-top:1px solid rgba(128,128,128,.25)">' +
      hint +
      '<input id="' + i + '_name"  type="text"  placeholder="Your name" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit" />' +
      emailField +
      '<textarea id="' + i + '_note" rows="2" placeholder="Anything worth noting (optional)" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit;resize:vertical"></textarea>' +
      '<label class="text-xs block mb-1" style="opacity:.6">Add a photo as evidence (optional)</label>' +
      '<input id="' + i + '_photo" type="file" accept="image/*" capture="environment" class="w-full text-xs mb-2" style="color:inherit" />' +
      '<div id="' + i + '_preview" style="display:none;margin-bottom:.5rem"><img alt="" style="max-width:100%;max-height:100px;display:block;border:1px solid rgba(128,128,128,.2)" /></div>' +
      '<div class="flex gap-2">' +
        '<button type="button" data-claim-submit="' + esc(oppId) + '" class="text-xs px-3 py-1.5" style="border:1px solid currentColor">Submit claim</button>' +
        '<button type="button" data-claim-cancel="' + esc(oppId) + '" class="text-xs px-3 py-1.5" style="opacity:.6">Cancel</button>' +
      '</div>' +
      '<div id="' + i + '_msg" class="text-xs mt-2" style="display:none"></div>' +
    '</div>';
  }

  function attachClaims(record) {
    if (!record) return;
    var gardenId = record.garden_id || record.id || '';
    var list = document.getElementById('opportunityList');
    if (!list) return;

    var storedSteward = (typeof getSteward === 'function') ? getSteward(gardenId) : null;
    var knownEmail = storedSteward ? (storedSteward.email || '') : '';

    var cards = list.querySelectorAll('[data-opp-id]');
    Array.prototype.forEach.call(cards, function (card) {
      var oppId = card.getAttribute('data-opp-id');
      if (!CLAIMABLE[oppId] || card.querySelector('[data-claim-open]')) return;

      if (alreadyClaimed(gardenId, oppId)) {
        card.insertAdjacentHTML('beforeend', pendingNotice());
        return;
      }
      card.insertAdjacentHTML('beforeend',
        '<button type="button" data-claim-open="' + esc(oppId) + '" class="text-xs mt-2" style="opacity:.7;text-decoration:underline">I\'ve done this</button>');
    });

    if (list.getAttribute('data-claims-bound') === '1') return;
    list.setAttribute('data-claims-bound', '1');

    list.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type !== 'file' || !t.id || !t.id.endsWith('_photo')) return;
      var file = t.files && t.files[0];
      var preview = document.getElementById(t.id.replace('_photo', '_preview'));
      if (!preview) return;
      if (!file) { preview.style.display = 'none'; return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        preview.querySelector('img').src = ev.target.result;
        preview.style.display = '';
      };
      reader.readAsDataURL(file);
    });

    list.addEventListener('click', function (e) {
      var open = e.target.closest('[data-claim-open]');
      var cancel = e.target.closest('[data-claim-cancel]');
      var submit = e.target.closest('[data-claim-submit]');

      if (open) {
        var id = open.getAttribute('data-claim-open');
        open.style.display = 'none';
        open.closest('[data-opp-id]').insertAdjacentHTML('beforeend', formHtml(id, knownEmail));
        return;
      }
      if (cancel) {
        var cid = cancel.getAttribute('data-claim-cancel');
        var ccard = cancel.closest('[data-opp-id]');
        var cform = cancel.closest('div').parentNode;
        if (cform) cform.parentNode.removeChild(cform);
        var reopen = ccard.querySelector('[data-claim-open="' + cid + '"]');
        if (reopen) reopen.style.display = '';
        return;
      }
      if (submit) {
        var sid = submit.getAttribute('data-claim-submit');
        sendClaim(record, gardenId, sid, submit);
      }
    });
  }

  function sendClaim(record, gardenId, oppId, btn) {
    var i = 'c_' + oppId;
    var g = function (suffix) { var el = document.getElementById(i + suffix); return el ? el.value.trim() : ''; };
    var msg = document.getElementById(i + '_msg');
    var name = g('_name'), email = g('_email'), note = g('_note');
    var photoInput = document.getElementById(i + '_photo');
    var photoFile = photoInput && photoInput.files && photoInput.files[0];

    var show = function (text, ok) {
      if (!msg) return;
      msg.style.display = 'block';
      msg.style.opacity = ok ? '.75' : '1';
      msg.style.color = ok ? 'inherit' : '#c0562f';
      msg.textContent = text;
    };

    if (!name) { show('Please add your name so we can confirm it.', false); return; }
    if (!email) { show('Email is needed so we can confirm it.', false); return; }

    var card = btn.closest('[data-opp-id]');
    var payload = {
      submission_type: 'opportunity_claim',
      garden_id: gardenId,
      garden_name: record.garden_name || '',
      opportunity_id: oppId,
      opportunity_action: card ? (card.getAttribute('data-opp-action') || '') : '',
      opportunity_points: card ? (card.getAttribute('data-opp-points') || '') : '',
      steward_name: name,
      steward_email: email,
      note: note,
      claimed_at: new Date().toISOString(),
      device_id: (typeof getDeviceId === 'function' ? getDeviceId() : ''),
      status: 'pending_review'
    };

    btn.disabled = true;
    btn.textContent = photoFile ? 'Uploading photo…' : 'Submitting…';

    function doPost(p) {
      fetch(ENDPOINT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(p),
        redirect: 'follow'
      })
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (json && json.ok) {
            markClaimed(gardenId, oppId);
            if (typeof markSteward === 'function') markSteward(gardenId, email);
            var c = btn.closest('[data-opp-id]');
            var form = btn.closest('div').parentNode;
            if (form && form.parentNode) form.parentNode.removeChild(form);
            var opener = c.querySelector('[data-claim-open]');
            if (opener && opener.parentNode) opener.parentNode.removeChild(opener);
            c.insertAdjacentHTML('beforeend', pendingNotice(!!p.photo_base64));
          } else {
            btn.disabled = false; btn.textContent = 'Submit claim';
            show('Could not submit: ' + ((json && json.error) || 'unknown error'), false);
          }
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = 'Submit claim';
          show('Could not reach the server. Please try again later.', false);
        });
    }

    if (photoFile) {
      resizePhoto(photoFile, 1200, 0.75, function (dataUrl) {
        if (dataUrl) {
          payload.photo_base64  = dataUrl;
          payload.photo_filename = photoFile.name;
        }
        btn.textContent = 'Submitting…';
        doPost(payload);
      });
    } else {
      doPost(payload);
    }
  }

  var api = { attachClaims: attachClaims, CLAIMABLE: CLAIMABLE, ENDPOINT_URL: ENDPOINT_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.attachClaims = attachClaims; root.RegClaims = api; }

})(typeof self !== 'undefined' ? self : this);
