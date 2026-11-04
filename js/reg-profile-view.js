/* Profile and connected-sign views share the existing assessed record.
   No telemetry endpoint is configured: never substitute example readings. */
(function () {
  'use strict';
  var host = document.getElementById('ecoCard');
  if (!host || host.querySelector('.reg-profile-switch')) return;
  var card = host.querySelector('.card');
  if (!card) return;
  function el(tag, className, text) {
    var node = document.createElement(tag); node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  var controls = el('div', 'reg-profile-switch');
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Scorecard view');
  var profile = el('button', '', 'Profile card');
  var connected = el('button', '', 'Connected sign');
  [profile, connected].forEach(function (button) { button.type = 'button'; button.setAttribute('aria-controls', 'ecoCard'); controls.appendChild(button); });
  host.insertBefore(controls, card);

  var identity = el('p', 'reg-sign-identity');
  var heading = card.querySelector('.eyebrow');
  if (heading) heading.insertAdjacentElement('afterend', identity);
  var panel = el('section', 'reg-sign-readings'); panel.hidden = true;
  panel.setAttribute('aria-label', 'Signal connection and garden readings');
  var summary = el('div', 'reg-sign-summary');
  summary.appendChild(el('span', '', 'Badges earned'));
  var badgeCount = el('span', ''); summary.appendChild(badgeCount); panel.appendChild(summary);
  panel.appendChild(el('p', 'reg-sign-connection', 'Signal not connected'));
  var readings = el('dl', 'reg-sign-grid');
  ['Soil moisture', 'Soil 15 cm', 'Birds today'].forEach(function (label) {
    var cell = el('div', ''); cell.appendChild(el('dt', '', label));
    var value = el('dd', '', '—'); value.setAttribute('aria-label', 'No reading available'); cell.appendChild(value); readings.appendChild(cell);
  });
  panel.appendChild(readings);
  panel.appendChild(el('p', 'reg-sign-note', 'No Signal readings are available for this profile. The score above is the assessed Registry record.'));
  var link = el('a', 'reg-sign-link', 'About Signal ↗'); link.href = '/sign/'; panel.appendChild(link); card.appendChild(panel);
  var liveStatus = el('p', 'reg-view-status'); liveStatus.setAttribute('role', 'status'); controls.appendChild(liveStatus);
  function syncLabels() {
    var name = document.getElementById('heroName'); identity.textContent = name ? name.textContent : '';
    var count = document.getElementById('ecBadgeCount'); badgeCount.textContent = count ? count.textContent : '—';
  }
  syncLabels();
  ['heroName', 'ecBadgeCount'].forEach(function (id) {
    var target = document.getElementById(id);
    if (target) new MutationObserver(syncLabels).observe(target, { childList: true, characterData: true, subtree: true });
  });
  function select(value, announce) {
    var isConnected = value === 'connected'; host.setAttribute('data-profile-view', isConnected ? 'connected' : 'profile');
    profile.setAttribute('aria-pressed', String(!isConnected)); connected.setAttribute('aria-pressed', String(isConnected));
    panel.hidden = !isConnected;
    identity.hidden = !isConnected;
    if (announce) liveStatus.textContent = isConnected ? 'Connected sign view. Signal not connected.' : 'Profile card view.';
    try { sessionStorage.setItem('reg_profile_view', isConnected ? 'connected' : 'profile'); } catch (ignore) {}
  }
  profile.addEventListener('click', function () { select('profile', true); });
  connected.addEventListener('click', function () { select('connected', true); });
  var initial = 'profile'; try { initial = sessionStorage.getItem('reg_profile_view') || initial; } catch (ignore) {}
  select(initial, false);
})();
