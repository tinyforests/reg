/**
 * reg-invite.js
 * Ecological Registry — Neighbour Invites · v1
 *
 * Adds an "Invite a neighbour" action to the "Register a neighbouring garden"
 * opportunity (the card whose data-opp-id begins with "adjacent"). A claimed
 * steward enters a neighbour's email; we record it and email them an invitation
 * to the registry. Each registered neighbour lifts the whole cluster's
 * connectivity score.
 *
 * Only offered to a claimed steward of this garden (the invite is sent under
 * their known-steward email; the backend gates on it and rate-limits).
 *
 * Depends on: reg-identity.js (isSteward/getSteward). Call
 * attachNeighbourInvite(record) after the opportunity list renders; cards must
 * carry data-opp-id.
 */
(function (root) {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isAdjacentOpp(id) { return /^adjacent(_|$)/.test(id || ''); }

  function formHtml(oppId, inviterEmail) {
    var i = 'inv_' + oppId;
    return '' +
    '<div class="mt-3 pt-3" style="border-top:1px solid rgba(128,128,128,.25)">' +
      '<div class="text-xs mb-2" style="opacity:.7">Know a neighbour with a garden worth registering? Enter their email and we\'ll send them an invitation. Each registered neighbour lifts your connectivity score.</div>' +
      '<input id="' + i + '_nemail" type="email" placeholder="Neighbour\'s email" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit" />' +
      '<input id="' + i + '_nname" type="text" placeholder="Neighbour\'s name (optional)" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit" />' +
      (inviterEmail
        ? '<input id="' + i + '_iemail" type="hidden" value="' + esc(inviterEmail) + '" />'
        : '<input id="' + i + '_iemail" type="email" placeholder="Your email" class="w-full text-xs mb-2" style="background:transparent;border:1px solid rgba(128,128,128,.35);padding:.4rem;color:inherit" />') +
      '<div class="flex gap-2">' +
        '<button type="button" data-invite-submit="' + esc(oppId) + '" class="text-xs px-3 py-1.5" style="border:1px solid currentColor">Send invitation</button>' +
        '<button type="button" data-invite-cancel="' + esc(oppId) + '" class="text-xs px-3 py-1.5" style="opacity:.6">Cancel</button>' +
      '</div>' +
      '<div id="' + i + '_msg" class="text-xs mt-2" style="display:none"></div>' +
    '</div>';
  }

  function attachNeighbourInvite(record) {
    if (!record) return;
    var gardenId   = record.garden_id || record.id || '';
    var gardenName = record.garden_name || '';
    var list = document.getElementById('opportunityList');
    if (!list) return;

    // Only a claimed steward of this garden may invite.
    var isStew = (typeof isSteward === 'function') && isSteward(gardenId);
    if (!isStew) return;

    var stew         = (typeof getSteward === 'function') ? getSteward(gardenId) : null;
    var inviterEmail = stew ? (stew.email || '') : '';

    var cards = list.querySelectorAll('[data-opp-id]');
    Array.prototype.forEach.call(cards, function (card) {
      var oppId = card.getAttribute('data-opp-id');
      if (!isAdjacentOpp(oppId) || card.querySelector('[data-invite-open]')) return;
      card.insertAdjacentHTML('beforeend',
        '<button type="button" data-invite-open="' + esc(oppId) + '" class="text-xs mt-2" style="opacity:.7;text-decoration:underline">Invite a neighbour</button>');
    });

    if (list.getAttribute('data-invite-bound') === '1') return;
    list.setAttribute('data-invite-bound', '1');

    list.addEventListener('click', function (e) {
      var open   = e.target.closest('[data-invite-open]');
      var cancel = e.target.closest('[data-invite-cancel]');
      var submit = e.target.closest('[data-invite-submit]');

      if (open) {
        var id = open.getAttribute('data-invite-open');
        open.style.display = 'none';
        open.closest('[data-opp-id]').insertAdjacentHTML('beforeend', formHtml(id, inviterEmail));
        return;
      }

      if (cancel) {
        var cid   = cancel.getAttribute('data-invite-cancel');
        var ccard = cancel.closest('[data-opp-id]');
        var cform = cancel.closest('div').parentNode;
        if (cform) cform.parentNode.removeChild(cform);
        var reopen = ccard.querySelector('[data-invite-open="' + cid + '"]');
        if (reopen) reopen.style.display = '';
        return;
      }

      if (submit) {
        var oid = submit.getAttribute('data-invite-submit');
        var p   = 'inv_' + oid;
        var nEl = document.getElementById(p + '_nemail');
        var iEl = document.getElementById(p + '_iemail');
        var msg = document.getElementById(p + '_msg');
        var nemail = (nEl ? nEl.value : '').trim();
        var nname  = (document.getElementById(p + '_nname') || {}).value || '';
        var iemail = ((iEl ? iEl.value : '') || inviterEmail).trim();

        function show(text, ok) {
          if (!msg) return;
          msg.style.display = 'block';
          msg.style.opacity = ok ? '.75' : '1';
          msg.style.color   = ok ? 'inherit' : '#c0562f';
          msg.textContent   = text;
        }

        if (!EMAIL_RE.test(nemail)) { show('Please enter a valid neighbour email.', false); if (nEl) nEl.focus(); return; }
        if (!EMAIL_RE.test(iemail)) { show('Please add your email so we can attribute the invite.', false); return; }

        submit.disabled = true;
        submit.textContent = 'Sending…';

        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            submission_type: 'invite_neighbour',
            garden_id:       gardenId,
            garden_name:     gardenName,
            inviter_email:   iemail,
            neighbour_email: nemail,
            neighbour_name:  nname.trim(),
            invited_at:      new Date().toISOString()
          }),
          redirect: 'follow'
        })
          .then(function (r) { return r.json(); })
          .then(function (json) {
            if (json && json.ok) {
              var form = submit.closest('div').parentNode;
              if (form) form.innerHTML = '<div class="text-xs mt-2" style="opacity:.75">Invitation sent — thank you. We\'ll let you know if they join.</div>';
            } else {
              submit.disabled = false;
              submit.textContent = 'Send invitation';
              show((json && json.error) || 'Could not send — please try again.', false);
            }
          })
          .catch(function () {
            submit.disabled = false;
            submit.textContent = 'Send invitation';
            show('Could not reach the server — please try again.', false);
          });
        return;
      }
    });
  }

  var api = { attachNeighbourInvite: attachNeighbourInvite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.attachNeighbourInvite = attachNeighbourInvite;
})(typeof window !== 'undefined' ? window : this);
