/**
 * reg-spatial.js
 * Ecological Registry — shared spatial sections: Canopy + Habitat Context.
 *
 * SINGLE SOURCE OF TRUTH. Any profile that loads this script and calls
 * renderSpatialSections(R) gets identical Canopy + Habitat Context sections —
 * injected before #species if not already in the page — so every existing and
 * future profile matches automatically. No per-profile markup to maintain.
 *
 * Display only:
 *   Canopy        — canopy.existing, computed by scripts/canopy_map.py
 *   Habitat value — habitat_context.habitat_value, by scripts/habitat_value.py
 * Neither affects the ecological score. Precise canopy geometry is steward-gated.
 * Habitat Value is LANDSCAPE CONTEXT, not a measure of the garden itself.
 */
(function (root) {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function txt(id, v) { var e = el(id); if (e) e.textContent = String(v); }

  var CANOPY_HTML =
    '<section id="canopy" class="stagger">' +
      '<div class="section-label mb-1">Spatial Layer</div>' +
      '<h2 class="font-serif text-4xl mb-6">Canopy</h2>' +
      '<div class="grid lg:grid-cols-12 gap-6">' +
        '<div class="lg:col-span-5 border border-rl dark:border-rdl bg-white dark:bg-rdp p-6">' +
          '<div class="text-3xl font-light mb-1" id="canopyCoverPct">--</div>' +
          '<div class="text-sm opacity-70 mb-5" id="canopyAreaLine"></div>' +
          '<div class="section-label mb-1">Source</div>' +
          '<div class="text-xs opacity-70 mb-3" id="canopySource">--</div>' +
          '<div class="section-label mb-1">Verification</div>' +
          '<div class="text-xs opacity-70 mb-4" id="canopyVerification">--</div>' +
          '<div class="text-xs opacity-50 leading-relaxed" id="canopyFieldContext"></div>' +
        '</div>' +
        '<div class="lg:col-span-7 border border-rl dark:border-rdl bg-white dark:bg-rdp overflow-hidden">' +
          '<div id="canopyMap" style="height:320px;width:100%;display:flex;align-items:center;justify-content:center">' +
            '<div class="text-xs opacity-50 text-center px-6" id="canopyMapPending">The mapped canopy extent is private to the garden’s steward. Unlock this profile to view it.</div>' +
          '</div>' +
          '<div class="px-4 py-3 border-t border-rl dark:border-rdl flex items-center gap-4 text-xs" id="canopyMapLegend" style="display:none">' +
            '<label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" id="canopyToggle" checked /> <span>Canopy</span></label>' +
            '<div class="flex items-center gap-1.5"><div style="width:10px;height:10px;border:1px solid #7a9e5f;flex-shrink:0"></div><span>Property boundary</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';

  function ensureSections() {
    if (el('canopy')) return;   // already in the page
    var species = el('species');
    if (!species || !species.parentNode) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = CANOPY_HTML;
    while (wrap.firstChild) species.parentNode.insertBefore(wrap.firstChild, species);
  }

  function renderCanopy(R) {
    var sec = el('canopy');
    var cx = R && R.canopy && R.canopy.existing;
    if (!sec) return;
    if (!cx) { sec.style.display = 'none'; return; }
    var nf = function (n) { return (n == null) ? '--' : Math.round(n).toLocaleString(); };
    if (cx.canopy_cover_pct == null) {
      txt('canopyCoverPct', 'Mapping pending');
      txt('canopyAreaLine', cx.garden_extent_geojson
        ? 'Garden extent captured — canopy % pending computation.'
        : 'Canopy mapping not yet run for this property.');
    } else {
      txt('canopyCoverPct', cx.canopy_cover_pct + '% mapped canopy cover');
      txt('canopyAreaLine', nf(cx.canopy_area_sqm) + ' m² of ' + nf(cx.property_area_sqm) + ' m² property area');
    }
    txt('canopySource', cx.source
      ? (cx.source + (cx.source_date ? ' · ' + cx.source_date : '') + (cx.resolution ? ' · ' + cx.resolution : ''))
      : 'Pending — no dataset processed yet');
    var VMAP = { mapped_estimate: 'Mapped estimate · spatial imagery/data', steward_confirmed: 'Steward-confirmed',
      designer_confirmed: 'Designer-confirmed', field_verified: 'Field-verified' };
    txt('canopyVerification', VMAP[cx.verification_status] || cx.verification_status || '--');
    txt('canopyFieldContext', cx.field_context_note || '');
    var isSt = (typeof isSteward === 'function') && isSteward(R.garden_id);
    var geom = cx.garden_extent_geojson || cx.parcel_geojson || cx.canopy_geojson;
    var pend = el('canopyMapPending');
    if (isSt && geom && typeof L !== 'undefined') { _renderCanopyMap(cx); }
    else if (pend) { pend.textContent = geom
      ? 'Canopy overlay is visible to the garden steward once signed in.'
      : 'Canopy overlay appears here once the property is mapped.'; }
  }

  function _renderCanopyMap(cx) {
    var host = el('canopyMap'); if (!host) return;
    host.innerHTML = ''; host.style.display = 'block';
    var map = L.map(host, { attributionControl: false, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 21, maxNativeZoom: 19 }).addTo(map);
    var boundaryGeom = cx.garden_extent_geojson || cx.parcel_geojson;
    var boundary = boundaryGeom ? L.geoJSON(boundaryGeom, { style: { color: '#7a9e5f', weight: 2, fill: false } }).addTo(map) : null;
    var canopy = cx.canopy_geojson ? L.geoJSON(cx.canopy_geojson, { style: { weight: 0, fillColor: '#7a9e5f', fillOpacity: 0.45 } }).addTo(map) : null;
    try { if (boundary) map.fitBounds(boundary.getBounds(), { padding: [20, 20] }); } catch (e) {}
    var legend = el('canopyMapLegend'); if (legend) legend.style.display = '';
    var toggle = el('canopyToggle');
    if (toggle && canopy) toggle.onchange = function () { this.checked ? canopy.addTo(map) : map.removeLayer(canopy); };
    else { var lbl = toggle && toggle.parentNode; if (lbl) lbl.style.display = 'none'; }
    setTimeout(function () { map.invalidateSize(); }, 100);
  }

  /* Draw the canopy garden-extent overlay from geometry fetched via the steward-
     gated endpoint (reg-precise-map.js). Precise property geometry never comes from
     the static file — only served token-gated to the signed-in steward. */
  function renderCanopyOverlay(geometry) {
    var host = el('canopyMap');
    if (!host || !geometry || typeof L === 'undefined') return;
    host.innerHTML = ''; host.style.display = 'block';
    host.style.alignItems = ''; host.style.justifyContent = '';
    var map = L.map(host, { attributionControl: false, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 21, maxNativeZoom: 19 }).addTo(map);
    var boundary = L.geoJSON(geometry, { style: { color: '#7a9e5f', weight: 2, fill: false } }).addTo(map);
    try { map.fitBounds(boundary.getBounds(), { padding: [20, 20] }); } catch (e) {}
    var legend = el('canopyMapLegend'); if (legend) legend.style.display = '';
    setTimeout(function () { map.invalidateSize(); }, 100);
  }

  function renderSpatialSections(R) {
    ensureSections();
    renderCanopy(R);
  }

  root.renderSpatialSections = renderSpatialSections;
  root.renderCanopyOverlay = renderCanopyOverlay;
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderSpatialSections: renderSpatialSections, renderCanopyOverlay: renderCanopyOverlay };
})(typeof window !== 'undefined' ? window : this);
