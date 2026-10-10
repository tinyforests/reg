/** Private facts are fetched live with backend-verified authorisation only. */
(function (root) {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';
  function renderPrivateGardenDetails(gardenId) {
    var facts = document.getElementById('gardenFacts');
    if (!facts || !gardenId) return;
    var previous = document.getElementById('privateGardenAddress');
    if (previous) previous.parentNode.removeChild(previous);
    var row = document.createElement('div'); row.className = 'flex justify-between gap-4';
    var label = document.createElement('dt'); label.className = 'opacity-60'; label.textContent = 'Address';
    var value = document.createElement('dd'); value.id = 'privateGardenAddress'; value.className = 'font-medium text-right';
    value.style.maxWidth = '70%'; value.style.overflowWrap = 'anywhere'; value.setAttribute('aria-live', 'polite');
    row.appendChild(label); row.appendChild(value); facts.appendChild(row);
    var adminToken = '', adminMode = false;
    try { adminToken = localStorage.getItem('er_admin_token') || ''; adminMode = localStorage.getItem('er_admin') === '1'; } catch (e) {}
    var session = typeof root.getStewardSession === 'function' ? root.getStewardSession(gardenId) : null;
    function loadAddress(token, isAdmin, remember) {
      value.textContent = 'Loading private address…';
      var auth = isAdmin ? '&admin_token=' + encodeURIComponent(token) : '&session_token=' + encodeURIComponent(token);
      return fetch(ENDPOINT + '?action=get_private_garden_details&garden_id=' + encodeURIComponent(gardenId) + auth + '&_cb=' + Date.now(), { cache: 'no-store' })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          if (!value.isConnected) return;
          if (!data || !data.ok || data.garden_id !== gardenId) {
            value.textContent = 'Private address unavailable — verify your access';
            if (isAdmin) addAdminUnlock();
            return;
          }
          if (isAdmin && remember) { try { localStorage.setItem('er_admin_token', token); } catch (e) {} }
          value.textContent = typeof data.address === 'string' && data.address.trim() ? data.address.trim() : 'Address not yet recorded';
        })
        .catch(function () {
          if (!value.isConnected) return;
          value.textContent = 'Private address unavailable — try again later';
          if (isAdmin) addAdminUnlock();
        });
    }
    function addAdminUnlock() {
      var button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Unlock address';
      button.className = 'border px-3 py-2 text-xs'; button.style.marginTop = '8px';
      button.addEventListener('click', function () {
        value.replaceChildren();
        var form = document.createElement('form');
        var caption = document.createElement('label'); caption.textContent = 'Admin token'; caption.htmlFor = 'privateAddressAdminToken';
        var input = document.createElement('input'); input.id = 'privateAddressAdminToken'; input.type = 'password'; input.autocomplete = 'off'; input.required = true;
        input.className = 'border p-2 w-full'; input.style.color = 'inherit'; input.style.background = 'transparent';
        var submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Unlock'; submit.className = 'border px-3 py-2 text-xs';
        var note = document.createElement('p'); note.textContent = 'Verified by the Registry. Your token is remembered on this device.'; note.className = 'text-xs opacity-60';
        form.append(caption, input, submit, note); value.appendChild(form); input.focus();
        form.addEventListener('submit', function (event) { event.preventDefault(); var token = input.value.trim(); if (token) loadAddress(token, true, true); });
      });
      value.appendChild(document.createElement('br')); value.appendChild(button);
    }
    if (adminToken) loadAddress(adminToken, true, false);
    else if (session) loadAddress(session, false, false);
    else {
      value.textContent = 'Private — verified sign-in required';
      if (adminMode) addAdminUnlock();
      // The er_admin display flag alone never fetches or exposes private data.
    }
  }
  root.renderPrivateGardenDetails = renderPrivateGardenDetails;
})(typeof window !== 'undefined' ? window : this);
