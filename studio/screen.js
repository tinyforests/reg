/* Shared helpers for the studio window screens (/studio/*.html).
   ?d=SECONDS tells a page how long its slide is on screen, so it can pace itself.
   Every figure is read from the live data on each load — nothing is hardcoded. */
const SCREEN = (() => {
  const P = new URLSearchParams(location.search);
  const duration = Math.min(600, Math.max(20, +P.get('d') || 90)) * 1000;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => Number(n).toLocaleString('en-AU');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const isPublicGarden = g => !g.demo && !/test/i.test(g.garden_name || '');
  const isProvisional = g => /provisional|self[\s_-]*reported/i.test(g.status || '') || /self/i.test(g.verification_level || '');

  async function json(url) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(url, {cache:'no-store', signal:ctl.signal});
      if (!r.ok) throw Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  /* Step length so `count` items fit the slide, leaving `reserve` ms at the end. */
  function pace(count, {min=2500, max=8000, reserve=4000} = {}) {
    return Math.max(min, Math.min(max, (duration - reserve) / Math.max(1, count)));
  }

  function ready() { document.getElementById('state')?.classList.add('hide'); }
  function fail(msg) {
    const st = document.getElementById('state'); if (!st) return;
    st.innerHTML = `<h2>Back in a moment.</h2><p>${esc(msg)}</p>`; st.classList.remove('hide');
  }

  /* Leaflet map in the studio palette; non-interactive. */
  function map(el = 'map') {
    const m = L.map(el, {zoomControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false,
      boxZoom:false, keyboard:false, touchZoom:false, zoomSnap:.25}).setView([-37.84, 145.05], 10);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {attribution:'Tiles &copy; Esri', maxZoom:16}).addTo(m);
    return m;
  }
  /* Fit to the middle of the points so one far-flung record doesn't shrink Melbourne. */
  function frame(m, pts, lo = .05, hi = .95) {
    if (!pts.length) return;
    if (pts.length < 4) { m.fitBounds(pts.map(p => [p.lat, p.lng]), {padding:[80,80], maxZoom:12}); return; }
    const q = (a, p) => a[Math.floor((a.length - 1) * p)];
    const la = pts.map(p => p.lat).sort((a,b) => a-b), ln = pts.map(p => p.lng).sort((a,b) => a-b);
    m.fitBounds([[q(la,lo), q(ln,lo)], [q(la,hi), q(ln,hi)]], {padding:[70,70], maxZoom:12});
  }
  function ripple(m, layer, lat, lng, after) {
    const icon = L.divIcon({className:'', html:'<div class="rip"><i></i><i></i><i></i><b></b></div>', iconSize:[0,0]});
    const mk = L.marker([lat, lng], {icon, interactive:false, keyboard:false}).addTo(layer);
    setTimeout(() => { layer.removeLayer(mk); after && after(); }, 3200);
  }

  /* Concentric ring marker, as on /live: three rings sized by lookup volume at a point. */
  function rings(layer, lat, lng, ct, max, opts = {}) {
    const g = L.layerGroup(opts.pane ? {pane:opts.pane} : {});
    const base = 6 + Math.log(ct + 1) / Math.log(max + 1) * 22;
    [base, base * .62, base * .3].forEach((rad, i) => L.circleMarker([lat, lng], {radius:rad, color:'#7C9A52', weight:1,
      opacity:.9, fillColor:'#7C9A52', fillOpacity:i === 2 ? .5 : .06, interactive:false, ...(opts.pane ? {pane:opts.pane} : {})}).addTo(g));
    return g.addTo(layer);
  }

  return {duration, esc, fmt, sleep, isPublicGarden, isProvisional, json, pace, ready, fail, map, frame, ripple, rings};
})();
