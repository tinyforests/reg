/**
 * reg-identity.js
 * Ecological Registry — Device identity and steward recognition
 *
 * A steward claims their garden profile by entering their email in the bottom
 * bar. The backend checks the email against known steward records and sends a
 * magic link. Clicking the link verifies the token, marks this device as the
 * steward in localStorage, and reloads in steward view.
 *
 * isSteward(gardenId) is a UX signal only — it gates badge notifications and
 * privacy-sensitive rendering (name, precise map pin). It is not authentication.
 */

(function (root) {
  'use strict';

  var DEVICE_KEY  = 'er_device_id';
  var STEWARD_PFX = 'er_steward:';
  var ENDPOINT    = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';

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

  /* Link this device + email to a garden. Called after token verification. */
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

  /* Returns true if this device has been linked to the given garden, or admin override is set. */
  function isSteward(gardenId) {
    if (!gardenId) return false;
    try {
      if (localStorage.getItem('er_admin') === '1') return true;
      return !!localStorage.getItem(STEWARD_PFX + gardenId);
    } catch (e) { return false; }
  }

  /* Returns the stored steward record, or null. */
  function getSteward(gardenId) {
    try {
      var v = localStorage.getItem(STEWARD_PFX + gardenId);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }

  /*
   * Detects a ?claim=<token> param placed in the URL by a magic-link email.
   * If found, validates the token with the Apps Script backend. On success,
   * marks this device as the steward and reloads in steward view.
   * Call this from the profile render function with the garden's garden_id.
   */
  function handleClaimParam(gardenId) {
    if (!gardenId) return;
    var search = window.location.search;
    if (search.indexOf('claim=') === -1) return;

    var token = '';
    try {
      token = new URLSearchParams(search).get('claim') || '';
    } catch (e) {
      var m = search.match(/[?&]claim=([^&]+)/);
      token = m ? decodeURIComponent(m[1]) : '';
    }
    if (!token) return;

    // Clean the URL immediately so the token doesn't linger in the address bar
    try { history.replaceState(null, '', window.location.pathname); } catch (e) {}

    var banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:#3d4535;color:#fff0dc;font-family:"IBM Plex Sans",sans-serif;font-size:.78rem;padding:.6rem 1.25rem;text-align:center';
    banner.textContent = 'Verifying your claim link…';
    document.body.appendChild(banner);

    fetch(ENDPOINT + '?action=verify_claim&token=' + encodeURIComponent(token) +
          '&garden_id=' + encodeURIComponent(gardenId))
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json && json.ok && json.email) {
          markSteward(gardenId, json.email);
          banner.textContent = 'Profile claimed — loading your steward view…';
          setTimeout(function () { window.location.reload(); }, 900);
        } else {
          banner.style.background = '#8b3a3a';
          banner.textContent = (json && json.error) || 'This claim link is invalid or has expired. Request a new one from your garden profile.';
          setTimeout(function () { banner.parentNode && banner.parentNode.removeChild(banner); }, 6000);
        }
      })
      .catch(function () {
        banner.parentNode && banner.parentNode.removeChild(banner);
      });
  }

  /*
   * Renders a fixed bottom bar that lets a steward enter their email to receive
   * a magic claim link. No-ops if already identified, dismissed this session,
   * or already mounted.
   */
  function mountStewardUnlock(gardenId) {
    if (!gardenId || isSteward(gardenId)) return;
    if (document.getElementById('er-steward-unlock')) return;
    try { if (sessionStorage.getItem('er_unlock_dismissed:' + gardenId) === '1') return; } catch (e) {}

    // Derive the garden slug from the pathname (e.g. /gardens/arundel/ -> arundel)
    var pathParts  = window.location.pathname.replace(/\/$/, '').split('/').filter(function(p) { return p && p !== 'index.html'; });
    var gardenSlug = pathParts[pathParts.length - 1] || '';

    var bar = document.createElement('div');
    bar.id = 'er-steward-unlock';
    bar.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;z-index:100',
      'padding:.7rem 1.25rem',
      '-webkit-backdrop-filter:blur(1.5px)',
      'backdrop-filter:blur(1.5px)',
      'font-family:"IBM Plex Sans",sans-serif',
      'display:flex;flex-direction:column;justify-content:center;align-items:center',
      'transition:min-height .38s ease'
    ].join(';');
    bar.innerHTML =
      '<div id="er-unlock-hero" style="width:100%;max-width:960px;margin:0 auto;text-align:center;' +
        'overflow:hidden;max-height:0;padding-bottom:0;opacity:0;pointer-events:none;' +
        'transition:max-height .38s ease,opacity .28s ease .08s,padding-bottom .38s ease">' +
        '<p id="er-hero-heading" style="font-family:\'Abril Fatface\',serif;font-size:clamp(1.4rem,3.5vw,2rem);line-height:1.25;margin:0 0 .6rem">' +
          'Claim this profile to add and unlock your field records.' +
        '</p>' +
        '<p style="font-size:.78rem;opacity:.65;margin:0;line-height:1.5">' +
          'Your field notes, precise location and steward details are private — share what you choose.' +
        '</p>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:.6rem;flex-wrap:wrap;max-width:960px;margin:0 auto;width:100%;box-sizing:border-box">' +
        '<span id="er-unlock-hint" style="font-size:.72rem;opacity:.65;flex-shrink:0;text-align:center">Is this your garden? Enter your email to unlock your private profile.</span>' +
        '<input id="er-unlock-email" type="email" placeholder="Your email" autocomplete="email" ' +
          'style="flex:1;min-width:160px;font-size:.75rem;padding:.32rem .6rem;' +
          'background:transparent;outline:none;font-family:inherit" />' +
        '<button id="er-unlock-btn" ' +
          'style="font-size:.72rem;padding:.35rem .85rem;border:none;cursor:pointer;white-space:nowrap;font-family:inherit">' +
          'Send magic link</button>' +
        '<button id="er-unlock-dismiss" aria-label="Dismiss" ' +
          'style="font-size:.8rem;opacity:.35;background:none;border:none;cursor:pointer;padding:.2rem .4rem;line-height:1">' +
          '&#x2715;</button>' +
      '</div>' +
      '<div id="er-unlock-msg" style="font-size:.7rem;margin-top:.35rem;display:none;max-width:960px;margin-left:auto;margin-right:auto;opacity:.8"></div>';

    document.body.appendChild(bar);

    // Theme-aware colours: beige bar on dark/Canopy, green bar on light/Understory
    function _erBarTheme() {
      var dark = document.documentElement.classList.contains('dark');
      var fg   = dark ? '#3d4535' : '#fff0dc';
      var bg   = dark ? 'rgba(255,240,220,.85)' : 'rgba(61,69,53,.76)';
      var bdr  = dark ? 'rgba(61,69,53,.15)'    : 'rgba(255,240,220,.12)';
      var btnBg = dark ? '#3d4535' : '#7a9e5f';
      bar.style.background    = bg;
      bar.style.borderTop     = '1px solid ' + bdr;
      bar.style.color         = fg;
      var inp = document.getElementById('er-unlock-email');
      if (inp) { inp.style.borderColor = dark ? 'rgba(61,69,53,.35)' : 'rgba(255,240,220,.3)'; inp.style.color = fg; inp.style.border = '1px solid ' + (dark ? 'rgba(61,69,53,.35)' : 'rgba(255,240,220,.3)'); }
      var btn = document.getElementById('er-unlock-btn');
      if (btn) { btn.style.background = btnBg; btn.style.color = '#fff0dc'; }
      var dis = document.getElementById('er-unlock-dismiss');
      if (dis) dis.style.color = fg;
      var hdg = document.getElementById('er-hero-heading');
      if (hdg) hdg.style.color = fg;
    }
    _erBarTheme();
    if (window.MutationObserver) {
      new MutationObserver(_erBarTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    // Rise up under the Field Record heading as it scrolls into view
    if (window.IntersectionObserver) {
      var _recordSec = document.getElementById('record');
      if (_recordSec) {
        var _erExpanded = false;
        var _erHero = null;

        function _erBarHeight() {
          var h2 = _recordSec.querySelector('h2');
          if (!h2) return Math.round(window.innerHeight * 0.6);
          var r = h2.getBoundingClientRect();
          var hdr = document.querySelector('header');
          var headerH = hdr ? hdr.getBoundingClientRect().height : 0;
          var maxH = window.innerHeight - headerH;
          return Math.min(maxH, Math.max(80, window.innerHeight - r.bottom - 4));
        }

        function _erScrollTrack() {
          if (!_erExpanded) return;
          bar.style.transition = 'none';
          bar.style.minHeight = _erBarHeight() + 'px';
        }

        new IntersectionObserver(function(entries) {
          _erHero = _erHero || document.getElementById('er-unlock-hero');
          if (entries[0].isIntersecting) {
            _erExpanded = true;
            bar.style.transition = 'min-height .38s ease';
            bar.style.minHeight = _erBarHeight() + 'px';
            if (_erHero) {
              _erHero.style.maxHeight = '20rem';
              _erHero.style.opacity = '1';
              _erHero.style.paddingBottom = '1.25rem';
              _erHero.style.pointerEvents = '';
            }
            window.addEventListener('scroll', _erScrollTrack, { passive: true });
          } else {
            _erExpanded = false;
            bar.style.transition = 'min-height .38s ease';
            bar.style.minHeight = '';
            if (_erHero) {
              _erHero.style.maxHeight = '0';
              _erHero.style.opacity = '0';
              _erHero.style.paddingBottom = '0';
              _erHero.style.pointerEvents = 'none';
            }
            window.removeEventListener('scroll', _erScrollTrack);
          }
        }, { threshold: 0.1 }).observe(_recordSec);
      }
    }

    document.getElementById('er-unlock-dismiss').onclick = function () {
      bar.parentNode && bar.parentNode.removeChild(bar);
      try { sessionStorage.setItem('er_unlock_dismissed:' + gardenId, '1'); } catch (e) {}
    };

    document.getElementById('er-unlock-btn').onclick = function () {
      var emailEl = document.getElementById('er-unlock-email');
      var email   = emailEl ? emailEl.value.trim() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (emailEl) emailEl.focus(); return; }

      var btn = document.getElementById('er-unlock-btn');
      var msg = document.getElementById('er-unlock-msg');
      btn.disabled    = true;
      btn.textContent = 'Sending…';

      fetch(ENDPOINT + '?action=request_claim&email=' + encodeURIComponent(email) +
            '&garden_id=' + encodeURIComponent(gardenId) +
            '&garden_slug=' + encodeURIComponent(gardenSlug))
        .then(function (r) { return r.json(); })
        .then(function () {
          // Always show the safe message — backend never reveals if the email was found
          bar.innerHTML =
            '<div style="font-size:.8rem;text-align:center;padding:.1rem 0;max-width:960px;margin:0 auto">' +
            'Check your email for a magic link — it expires in 30 minutes.' +
            '</div>';
          setTimeout(function () { bar.parentNode && bar.parentNode.removeChild(bar); }, 12000);
        })
        .catch(function () {
          btn.disabled    = false;
          btn.textContent = 'Send magic link';
          msg.style.display = 'block';
          msg.textContent = 'Could not reach the server — please try again.';
        });
    };
  }

  var api = { getDeviceId: getDeviceId, markSteward: markSteward, isSteward: isSteward, getSteward: getSteward, mountStewardUnlock: mountStewardUnlock, handleClaimParam: handleClaimParam, endpoint: ENDPOINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.getDeviceId        = getDeviceId;
    root.markSteward        = markSteward;
    root.isSteward          = isSteward;
    root.getSteward         = getSteward;
    root.mountStewardUnlock = mountStewardUnlock;
    root.handleClaimParam   = handleClaimParam;
    root.RegIdentity        = api;
    root.RegEndpoint        = ENDPOINT;
  }

})(typeof self !== 'undefined' ? self : this);
