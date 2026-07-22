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
  var ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbywnSUukawAaCJ0JTSo6bowC0TWqGUPtclsvs6bHWglvzp4qtczulyeeFyKHqTt8HR_/exec';

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

  function pendingNotice() {
    return '<div class="text-xs mt-2" style="opacity:.75">Claim submitted · pending review</div>';
  }

  function formHtml(oppId) {
    var i = 'c_' + oppId;
    return '' +
    '<div class="mt-3 pt-3" style="border-top:1px solid rgba(128,128,128,.25)">' +
      '<div class="text-xs mb-2" style="opacity:.7">Tell us it\'s done and we\'ll confirm it at your next check. Points are added once confirmed.</div>' +
      '<input id="' + i + '_name"  type="text"  placeholder="Your name" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit" />' +
      '<input id="' + i + '_email" type="email" placeholder="Email" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit" />' +
      '<textarea id="' + i + '_note" rows="2" placeholder="Anything worth noting (optional)" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit;resize:vertical"></textarea>' +
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

    list.addEventListener('click', function (e) {
      var open = e.target.closest('[data-claim-open]');
      var cancel = e.target.closest('[data-claim-cancel]');
      var submit = e.target.closest('[data-claim-submit]');

      if (open) {
        var id = open.getAttribute('data-claim-open');
        open.style.display = 'none';
        open.closest('[data-opp-id]').insertAdjacentHTML('beforeend', formHtml(id));
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

    var show = function (text, ok) {
      if (!msg) return;
      msg.style.display = 'block';
      msg.style.opacity = ok ? '.75' : '1';
      msg.style.color = ok ? 'inherit' : '#c0562f';
      msg.textContent = text;
    };

    if (!name || !email) { show('Name and email are needed so we can confirm it.', false); return; }

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
      status: 'pending_review'
    };

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json && json.ok) {
          markClaimed(gardenId, oppId);
          var c = btn.closest('[data-opp-id]');
          var form = btn.closest('div').parentNode;
          if (form && form.parentNode) form.parentNode.removeChild(form);
          var opener = c.querySelector('[data-claim-open]');
          if (opener && opener.parentNode) opener.parentNode.removeChild(opener);
          c.insertAdjacentHTML('beforeend', pendingNotice());
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

  var api = { attachClaims: attachClaims, CLAIMABLE: CLAIMABLE, ENDPOINT_URL: ENDPOINT_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.attachClaims = attachClaims; root.RegClaims = api; }

})(typeof self !== 'undefined' ? self : this);
