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

  var DEVICE_KEY    = 'er_device_id';
  var STEWARD_PFX   = 'er_steward:';

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

  var api = { getDeviceId: getDeviceId, markSteward: markSteward, isSteward: isSteward, getSteward: getSteward };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.getDeviceId  = getDeviceId;
    root.markSteward  = markSteward;
    root.isSteward    = isSteward;
    root.getSteward   = getSteward;
    root.RegIdentity  = api;
  }

})(typeof self !== 'undefined' ? self : this);
