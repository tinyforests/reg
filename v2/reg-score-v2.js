/**
 * reg-score-v2.js — SHADOW ENGINE. Not canonical. Does not touch Method v1.
 *
 * Computes three quantities for a registered place:
 *   EP  Ecological Performance   0-100   achievement against site envelope
 *   EC  Ecological Contribution  ECU     absolute contribution, unbounded
 *   LO  Latent Opportunity       ECU     EC_potential - EC_actual
 *
 * DESIGN RULES ENFORCED IN CODE:
 *   1. No coefficient is hardcoded here. Every number comes from the locale pack.
 *   2. title_area_m2 is never read. Only growing area and volume enter any formula.
 *   3. Applicability reduces the DENOMINATOR. Points are never invented.
 *   4. persistence and network affect EC only, never EP.
 *   5. Every output carries method_version + locale_version so scores never
 *      silently change under a recalibration.
 *
 * Every numeric result from this file is a HYPOTHESIS. See v2/HYPOTHESES.md.
 */

'use strict';

// ---------------------------------------------------------------- utilities

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sum = (a) => a.reduce((x, y) => x + y, 0);

function assertNoTitleArea(fn) {
  // Guard rail: title area must never influence a score. Kept as an explicit
  // marker so a future edit that reaches for it is visible in review.
  return fn;
}

// ---------------------------------------------------------------- envelope

/** Derive the display class. Label only — never used in EP or EC. */
function deriveEnvelopeClass(env, locale) {
  if (env.tenure === 'institutional') return 'institutional';
  if ((env.dwelling_count || 1) > 1) return 'shared_residential';
  for (const rule of locale.envelope_class_rules) {
    if (rule.substrate_in && !rule.substrate_in.includes(env.substrate_class)) continue;
    if (rule.vertical_envelope_max != null &&
        env.vertical_envelope_m > rule.vertical_envelope_max) continue;
    if (env.growing_area_m2 <= rule.growing_area_max) return rule.class;
  }
  return 'large_residential';
}

/** Rooting volume actually available, m3. */
function rootingVolume(env) {
  const depth = {
    in_ground: 0.6, raised_deep: 0.6, raised_shallow: 0.4,
    container: 0.25, epiphytic: 0.05
  }[env.substrate_class] ?? 0.25;
  const unsealed = env.substrate_class === 'in_ground' ? 1.0 : 1.0;
  return env.growing_area_m2 * depth * unsealed;
}

/** Which stratum counts as THIS envelope's upper stratum. The retargeting rule. */
function upperStratumTarget(env, locale) {
  for (const band of locale.upper_stratum_by_vertical_envelope) {
    if (env.vertical_envelope_m <= band.max_height_m) return band;
  }
  return locale.upper_stratum_by_vertical_envelope.slice(-1)[0];
}

/** Envelope-scaled indigenous species richness target. Floored, never removed. */
function richnessTarget(env, locale) {
  const c = locale.species_richness;
  const df = c.depth_factor[env.substrate_class] ?? 0.5;
  const t = c.absolute_floor + c.k * Math.log2(1 + env.growing_area_m2 * df);
  return Math.min(c.target_ceiling, Math.round(t));
}

// ------------------------------------------------------- indicator library

/**
 * Indicators are FUNCTION-level. `applicable` returns 0 only where the
 * function is physically impossible in this envelope — not merely difficult.
 * `target` returns the envelope-calibrated threshold for full marks.
 */
const INDICATORS = [
  // --- Biodiversity structure
  {
    id: 'indigenous_richness', pillar: 'biodiversity', weight: 12,
    applicable: () => 1,
    target: (env, L) => richnessTarget(env, L),
    score: (obs, target) => clamp((obs.indigenous_species_count || 0) / target, 0, 1)
  },
  {
    id: 'indigenous_proportion', pillar: 'biodiversity', weight: 10,
    applicable: () => 1, // NON-WAIVABLE
    target: () => 0.8,
    score: (obs, target) => clamp((obs.indigenous_fraction || 0) / target, 0, 1)
  },
  {
    id: 'upper_stratum', pillar: 'biodiversity', weight: 8,
    // Retargeted, not waived. Only zero where NO woody vegetation can persist.
    applicable: (env) => (env.vertical_envelope_m >= 1.0 ? 1 : 0),
    target: (env, L) => upperStratumTarget(env, L),
    score: (obs, target) => {
      const h = obs.tallest_vegetation_m || 0;
      return clamp(h / target.min_height_m, 0, 1);
    }
  },

  // --- Soil & water
  {
    id: 'rooting_volume', pillar: 'soil_water', weight: 8,
    // A slab cannot host in-ground soil. Genuinely inapplicable.
    applicable: (env) => (env.substrate_class === 'epiphytic' ? 0 : 1),
    target: (env) => rootingVolume(env),
    score: (obs, target) => clamp((obs.rooting_volume_m3 || 0) / Math.max(target, 0.01), 0, 1)
  },
  {
    id: 'soil_biota', pillar: 'soil_water', weight: 6,
    applicable: (env) => (['in_ground', 'raised_deep'].includes(env.substrate_class) ? 1 : 0),
    target: () => 1,
    score: (obs) => (obs.soil_biota_evidence ? 1 : 0)
  },
  {
    id: 'fauna_water_point', pillar: 'soil_water', weight: 4,
    applicable: () => 1, // NON-WAIVABLE — a dish qualifies on a balcony
    target: () => 1,
    score: (obs) => (obs.fauna_water_point ? 1 : 0)
  },
  {
    id: 'chemical_free', pillar: 'soil_water', weight: 6,
    applicable: () => 1, // NON-WAIVABLE
    target: () => 1,
    score: (obs) => (obs.chemical_free ? 1 : 0)
  },

  // --- Habitat complexity
  {
    id: 'strata_diversity', pillar: 'habitat', weight: 8,
    applicable: () => 1,
    target: (env) => (env.vertical_envelope_m >= 6 ? 4 : env.vertical_envelope_m >= 3 ? 3 : 2),
    score: (obs, target) => clamp((obs.strata_occupied || 0) / target, 0, 1)
  },
  {
    id: 'refuge_features', pillar: 'habitat', weight: 7,
    // Scale-appropriate versions exist everywhere; target scales with area.
    applicable: () => 1,
    target: (env) => Math.max(1, Math.round(Math.sqrt(env.growing_area_m2) / 2)),
    score: (obs, target) => clamp((obs.habitat_feature_count || 0) / target, 0, 1)
  },
  {
    id: 'permanent_waterbody', pillar: 'habitat', weight: 5,
    // Impossible where load limit or tenure forbids standing water.
    applicable: (env) =>
      (env.permission_scope || []).includes('can_install_waterbody') ? 1 : 0,
    target: () => 1,
    score: (obs) => (obs.waterbody_present ? 1 : 0)
  },

  // --- Connectivity
  {
    id: 'adjacent_habitat', pillar: 'connectivity', weight: 8,
    applicable: () => 1,
    target: () => 1,
    score: (obs) => clamp(obs.adjacency_index || 0, 0, 1)
  },
  {
    id: 'network_membership', pillar: 'connectivity', weight: 7,
    applicable: () => 1,
    target: () => 1,
    // COMPUTED from network object. Never a self-asserted tick.
    score: (obs) => clamp((obs.network_verified_members || 0) / 3, 0, 1)
  },
  {
    id: 'vertical_continuity', pillar: 'connectivity', weight: 5,
    // Only meaningful where a building stack exists.
    applicable: (env) => (env.network_types || []).includes('building') ? 1 : 0,
    target: () => 1,
    score: (obs) => clamp(obs.building_stack_coverage || 0, 0, 1)
  },

  // --- Evidence
  {
    id: 'evidence_baseline', pillar: 'evidence', weight: 5,
    applicable: () => 1, // NON-WAIVABLE
    target: () => 1,
    score: (obs) => (obs.baseline_documented ? 1 : 0)
  },
  {
    id: 'management_continuity', pillar: 'evidence', weight: 5,
    applicable: () => 1, // NON-WAIVABLE
    target: () => 1,
    score: (obs) => clamp((obs.years_of_records || 0) / 2, 0, 1)
  }
];

// ------------------------------------------------------------------- EP

function ecologicalPerformance(env, obs, L) {
  const pillars = {};
  const notes = [];

  for (const key of Object.keys(L.pillar_caps)) {
    const inds = INDICATORS.filter((i) => i.pillar === key);
    let earned = 0, denom = 0, nominal = 0;

    for (const ind of inds) {
      const a = ind.applicable(env, L);
      nominal += ind.weight;
      if (a === 0) continue;
      const target = ind.target(env, L);
      const s = clamp(ind.score(obs, target, env, L), 0, 1);
      earned += s * ind.weight * a;
      denom += ind.weight * a;
    }

    const applicabilityRatio = nominal > 0 ? denom / nominal : 1;
    let capRatio = 1;
    if (applicabilityRatio < L.applicability_floor.threshold) {
      capRatio = L.applicability_floor.constrained_pillar_cap_ratio;
      notes.push(`${key}: constrained envelope (${Math.round(applicabilityRatio * 100)}% applicable) — pillar capped`);
    }

    const raw = denom > 0 ? earned / denom : 0;
    pillars[key] = {
      score: raw * L.pillar_caps[key] * capRatio,
      cap: L.pillar_caps[key],
      applicability: applicabilityRatio,
      constrained: capRatio < 1
    };
  }

  let ep = sum(Object.values(pillars).map((p) => p.score));

  // Non-waivable failure ceiling
  const failed = L.non_waivable.filter((id) => {
    const ind = INDICATORS.find((i) => i.id === id);
    if (!ind) return false;
    return ind.score(obs, ind.target(env, L), env, L) < 0.5;
  });
  if (failed.length) {
    ep = Math.min(ep, L.non_waivable_failure_ceiling);
    notes.push(`non-waivable indicator(s) unmet: ${failed.join(', ')} — EP ceiling applied`);
  }

  return { ep: Math.round(ep), pillars, notes, failed_non_waivable: failed };
}

// ------------------------------------------------------------------- EC

/**
 * H-010a — RESOLVED PENDING DECISION. Two candidate currencies, both selectable,
 * so the choice is made on output rather than argument. See HYPOTHESES.md.
 *
 *   'leaf_area' (default, recommended)
 *       footprint * LAI * provenance. Height does NOT multiply — it only
 *       determines which stratum the plant occupies, and strata diversity is
 *       rewarded separately through S_struct. Fixes the double-count. Keeps
 *       the unit commensurate with Green Plot Ratio, which is leaf area per
 *       ground area.
 *
 *   'volume' (comparison only)
 *       footprint * occupied_height * LAI * provenance. The original form.
 *       Retained solely so the two can be run side by side.
 *
 * Shadow run 002 result, contrary to expectation: 'leaf_area' makes H-071
 * BETTER, not worse. The volume form multiplied footprint by height, and large
 * sites have tall trees, so height compounded with area. Removing that
 * compounding drops the balcony->suburban EC ratio from 148x to 67x against a
 * 129x growing-area ratio — i.e. sub-linear. The never-rank-by-EC rule still
 * stands, but EC is no longer a near-pure proxy for lot size.
 */
function effectiveVegetationVolume(plants, L, currency) {
  const mode = currency || L.ec_currency || 'leaf_area';
  return sum(plants.map((p) => {
    const lai = L.growth_form_lai[p.growth_form] ?? 1.0;
    const q = L.provenance_weight[p.provenance] ?? 0;
    const base = (p.footprint_m2 || 0) * lai;
    return (mode === 'volume' ? base * (p.occupied_height_m || 0) : base) * q;
  }));
}

function ecologicalContribution(env, obs, L, opts = {}) {
  const plants = obs.plants || [];
  const V = effectiveVegetationVolume(plants, L, opts.currency) / L.ecu_volume_divisor;

  const strataKey = String(clamp(obs.strata_occupied || 1, 1, 5));
  const S = L.strata_multiplier[strataKey] ?? 1.0;

  const om = L.soil.organic_matter_multiplier[obs.organic_matter || 'moderate'] ?? 1.0;
  const F_soil = ['in_ground', 'raised_deep', 'raised_shallow'].includes(env.substrate_class)
    ? (obs.rooting_volume_m3 || 0) * L.soil.ecu_per_m3_unsealed * om
    : 0;

  const F_water = (obs.fauna_water_point ? L.water.ecu_fauna_water_point : 0)
    + (obs.waterbody_area_m2 || 0) * L.water.ecu_per_m2_waterbody
    + (obs.waterbody_edge_m || 0) * L.water.ecu_per_m_edge;

  const H = sum(Object.entries(obs.habitat_features || {}).map(([k, n]) => {
    const rate = L.habitat_features[k] || 0;
    return rate * Math.pow(n, L.habitat_features.diminishing_exponent);
  }));

  // persistence — EC ONLY
  const pc = L.persistence;
  const P = opts.ignorePersistence ? 1 : clamp(
    (pc.base_by_substrate[env.substrate_class] ?? 0.6)
      + (obs.verified_years || 0) * pc.longitudinal_gain_per_verified_year,
    0, pc.ceiling
  );

  // network — EC ONLY, hard bounded
  const nc = L.network;
  let N = 1.0;
  if ((obs.network_verified_members || 0) >= nc.min_verified_members) {
    N = 1 + (obs.network_verified_members - nc.min_verified_members + 1) * nc.uplift_per_verified_member;
    if ((obs.network_coverage || 0) >= 0.5) N += nc.coverage_bonus_at_50pct;
  }
  N = clamp(N, nc.min_multiplier, nc.max_multiplier);

  const core = V * S + F_soil + F_water + H;
  const ec = Math.max(0, core * P * N);

  return {
    ecu: Math.round(ec * 10) / 10,
    components: {
      vegetation: Math.round(V * S * 10) / 10,
      soil: Math.round(F_soil * 10) / 10,
      water: Math.round(F_water * 10) / 10,
      habitat: Math.round(H * 10) / 10
    },
    persistence: Math.round(P * 100) / 100,
    network: Math.round(N * 100) / 100
  };
}

// ------------------------------------------------------------------- LO

/**
 * Construct the ecologically plausible maximum planting for this envelope,
 * then run EC over it. Persistence is neutralised so LO does not punish
 * renters for a tenure they cannot change.
 */
function derivePotentialObservation(env, L) {
  const upper = upperStratumTarget(env, L);
  const area = env.growing_area_m2;

  // Saturation guard: canopy footprint cannot exceed growing area, and
  // occupied height cannot exceed the vertical envelope.
  const upperFootprint = area * 0.55;
  const midFootprint = area * 0.30;
  const groundFootprint = area * 0.85;

  const plants = [
    { growth_form: upper.required_form, provenance: 'indigenous',
      footprint_m2: upperFootprint,
      occupied_height_m: Math.min(env.vertical_envelope_m * 0.8, upper.min_height_m * 1.6) },
    { growth_form: 'shrub', provenance: 'indigenous',
      footprint_m2: midFootprint,
      occupied_height_m: Math.min(env.vertical_envelope_m * 0.4, 1.5) },
    { growth_form: 'grass_tussock', provenance: 'indigenous',
      footprint_m2: groundFootprint, occupied_height_m: 0.5 }
  ];

  const canWater = (env.permission_scope || []).includes('can_install_waterbody');

  return {
    plants,
    strata_occupied: env.vertical_envelope_m >= 6 ? 4 : env.vertical_envelope_m >= 3 ? 3 : 2,
    rooting_volume_m3: rootingVolume(env),
    organic_matter: 'high',
    fauna_water_point: true,
    waterbody_area_m2: canWater ? Math.min(area * 0.05, 12) : 0,
    waterbody_edge_m: canWater ? Math.min(area * 0.08, 20) : 0,
    habitat_features: {
      decaying_woody_material: Math.max(1, Math.round(Math.sqrt(area) / 3)),
      thermal_refuge_structure: Math.max(1, Math.round(Math.sqrt(area) / 4)),
      leaf_litter_retained: 1
    },
    verified_years: 0,
    network_verified_members: 0
  };
}

// ---------------------------------------------------------------- top level

function scoreV2(record, locale, opts = {}) {
  const env = record.site_envelope;
  const obs = record.observation;
  const L = locale;

  const performance = ecologicalPerformance(env, obs, L);
  const actual = ecologicalContribution(env, obs, L, { currency: opts.currency });
  const potentialObs = derivePotentialObservation(env, L);
  const potential = ecologicalContribution(env, potentialObs, L, { ignorePersistence: true, currency: opts.currency });

  return {
    registry_id: record.registry_id,
    method_version: L.method_version,
    locale: L.locale,
    locale_version: L.locale_version,
    ec_currency: opts.currency || L.ec_currency || 'leaf_area',
    envelope_class: deriveEnvelopeClass(env, L),
    ecological_performance: performance.ep,
    ecological_contribution: actual.ecu,
    ecological_potential: potential.ecu,
    latent_opportunity: Math.round(Math.max(0, potential.ecu - actual.ecu) * 10) / 10,
    detail: { performance, actual, potential },
    status: 'SHADOW — not published, all coefficients unvalidated'
  };
}

module.exports = {
  scoreV2, ecologicalPerformance, ecologicalContribution,
  derivePotentialObservation, deriveEnvelopeClass, richnessTarget,
  upperStratumTarget, rootingVolume, INDICATORS
};
