/**
 * build_council.js
 * Ecological Registry — derived council dashboard dataset.
 *
 * The council JSON is ENTIRELY DERIVED from the canonical garden records. Garden
 * records remain the truth; this is the consequence. Nothing here is hand-maintained
 * or hard-coded — the drift that made Boroondara read 8 instead of 9 came exactly
 * from stored aggregates, so we never store aggregates.
 *
 * Rules enforced (per the Boroondara spec):
 *   • every metric carries its denominator n
 *   • every dataset carries as_at + methodology_version + source_commit
 *   • every stat carries an eligibility class (all_live | assessed | verified | provisional)
 *   • score is computed by js/reg-score.js (never read from a stored field)
 *
 * Usage:  node scripts/build_council.js [council="Boroondara"]
 * Writes: data/councils/<slug>.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
eval(fs.readFileSync(path.join(ROOT, 'js', 'reg-score.js'), 'utf8'));        // scoreEcologicalRegistry
eval(fs.readFileSync(path.join(ROOT, 'js', 'reg-opportunities.js'), 'utf8')); // module.exports = { buildOpportunities }
const OPP = (typeof module !== 'undefined' && module.exports && module.exports.buildOpportunities)
  ? module.exports.buildOpportunities : null;

const COUNCIL = (process.argv[2] || 'Boroondara').trim();

function loadGardens() {
  return fs.readdirSync(path.join(ROOT, 'data'))
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f))); } catch (e) { return null; } })
    .filter(r => r && r.garden_id && !Array.isArray(r));
}

function sourceCommit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (e) { return null; }
}

// ---- helpers --------------------------------------------------------------
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
const count = (arr, pred) => arr.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);
const denom = (k, n) => ({ k, n });   // metric with its denominator

function scoreHistory(rec) {
  // scores recorded over time in the activity_log ("Ecological ... score: N/100")
  const out = [];
  (rec.activity_log || []).forEach(e => {
    const m = /score:\s*(\d{1,3})\s*\/\s*100/i.exec(e.notes || '');
    if (m) out.push(parseInt(m[1], 10));
  });
  return out; // newest-first (activity_log is newest-first)
}

// ---- classify each garden -------------------------------------------------
function classify(gardens) {
  return gardens.map(rec => {
    const res = scoreEcologicalRegistry(rec);            // canonical engine
    const b = rec.biodiversity || {}, ev = rec.evidence || {};
    const vlevel = ev.verification_level || 'self_reported';
    const verified = (vlevel === 'gardener_and_son_verified' || vlevel === 'site_visit');
    const hasContent = (b.indigenous_species_current || 0) > 0 || (b.structural_layers_current || 0) > 0 || res.total > 0;
    const assessed = verified && hasContent && res.total > 0;   // excludes design proposals (score 0)
    return {
      rec, res, vlevel, verified, assessed,
      provisional: !verified,
      site_visit: vlevel === 'site_visit',
      history: scoreHistory(rec),
    };
  });
}

// ---- section builders (each stat carries n + eligibility) -----------------
function participation(G) {
  return {
    eligibility: 'all_live',
    live_records: G.length,
    assessed_records: count(G, g => g.assessed),
    verified: count(G, g => g.vlevel === 'gardener_and_son_verified'),
    site_visit: count(G, g => g.vlevel === 'site_visit'),
    provisional: count(G, g => g.provisional),
    reassessed: count(G, g => g.history.length >= 2),
  };
}

function condition(G) {
  const A = G.filter(g => g.assessed);
  const scores = A.map(g => g.res.total);
  const pillars = {};
  ['biodiversity', 'soil_water', 'habitat', 'connectivity', 'evidence'].forEach(p => {
    const vals = A.map(g => g.res.scores[p].score);
    pillars[p] = { mean: mean(vals), median: med(vals), max: { biodiversity: 25, soil_water: 20, habitat: 20, connectivity: 20, evidence: 15 }[p], n: vals.length };
  });
  const bins = [[0, 20], [21, 40], [41, 60], [61, 80], [81, 100]];
  return {
    eligibility: 'assessed', n: A.length,
    median_score: med(scores), mean_score: mean(scores),
    score_range: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
    score_distribution: bins.map(([lo, hi]) => ({ band: lo + '-' + hi, n: count(scores, s => s >= lo && s <= hi) })),
    pillar_scores: pillars,
  };
}

function biodiversity(G) {
  const A = G.filter(g => g.assessed);
  const taxa = new Set(), rows = [];
  A.forEach(g => (g.rec.biodiversity && g.rec.biodiversity.species_list || []).forEach(s => { taxa.add(String(s).toLowerCase().trim()); rows.push(s); }));
  const canopyRows = A.map(g => ({ pct: num((g.rec.biodiversity || {}).canopy_cover_pct_current), area: num(g.rec.area_sqm) }))
    .filter(r => r.pct != null && r.area != null && r.area > 0);
  const totArea = canopyRows.reduce((s, r) => s + r.area, 0);
  return {
    eligibility: 'assessed', n: A.length,
    unique_taxa: taxa.size,
    species_records: rows.length,
    ecological_area_sqm: Math.round(A.reduce((s, g) => s + (num(g.rec.area_sqm) || 0), 0)),
    area_measured_n: count(A, g => num(g.rec.area_sqm) != null && g.rec.area_sqm > 0),
    indigenous_dominant: denom(count(A, g => (g.rec.biodiversity || {}).indigenous_dominant), A.length),
    species_rich_20: denom(count(A, g => ((g.rec.biodiversity || {}).indigenous_species_current || 0) >= 20), A.length),
    species_rich_30: denom(count(A, g => ((g.rec.biodiversity || {}).indigenous_species_current || 0) >= 30), A.length),
    structural_layers: {
      five: denom(count(A, g => ((g.rec.biodiversity || {}).structural_layers_current || 0) >= 5), A.length),
      four_plus: denom(count(A, g => ((g.rec.biodiversity || {}).structural_layers_current || 0) >= 4), A.length),
      median: med(A.map(g => (g.rec.biodiversity || {}).structural_layers_current || 0)),
    },
    canopy_cover_weighted_pct: totArea ? Math.round(canopyRows.reduce((s, r) => s + r.pct * r.area, 0) / totArea * 10) / 10 : null,
    canopy_measured_n: canopyRows.length,
    canopy_note: 'Area-weighted across gardens with both canopy_cover_pct and area_sqm. Council context: 23.3% private-land canopy / 30% 2040 target.',
  };
}

function soilWater(G) {
  const A = G.filter(g => g.assessed);
  const sw = g => g.rec.soil_water || {};
  return {
    eligibility: 'assessed', n: A.length,
    rainwater: denom(count(A, g => sw(g).has_rainwater_system), A.length),
    moisture_basins: denom(count(A, g => sw(g).has_moisture_basin), A.length),
    swales: denom(count(A, g => sw(g).has_swale), A.length),
    water_function_mean: mean(A.map(g => sw(g).water_function_score || 0)),
    soil_health_mean: mean(A.map(g => sw(g).soil_health_score || 0)),
  };
}

function habitat(G) {
  const A = G.filter(g => g.assessed);
  const h = g => g.rec.habitat || {};
  const faunaTaxa = new Set();
  A.forEach(g => (h(g).fauna_sightings || []).forEach(s => { if (s && s.verified && s.species) faunaTaxa.add(String(s.species).toLowerCase().trim()); }));
  return {
    eligibility: 'assessed', n: A.length,
    habitat_nodes_median: med(A.map(g => h(g).habitat_nodes || 0)),
    embedded_logs: denom(count(A, g => h(g).has_embedded_logs), A.length),
    rock_refuges: denom(count(A, g => h(g).has_rock_refuges), A.length),
    water_features: denom(count(A, g => h(g).has_water_feature), A.length),
    nest_boxes: denom(count(A, g => h(g).has_nest_boxes), A.length),
    gardens_with_verified_fauna: denom(count(A, g => (h(g).fauna_sightings || []).some(s => s.verified)), A.length),
    fauna_taxa: faunaTaxa.size,
  };
}

function connectivity(G) {
  const A = G.filter(g => g.assessed);
  const c = g => g.rec.connectivity || {};
  const dists = A.map(g => num(c(g).park_distance_m)).filter(v => v != null);
  return {
    eligibility: 'assessed', n: A.length,
    adjacent_public_green: denom(count(A, g => c(g).adjacent_park), A.length),
    corridor_nodes: denom(count(A, g => c(g).corridor_node_confirmed), A.length),
    with_registered_neighbours: denom(count(A, g => (c(g).adjacent_registered_gardens || []).length > 0), A.length),
    isolated: denom(count(A, g => c(g).adjacent_park !== true && (c(g).adjacent_registered_gardens || []).length === 0), A.length),
    median_public_habitat_distance_m: med(dists),
    note: 'park_distance_m is an analytical network distance, not a species-movement claim.',
  };
}

function evidence(G) {
  const A = G.filter(g => g.assessed), L = G;
  const e = g => g.rec.evidence || {};
  function ageMonths(g) {
    const d = (e(g).verification_date) || '';
    const m = /([A-Za-z]{3,})\s+(\d{4})/.exec(d); if (!m) return null;
    const dt = new Date(m[1] + ' 1, ' + m[2]); if (isNaN(dt)) return null;
    return Math.round((Date.now() - dt) / (1000 * 60 * 60 * 24 * 30.4));
  }
  const ages = A.map(ageMonths).filter(v => v != null);
  return {
    eligibility: 'assessed', n: A.length,
    verification_breakdown: {
      gardener_and_son_verified: count(L, g => g.vlevel === 'gardener_and_son_verified'),
      site_visit: count(L, g => g.vlevel === 'site_visit'),
      photo_verified: count(L, g => g.vlevel === 'photo_verified'),
      self_reported: count(L, g => g.vlevel === 'self_reported'),
    },
    photos: denom(count(A, g => e(g).has_photos), A.length),
    field_notes: denom(count(A, g => e(g).has_field_notes), A.length),
    species_lists: denom(count(A, g => e(g).has_species_list), A.length),
    fauna_records: denom(count(A, g => e(g).has_fauna_record), A.length),
    professional_assessment: denom(count(A, g => e(g).has_professional_assessment), A.length),
    evidence_complete: denom(count(A, g => e(g).has_photos && e(g).has_field_notes && e(g).has_species_list), A.length),
    median_assessment_age_months: med(ages),
    assessment_over_12mo: denom(count(ages, m => m > 12), ages.length),
  };
}

function trajectory(G) {
  const H = G.filter(g => g.history.length >= 2);
  const changes = H.map(g => g.history[0] - g.history[g.history.length - 1]); // current - earliest
  return {
    eligibility: 'reassessed', n: H.length,
    gardens_with_history: H.length,
    median_score_change: med(changes),
    note: 'Change over time from recorded score observations; describes trajectory, not causation.',
  };
}

function opportunities(G) {
  if (!OPP) return { note: 'opportunity engine unavailable' };
  const A = G.filter(g => g.assessed);
  const tally = {};
  A.forEach(g => {
    let r; try { r = OPP(g.rec); } catch (e) { return; }
    (r.opportunities || []).forEach(o => {
      if (!tally[o.id]) tally[o.id] = { id: o.id, action: o.action, pillar: o.pillar, gardens: 0, total_points: 0 };
      tally[o.id].gardens++; tally[o.id].total_points += o.points;
    });
  });
  const ranked = Object.values(tally).map(t => ({
    id: t.id, action: t.action, pillar: t.pillar,
    gardens_affected: denom(t.gardens, A.length),
    avg_potential_points: Math.round(t.total_points / t.gardens * 10) / 10,
  })).sort((a, b) => (b.gardens_affected.k - a.gardens_affected.k) || (b.avg_potential_points - a.avg_potential_points));
  return { eligibility: 'assessed', n: A.length, ranked: ranked.slice(0, 12) };
}

// ---- assemble -------------------------------------------------------------
function main() {
  const all = loadGardens();
  const needle = COUNCIL.toLowerCase();
  const inCouncil = all.filter(r =>
    String(r.lga || '').trim().toLowerCase() === needle ||
    String(r.council || '').toLowerCase().indexOf(needle) >= 0);
  const G = classify(inCouncil);

  const out = {
    meta: {
      council: COUNCIL,
      lga_code: null,
      as_at: new Date().toISOString().slice(0, 10),
      methodology_version: 'v1.0',
      scoring: 'js/reg-score.js (five-pillar, parity-tested)',
      source_commit: sourceCommit(),
      privacy_mode: 'de-identified',
      derived: true,
      eligibility_definitions: {
        all_live: 'every live garden record in the council',
        assessed: 'verified/site-visit records with a completed ecological assessment (score > 0); design proposals & provisional excluded',
        verified: 'verification_level gardener_and_son_verified or site_visit',
        provisional: 'not verified (self_reported / photo_verified / none)',
      },
      note: 'Entirely derived from canonical garden records; no stored aggregates. Every metric carries its denominator n.',
    },
    records: G.map(g => ({           // de-identified audit — every aggregate traces to these
      garden_id: g.rec.garden_id,
      suburb: g.rec.suburb || null,
      eligibility: g.assessed ? 'assessed' : (g.verified ? 'verified' : 'provisional'),
      verification: g.vlevel,
      score: g.res.total,
      registry_role: g.rec.registry_role || null,
      structural_layers: (g.rec.biodiversity || {}).structural_layers_current || 0,
      reassessments: g.history.length,
    })),
    participation: participation(G),
    condition: condition(G),
    biodiversity: biodiversity(G),
    soil_water: soilWater(G),
    habitat: habitat(G),
    connectivity: connectivity(G),
    evidence: evidence(G),
    trajectory: trajectory(G),
    opportunities: opportunities(G),
    demand: { available: false, note: 'lookup/discovery demand lives in the Apps Script backend; wire in separately (aggregated, min-cohort, suburb/hex only).' },
  };

  const destDir = path.join(ROOT, 'data', 'councils');
  fs.mkdirSync(destDir, { recursive: true });
  const slug = COUNCIL.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const dest = path.join(destDir, slug + '.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote ' + path.relative(ROOT, dest));
  console.log('  ' + COUNCIL + ': ' + out.participation.live_records + ' live · ' +
    out.participation.assessed_records + ' assessed · ' + out.participation.verified + ' verified · ' +
    out.participation.site_visit + ' site-visit · ' + out.participation.provisional + ' provisional');
  console.log('  condition: median ' + out.condition.median_score + ' · range ' +
    JSON.stringify(out.condition.score_range) + ' · n=' + out.condition.n);
}

main();
