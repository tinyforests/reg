/**
 * reg-identity.js
 * Ecological Registry — Device identity and steward recognition
 *
 * A steward is identified when they take a meaningful action on a garden
 * (submit a claim, request a plant voucher email). At that point we link
 * their email and a device UUID to that garden_id in localStorage.
 *
 * On subsequent visits, isSteward(gardenId) returns true for that device,
 * which gates badge and score notifications so random browsers don't see them.
 *
 * Nothing here is authentication. The device link is a UX signal only —
 * it keeps notifications relevant without requiring an account.
 */

(function (root) {
  'use strict';

  var DEVICE_KEY  = 'er_device_id';
  var STEWARD_PFX = 'er_steward:';
  var ENDPOINT    = 'https://script.google.com/macros/s/AKfycbywnSUukawAaCJ0JTSo6bowC0TWqGUPtclsvs6bHWglvzp4qtczulyeeFyKHqTt8HR_/exec';

  /* Returns the persisted device UUID, creating one on first call. */
  function getDeviceId() {
    try {
      var id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch (e) { return ''; }
  }

  /* Link this device + email to a garden. Called after a claim or voucher sign-up. */
  function markSteward(gardenId, email) {
    if (!gardenId) return;
    try {
      localStorage.setItem(STEWARD_PFX + gardenId, JSON.stringify({
        email:      (email || '').toLowerCase().trim(),
        device_id:  getDeviceId(),
        linked_at:  new Date().toISOString()
      }));
    } catch (e) {}
  }

  /* Returns true if this device has been linked to the given garden. */
  function isSteward(gardenId) {
    if (!gardenId) return false;
    try { return !!localStorage.getItem(STEWARD_PFX + gardenId); } catch (e) { return false; }
  }

  /* Returns the stored steward record, or null. */
  function getSteward(gardenId) {
    try {
      var v = localStorage.getItem(STEWARD_PFX + gardenId);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }

  /*
   * Renders a fixed bottom bar that lets a steward on a new device enter their
   * email to re-link. Checks against the Claims sheet via doGet. No-ops if
   * already identified, already dismissed this session, or already mounted.
   */
  function mountStewardUnlock(gardenId) {
    if (!gardenId || isSteward(gardenId)) return;
    if (document.getElementById('er-steward-unlock')) return;
    try { if (sessionStorage.getItem('er_unlock_dismissed') === '1') return; } catch (e) {}

    var bar = document.createElement('div');
    bar.id = 'er-steward-unlock';
    bar.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;z-index:100',
      'padding:.7rem 1.25rem',
      'background:#3d4535;color:#fff0dc',
      'border-top:1px solid rgba(255,240,220,.15)',
      'font-family:"IBM Plex Sans",sans-serif'
    ].join(';');
    bar.innerHTML =
      '<div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;max-width:960px;margin:0 auto">' +
        '<span style="font-size:.72rem;opacity:.65;flex-shrink:0">Is this your garden?</span>' +
        '<input id="er-unlock-email" type="email" placeholder="Your email" autocomplete="email" ' +
          'style="flex:1;min-width:160px;font-size:.75rem;padding:.32rem .6rem;' +
          'background:transparent;border:1px solid rgba(255,240,220,.3);color:#fff0dc;outline:none;font-family:inherit" />' +
        '<button id="er-unlock-btn" ' +
          'style="font-size:.72rem;padding:.35rem .85rem;background:#7a9e5f;color:#fff0dc;border:none;cursor:pointer;white-space:nowrap;font-family:inherit">' +
          'Unlock steward view</button>' +
        '<button id="er-unlock-dismiss" aria-label="Dismiss" ' +
          'style="font-size:.8rem;opacity:.35;background:none;border:none;cursor:pointer;color:#fff0dc;padding:.2rem .4rem;line-height:1">' +
          '&#x2715;</button>' +
      '</div>' +
      '<div id="er-unlock-msg" style="font-size:.7rem;margin-top:.35rem;display:none;max-width:960px;margin-left:auto;margin-right:auto;opacity:.8"></div>';

    document.body.appendChild(bar);

    document.getElementById('er-unlock-dismiss').onclick = function () {
      bar.parentNode && bar.parentNode.removeChild(bar);
      try { sessionStorage.setItem('er_unlock_dismissed', '1'); } catch (e) {}
    };

    document.getElementById('er-unlock-btn').onclick = function () {
      var emailEl = document.getElementById('er-unlock-email');
      var email   = emailEl ? emailEl.value.trim() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (emailEl) emailEl.focus(); return; }

      var btn = document.getElementById('er-unlock-btn');
      var msg = document.getElementById('er-unlock-msg');
      btn.disabled    = true;
      btn.textContent = 'Checking…';

      fetch(ENDPOINT + '?action=verify_steward&email=' + encodeURIComponent(email) + '&garden_id=' + encodeURIComponent(gardenId))
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (json && json.ok) {
            markSteward(gardenId, email);
            bar.innerHTML = '<div style="font-size:.8rem;font-weight:500;text-align:center;padding:.1rem 0">' +
              '✓ Steward view unlocked — badge notifications are now active on this device.</div>';
            setTimeout(function () { bar.parentNode && bar.parentNode.removeChild(bar); }, 3000);
          } else {
            btn.disabled    = false;
            btn.textContent = 'Unlock steward view';
            msg.style.display = 'block';
            msg.textContent = json && json.error
              ? json.error
              : 'No claims found for this email on this garden. Submit a claim first to link your account.';
          }
        })
        .catch(function () {
          btn.disabled    = false;
          btn.textContent = 'Unlock steward view';
          msg.style.display = 'block';
          msg.textContent = 'Could not reach the server — please try again.';
        });
    };
  }

  var api = { getDeviceId: getDeviceId, markSteward: markSteward, isSteward: isSteward, getSteward: getSteward, mountStewardUnlock: mountStewardUnlock };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.getDeviceId        = getDeviceId;
    root.markSteward        = markSteward;
    root.isSteward          = isSteward;
    root.getSteward         = getSteward;
    root.mountStewardUnlock = mountStewardUnlock;
    root.RegIdentity        = api;
  }

})(typeof self !== 'undefined' ? self : this);
