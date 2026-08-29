/**
 * reg-precise-map.js
 * Ecological Registry — steward-only precise network map (Option B).
 *
 * The public profile shows an APPROXIMATE location circle (fuzzed coords, from the
 * static file). Precise coordinates are never in the public repo or the public
 * get_garden_record response. A verified steward, viewing their OWN garden, can
 * fetch the precise coords live from the token-gated get_precise_map endpoint and
 * see the accurate network map (real garden position, park, neighbour distances).
 *
 * Depends on: reg-identity.js (isSteward, getStewardSession) + Leaflet (L).
 * Call renderPreciseMapForSteward(garden_id) after the approximate map renders.
 */
(function (root) {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';
  function el(id) { return document.getElementById(id); }

  function renderPreciseMapForSteward(gardenId) {
    if (!gardenId) return;
    if (typeof isSteward !== 'function' || !isSteward(gardenId)) return;   // public → keep the circle
    var token = (typeof getStewardSession === 'function') ? getStewardSession(gardenId) : null;
    if (!token) return;   // claimed on an old device without a session token → keep the circle
    fetch(ENDPOINT + '?action=get_precise_map&garden_id=' + encodeURIComponent(gardenId) +
          '&session_token=' + encodeURIComponent(token) + '&_cb=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok && d.precise && d.precise.lat != null) _drawPrecise(d.precise); })
      .catch(function () {});
  }

  function _drawPrecise(p) {
    var host = el('corridorMap');
    if (!host || typeof L === 'undefined') return;
    if (root._map) { try { root._map.remove(); } catch (e) {} root._map = null; }
    host.innerHTML = '';
    host.style.position = 'relative';

    var map = L.map('corridorMap', { zoomControl: false, scrollWheelZoom: false, attributionControl: false });
    root._map = map;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(map);

    var bounds = [[p.lat, p.lng]];
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'map-pin-green', iconSize: [14, 14] }) })
      .addTo(map).bindPopup('<strong>Your garden</strong> (precise — steward view)');

    if (p.park_lat != null && p.park_lng != null) {
      bounds.push([p.park_lat, p.park_lng]);
      L.marker([p.park_lat, p.park_lng], { icon: L.divIcon({ className: 'park-marker', iconSize: [50, 50] }) })
        .addTo(map).bindPopup('<strong>' + (p.park_name || 'Adjacent park') + '</strong>');
      L.polyline([[p.lat, p.lng], [p.park_lat, p.park_lng]], { color: '#7a9e5f', weight: 1.5, dashArray: '4 4', opacity: 0.6 }).addTo(map);
    }

    (p.neighbours || []).forEach(function (n) {
      if (n.lat == null || n.lng == null) return;
      bounds.push([n.lat, n.lng]);
      L.marker([n.lat, n.lng], { icon: L.divIcon({ className: 'adj-marker', iconSize: [12, 12] }) })
        .addTo(map).bindPopup('<strong>' + (n.name || n.garden_id) + '</strong><br>' +
          _dist(p.lat, p.lng, n.lat, n.lng) + ' m' + (n.source === 'invited' ? ' · invited' : ''));
      L.polyline([[p.lat, p.lng], [n.lat, n.lng]], { color: '#7a9e5f', weight: 1.5, dashArray: '4 4', opacity: 0.7 }).addTo(map);
    });

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] }); else map.setView([p.lat, p.lng], 16);

    var lbl = document.createElement('div');
    lbl.textContent = 'Precise view — visible only to you (steward)';
    lbl.style.cssText = 'position:absolute;bottom:6px;left:6px;z-index:500;background:rgba(61,69,53,.85);' +
      'color:#fff0dc;font-size:10px;padding:3px 7px;border-radius:2px;pointer-events:none';
    host.appendChild(lbl);
    setTimeout(function () { map.invalidateSize(); }, 100);
  }

  function _dist(la1, lo1, la2, lo2) {
    var R = 6371000, f1 = la1 * Math.PI / 180, f2 = la2 * Math.PI / 180,
        df = (la2 - la1) * Math.PI / 180, dl = (lo2 - lo1) * Math.PI / 180;
    var a = Math.sin(df / 2) * Math.sin(df / 2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  root.renderPreciseMapForSteward = renderPreciseMapForSteward;
})(typeof window !== 'undefined' ? window : this);
