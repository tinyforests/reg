(function () {
  'use strict';
  var key = document.body.dataset.designerId;
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function read(path) { return fetch(path).then(function (r) { if (!r.ok) throw Error('Unable to load public garden records.'); return r.json(); }); }
  var mode = 'dark'; try { mode = localStorage.getItem('reg_mode') || mode; } catch (_) {}
  function theme() { document.documentElement.classList.toggle('dark',mode === 'dark'); document.getElementById('themeToggle').textContent = mode === 'dark' ? 'Canopy' : 'Understory'; }
  theme(); document.getElementById('themeToggle').onclick = function () { mode = mode === 'dark' ? 'light' : 'dark'; theme(); try { localStorage.setItem('reg_mode',mode); } catch (_) {} };
  Promise.all([read('/data/designers.json'),read('/data/registry.json')]).then(function (data) {
    var practice = data[0].designers.find(function (d) { return d.designer_id === key; });
    if (!practice) throw Error('Designer attribution is not recorded.');
    document.getElementById('practiceName').textContent = practice.practice_name;
    var gardens = data[1].gardens.filter(function (g) { return g.designer_id === key; });
    return Promise.all(gardens.map(function (g) { return read('/' + g.data_file.replace(/^\//,'')).then(function (record) { return {garden:g,record:record}; }); }));
  }).then(function (rows) {
    var cards = document.getElementById('gardens'); cards.replaceChildren();
    var map = L.map('corridorMap',{scrollWheelZoom:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap contributors © CARTO'}).addTo(map);
    var bounds = [];
    rows.forEach(function (row) {
      var g = row.garden, r = row.record;
      var provisional = ['Provisional','Design Proposal'].includes(g.status) || ['Provisional','Design Proposal'].includes(r.status);
      var card = el('article',null,'garden-card' + (provisional ? ' provisional' : ''));
      card.append(el('h3',g.garden_name),el('p',g.suburb || 'Suburb not recorded','small'),el('strong',provisional ? '—' : String(g.score)),el('p',provisional ? 'Unverified · ' + (r.status || g.status) : g.status,'small'));
      if (provisional) card.append(el('p','Awaiting review. No verified score or badges.','small'));
      var link = el('a','View public garden record →'); link.href = g.profile_url; card.append(link); cards.append(card);
      var c = r.connectivity || {};
      if (Number.isFinite(c.display_lat) && Number.isFinite(c.display_lng)) {
        var point = [c.display_lat,c.display_lng]; bounds.push(point);
        var popup = el('div'); popup.append(el('strong',g.garden_name),el('p',g.suburb || ''),el('p',provisional ? 'Unverified · awaiting review' : String(g.score) + '/100 · ' + g.status));
        L.circleMarker(point,{radius:7,color:provisional ? '#b49a63' : '#7a9e5f',fillOpacity:0.8}).addTo(map).bindPopup(popup);
      }
    });
    if (bounds.length) map.fitBounds(bounds,{padding:[35,35],maxZoom:13});
    else { map.remove(); document.getElementById('corridorMap').textContent = 'No public display locations recorded.'; }
    if (!rows.length) cards.append(el('p','No attributed gardens recorded.','empty'));
  }).catch(function (e) { document.getElementById('notice').textContent = e.message; });
})();
