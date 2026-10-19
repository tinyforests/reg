/* Plant library — shared by /plants/studio.html and /plants/view.html.
 *
 * Reads /data/plant-library.json, generated from tinyforests/plants by
 * `python3 -m canonical.publish --reg`. Never edit that file here: record
 * changes are made in the studio, stored as Plant Edits by the Apps Script
 * backend, overlaid here immediately, and folded into the library on the
 * next plants build.
 */
(function (root) {
  'use strict';

  var BANDS = {canopy: 'Canopy', shrub: 'Shrub', forb: 'Forb', grass: 'Grass & strappy', ground: 'Ground'};
  var by = {}, list = [], loaded = null;

  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[‘’'"`]/g, '').replace(/\s+/g, ' ').trim();
  }

  function slugify(name) {
    return fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function index(rec) {
    rec._k = fold(rec.botanical_name) + ' | ' + fold(rec.common_name);
    rec._g = fold(rec.botanical_name).split(' ')[0];
    return rec;
  }

  function load(url) {
    if (loaded) return loaded;
    loaded = fetch(url || '/data/plant-library.json', {cache: 'no-cache'})
      .then(function (r) { if (!r.ok) throw new Error('library ' + r.status); return r.json(); })
      .then(function (d) {
        list = d.species.map(index);
        by = {};
        list.forEach(function (r) { by[r.slug] = r; });
        return {count: list.length, generated: d.metadata && d.metadata.generated};
      });
    return loaded;
  }

  /* edits: {slug: {field: value}} — latest value per field. */
  function applyEdits(edits) {
    Object.keys(edits || {}).forEach(function (slug) {
      var e = edits[slug], rec = by[slug];
      if (!rec) {
        if (!e.botanical_name) return;
        rec = by[slug] = {slug: slug, _new: true};
        list.push(rec);
      }
      Object.keys(e).forEach(function (f) {
        if (f === 'life_form') return;
        rec[f] = e[f];
      });
      rec._edited = true;
      index(rec);
    });
    list = list.filter(function (r) { return !r.archived; });
  }

  function get(slug) { return by[slug] || null; }

  /* Ranked search. Exact genus or word-start matches first, then contains. */
  function search(q, f) {
    f = f || {};
    var t = fold(q), words = t ? t.split(' ') : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (f.native && !(r.australian_native || r.indigenous_vic || (r.evcs && r.evcs.length))) continue;
      if (f.band && r.display_band !== f.band) continue;
      if (f.evc && !(r.evcs || []).some(function (c) { return String(c) === String(f.evc); })) continue;
      var score = 0;
      if (words.length) {
        var ok = true;
        for (var w = 0; w < words.length; w++) {
          var at = r._k.indexOf(words[w]);
          if (at < 0) { ok = false; break; }
          score += at === 0 ? 30 : (r._k.charAt(at - 1) === ' ' ? 12 : 2);
        }
        if (!ok) continue;
        if (r._g === words[0]) score += 20;
      }
      if (r.description) score += 3;
      if (r.common_name) score += 1;
      out.push([score, r]);
    }
    out.sort(function (a, b) {
      return b[0] - a[0] || fold(a[1].botanical_name).localeCompare(fold(b[1].botanical_name));
    });
    return out.map(function (x) { return x[1]; });
  }

  function m(v) { return v >= 1 ? (+v.toFixed(1)) + ' m' : Math.round(v * 100) + ' cm'; }
  function range(o) {
    if (!o) return '';
    if (o.min != null && o.max != null && o.min !== o.max) return m(o.min) + '–' + m(o.max);
    return m(o.max != null ? o.max : o.min);
  }
  function size(r) {
    var h = range(r.mature_height_m), w = range(r.mature_width_m);
    if (h && w) return h + ' h × ' + w + ' w';
    if (h) return h + ' h';
    return r.height_raw || '';
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function flowering(r) {
    if (r.flowering && r.flowering.peak && r.flowering.peak.length) {
      return r.flowering.peak.map(function (n) { return MONTHS[n - 1]; }).join(', ');
    }
    return (r.bloom_time || []).filter(function (b) { return b !== 'Evergreen'; }).join(', ');
  }

  function label(r) { return r.botanical_name + (r.common_name ? ' — ' + r.common_name : ''); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }

  root.PlantLibrary = {
    load: load, applyEdits: applyEdits, get: get, search: search, slugify: slugify,
    size: size, flowering: flowering, label: label, esc: esc, BANDS: BANDS,
    all: function () { return list; }
  };
})(window);
