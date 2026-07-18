/**
 * reg-opportunities.js
 * Ecological Registry — Opportunity Engine · Gardener & Son v1.1
 *
 * Turns a garden record into a RANKED set of best next steps.
 *
 * Design principles
 * -----------------
 * 1. Truth from the score. Every opportunity's point value is computed by
 *    applying the change to a copy of the record and re-running
 *    scoreEcologicalRegistry(). Recommendations can never drift from the engine.
 * 2. Weakness-aware. Actions in the pillars furthest from their max are boosted,
 *    so the engine fixes the real bottleneck rather than the highest flat number.
 * 3. Tier-aware. It knows the next tier and its gap, and can assemble the
 *    fastest / cheapest path across the threshold.
 * 4. Monetisable. Every opportunity carries delivery_options (who does it and at
 *    what cost per path). designer_install paths are filtered out unless the
 *    garden has managed_by.type === 'designer'. Public surfaces can hide cost;
 *    internal ones show it.
 *
 * Depends on: reg-score.js (scoreEcologicalRegistry must be in scope).
 *
 * Exports (browser global + CommonJS):
 *   buildOpportunities(record, opts) -> { summary, opportunities, byPillar, path }
 *   renderOpportunities(result, mode) -> mode in 'steward'|'designer'|'enrolment'
 */

(function (root) {
  'use strict';

  /* ---- tunables ---------------------------------------------------------- */
  var WEIGHTS = {
    effort:   { quick: 1.25, moderate: 1.0, project: 0.7 }, // quick wins rank higher per point
    weakPillarBoost: 0.6,   // how hard to favour the weakest pillars (0 = ignore)
    tierProximityBonus: 4,  // added to priority for actions that help cross the next tier
    tierProximityWindow: 12 // only apply the bonus when within this many pts of next tier
  };

  var DELIVERY_PATH_LABEL = {
    diy:             'DIY',
    plants_of_place: 'Plants of Place',
    gs_install:      'G&S install',
    designer_install:'Designer install',
    tend:            'Tend',
    verification:    'Verification'
  };

  // An opportunity is 'record' if: pillar is evidence, OR it has exactly one
  // delivery option and that option is verification. Everything else is 'ecological'.
  // Public surfaces lead with ecological so nothing reads as pay-to-score.
  function groupOf(pillar, deliveryOptions) {
    if (pillar === 'evidence') return 'record';
    if (deliveryOptions.length === 1 && deliveryOptions[0].path === 'verification') return 'record';
    return 'ecological';
  }

  var PILLAR_MAX = { biodiversity: 25, soil_water: 20, habitat: 20, connectivity: 20, evidence: 15 };
  var PILLAR_LABEL = {
    biodiversity: 'Biodiversity Structure', soil_water: 'Soil & Water',
    habitat: 'Habitat Complexity', connectivity: 'Connectivity', evidence: 'Evidence & Verification'
  };

  var TIERS = [
    { min: 21, name: 'Habitat Garden' },
    { min: 41, name: 'Ecological Garden' },
    { min: 61, name: 'Registered Ecological Garden' },
    { min: 81, name: 'High Habitat Garden' },
    { min: 91, name: 'Urban Biodiversity Node' }
  ];

  /* ---- helpers ----------------------------------------------------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
  function total(record) { return scoreEcologicalRegistry(record).total; }
  function nextThreshold(val, steps) { for (var i = 0; i < steps.length; i++) if (val < steps[i]) return steps[i]; return null; }
  function nextTier(score) { for (var i = 0; i < TIERS.length; i++) if (score < TIERS[i].min) return { name: TIERS[i].name, target: TIERS[i].min, gap: TIERS[i].min - score }; return null; }

  /* ---- opportunity catalogue --------------------------------------------
   * Each rule: applies(record) -> bool, mutate(record) -> void (in place on a
   * clone), plus static metadata. `points` is filled in later from the engine.
   * delivery_options: array of { path, cost }. designer_install entries are
   * filtered out at build time unless the garden has managed_by.type==='designer'.
   * -------------------------------------------------------------------------*/
  function catalogue(record) {
    var b = record.biodiversity || {}, sw = record.soil_water || {},
        h = record.habitat || {}, c = record.connectivity || {}, e = record.evidence || {};
    var evc = record.evc || {};
    var speciesTarget = b.indigenous_species_target || 40;
    var canopyTarget = b.canopy_cover_pct_target || 50;

    var C = [];
    var add = function (o) { C.push(o); };

    /* --- Biodiversity --- */
    var spNext = nextThreshold(b.indigenous_species_current || 0, [6, 12, 20, 30]);
    if (spNext !== null && (b.indigenous_species_current || 0) < speciesTarget) {
      var addN = spNext - (b.indigenous_species_current || 0);
      add({
        id: 'species_to_' + spNext, pillar: 'biodiversity',
        label: 'Add ' + addN + ' indigenous species (to ' + spNext + ')',
        detail: 'Plant local-provenance species matched to ' + (evc.name || 'the site EVC') +
                (evc.code ? ' (' + evc.code + ')' : '') + '. Toward a target of ' + speciesTarget + '.',
        effort: 'moderate',
        delivery_options: [{ path: 'plants_of_place', cost: '$$' }],
        mutate: function (r) { r.biodiversity.indigenous_species_current = spNext; }
      });
    }
    if (!b.indigenous_dominant) {
      add({
        id: 'indigenous_dominant', pillar: 'biodiversity',
        label: 'Reach indigenous-dominant planting',
        detail: 'Shift the balance so local-indigenous species dominate the palette (~80%).',
        effort: 'project',
        delivery_options: [{ path: 'gs_install', cost: '$$' }, { path: 'designer_install', cost: '$$' }],
        mutate: function (r) { r.biodiversity.indigenous_dominant = true; }
      });
    }
    var lyNext = nextThreshold(b.structural_layers_current || 0, [2, 3, 4, 5]);
    if (lyNext !== null) {
      add({
        id: 'layers_to_' + lyNext, pillar: 'biodiversity',
        label: 'Build structural layer ' + lyNext,
        detail: 'Add the missing vertical layer (ground · shrub · sub-canopy · canopy) for ' + lyNext + '-layer structure.',
        effort: 'project',
        delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$$' }, { path: 'designer_install', cost: '$$' }],
        mutate: function (r) { r.biodiversity.structural_layers_current = lyNext; }
      });
    }
    var caNext = nextThreshold(b.canopy_cover_pct_current || 0, [5, 15, 30, 50]);
    if (caNext !== null && caNext <= canopyTarget + 5) {
      add({
        id: 'canopy_to_' + caNext, pillar: 'biodiversity',
        label: 'Grow canopy cover to ' + caNext + '%',
        detail: 'Establish canopy trees toward ' + canopyTarget + '% (long-horizon; plant now, credit compounds).',
        effort: 'project', season: 'Autumn–winter planting',
        delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$$$' }, { path: 'designer_install', cost: '$$$' }],
        mutate: function (r) { r.biodiversity.canopy_cover_pct_current = caNext; }
      });
    }

    /* --- Soil & Water --- */
    if ((sw.soil_health_score || 0) < (sw.soil_health_max || 5)) {
      add({
        id: 'soil_health_up', pillar: 'soil_water',
        label: 'Lift soil health one band',
        detail: 'Compost, mulch depth and biology program to raise the soil-function score.',
        effort: 'moderate',
        delivery_options: [{ path: 'diy', cost: '$' }, { path: 'tend', cost: '$$' }],
        mutate: function (r) { r.soil_water.soil_health_score = (sw.soil_health_score || 0) + 1; }
      });
    }
    if ((sw.water_function_score || 0) < (sw.water_function_max || 5)) {
      add({
        id: 'water_function_up', pillar: 'soil_water',
        label: 'Improve water function one band',
        detail: 'Passive water-holding — swales, basins, permeability — to slow and sink runoff.',
        effort: 'moderate',
        delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$$' }, { path: 'designer_install', cost: '$$' }],
        mutate: function (r) { r.soil_water.water_function_score = (sw.water_function_score || 0) + 1; }
      });
    }
    if (!sw.has_moisture_basin) add({ id: 'moisture_basin', pillar: 'soil_water', label: 'Install a seasonal moisture basin', detail: 'A shallow basin that holds winter water and supports frogs and insects.', effort: 'moderate', delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$$' }, { path: 'designer_install', cost: '$$' }], mutate: function (r) { r.soil_water.has_moisture_basin = true; } });
    if (!sw.has_rainwater_system) add({ id: 'rainwater', pillar: 'soil_water', label: 'Add rainwater capture', detail: 'Tank or redirect to keep the garden watered through dry spells.', effort: 'moderate', delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$$' }, { path: 'designer_install', cost: '$$' }], mutate: function (r) { r.soil_water.has_rainwater_system = true; } });
    if (!sw.has_swale) add({ id: 'swale', pillar: 'soil_water', label: 'Cut a swale on contour', detail: 'Slows and infiltrates runoff along the slope.', effort: 'moderate', delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$$' }, { path: 'designer_install', cost: '$$' }], mutate: function (r) { r.soil_water.has_swale = true; } });

    /* --- Habitat --- */
    var ndNext = nextThreshold(h.habitat_nodes || 0, [1, 3, 5]);
    if (ndNext !== null) add({ id: 'nodes_to_' + ndNext, pillar: 'habitat', label: 'Establish habitat node ' + ndNext, detail: 'Discrete refuges (log-and-rock piles, dense thickets) that concentrate shelter.', effort: 'quick', delivery_options: [{ path: 'gs_install', cost: '$' }, { path: 'designer_install', cost: '$' }], mutate: function (r) { r.habitat.habitat_nodes = ndNext; } });
    if (!h.has_embedded_logs) add({ id: 'logs', pillar: 'habitat', label: 'Embed habitat logs', detail: 'Partly-buried logs for beetles, skinks and fungi.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$' }, { path: 'designer_install', cost: '$' }], mutate: function (r) { r.habitat.has_embedded_logs = true; } });
    if (!h.has_water_feature) add({ id: 'water_feature', pillar: 'habitat', label: 'Add a small water feature', detail: 'Even a bowl or bath lifts fauna use quickly.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$' }, { path: 'designer_install', cost: '$' }], mutate: function (r) { r.habitat.has_water_feature = true; } });
    if (!h.has_rock_refuges) add({ id: 'rocks', pillar: 'habitat', label: 'Build rock refuges', detail: 'Rock stacks give reptiles thermal shelter.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '$' }, { path: 'gs_install', cost: '$' }, { path: 'designer_install', cost: '$' }], mutate: function (r) { r.habitat.has_rock_refuges = true; } });
    if (!h.has_nest_boxes) add({ id: 'nest_boxes', pillar: 'habitat', label: 'Install nest boxes', detail: 'Species-matched boxes offset the shortage of old hollows.', effort: 'quick', delivery_options: [{ path: 'gs_install', cost: '$' }, { path: 'designer_install', cost: '$' }], mutate: function (r) { r.habitat.has_nest_boxes = true; } });
    var faunaVerified = (h.fauna_sightings || []).filter(function (s) { return s.verified; }).length;
    if (faunaVerified < 1) add({ id: 'fauna_first', pillar: 'habitat', label: 'Log your first verified fauna sighting', detail: 'A dated, verified sighting activates the habitat fauna weighting.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '—' }], mutate: function (r) { r.habitat.fauna_sightings = (r.habitat.fauna_sightings || []).concat([{ verified: true }]); } });

    /* --- Connectivity --- */
    var adj = (c.adjacent_registered_gardens || []).filter(function (g) { return g.verified; }).length;
    // Only offer corridor-node confirmation where a corridor plausibly exists:
    // a nearby park, or at least one registered neighbour. An isolated garden
    // cannot be a stepping-stone, so we don't invite it to buy the points.
    var inCorridor = (c.adjacent_park && (c.park_distance_m || 9999) <= 500) || adj >= 1;
    if (!c.corridor_node_confirmed && inCorridor) add({ id: 'corridor_node', pillar: 'connectivity', label: 'Confirm corridor-node status', detail: 'A verification visit confirms the garden as a stepping-stone in the local corridor.', effort: 'moderate', delivery_options: [{ path: 'verification', cost: '$$' }], mutate: function (r) { r.connectivity.corridor_node_confirmed = true; } });
    var adjNext = nextThreshold(adj, [1, 2, 3]);
    if (adjNext !== null) add({ id: 'adjacent_' + adjNext, pillar: 'connectivity', label: (adj < 1 ? 'Register a neighbouring garden' : 'Register adjacent garden ' + adjNext), detail: 'Each registered neighbour strengthens the cluster and everyone\'s connectivity score.', effort: 'moderate', delivery_options: [{ path: 'diy', cost: '—' }], mutate: function (r) { var arr = (r.connectivity.adjacent_registered_gardens || []).slice(); arr.push({ verified: true }); r.connectivity.adjacent_registered_gardens = arr; } });

    /* --- Evidence & Verification --- */
    if (!e.has_species_list) add({ id: 'species_list', pillar: 'evidence', label: 'Publish a species list', detail: 'Document what\'s planted — the backbone of the record.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '—' }], mutate: function (r) { r.evidence.has_species_list = true; } });
    if (!e.has_photos) add({ id: 'photos', pillar: 'evidence', label: 'Add dated photos', detail: 'A simple photo series evidences change over time.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '—' }], mutate: function (r) { r.evidence.has_photos = true; } });
    if (!e.has_field_notes) add({ id: 'field_notes', pillar: 'evidence', label: 'Keep field notes', detail: 'Short observations build the garden\'s story and credibility.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '—' }], mutate: function (r) { r.evidence.has_field_notes = true; } });
    if (!e.has_fauna_record) add({ id: 'fauna_record', pillar: 'evidence', label: 'Start a fauna record', detail: 'Log birds, frogs and insects as you notice them.', effort: 'quick', delivery_options: [{ path: 'diy', cost: '—' }], mutate: function (r) { r.evidence.has_fauna_record = true; } });
    if (!e.has_professional_assessment) add({ id: 'assessment', pillar: 'evidence', label: 'Book a professional assessment', detail: 'A G&S ecological assessment adds rigour and unlocks higher verification.', effort: 'moderate', delivery_options: [{ path: 'verification', cost: '$$' }], mutate: function (r) { r.evidence.has_professional_assessment = true; } });
    var vl = e.verification_level || 'self_reported';
    var vlNext = { self_reported: 'photo_verified', photo_verified: 'site_visit', site_visit: 'gardener_and_son_verified' }[vl];
    if (vlNext) add({ id: 'verify_' + vlNext, pillar: 'evidence', label: 'Upgrade verification level', detail: 'Move from ' + vl.replace(/_/g, ' ') + ' to ' + vlNext.replace(/_/g, ' ') + '.', effort: 'moderate', delivery_options: [{ path: 'verification', cost: '$$' }], mutate: function (r) { r.evidence.verification_level = vlNext; } });

    return C;
  }

  /* ---- core -------------------------------------------------------------- */
  function buildOpportunities(record, opts) {
    opts = opts || {};
    var isDesignerGarden = !!(record.managed_by && record.managed_by.type === 'designer');
    var base = scoreEcologicalRegistry(record);
    var baseTotal = base.total;
    var tier = nextTier(baseTotal);

    // per-pillar urgency: 1 = at max, 0 = empty. Weaker pillars -> higher boost.
    var urgency = {};
    Object.keys(PILLAR_MAX).forEach(function (p) {
      var got = base.scores[p] ? base.scores[p].score : 0;
      urgency[p] = 1 - (got / PILLAR_MAX[p]); // 0..1, higher = weaker
    });

    var raw = catalogue(record);
    var opps = [];
    raw.forEach(function (o) {
      var mutated = clone(record);
      o.mutate(mutated);
      var points = total(mutated) - baseTotal;
      if (points <= 0) return; // no marginal value under the engine

      // filter delivery paths: strip designer_install unless this is a designer garden
      var deliveryOptions = o.delivery_options.filter(function (d) {
        return d.path !== 'designer_install' || isDesignerGarden;
      });

      var effortMult = WEIGHTS.effort[o.effort] || 1;
      var weakBoost = 1 + WEIGHTS.weakPillarBoost * urgency[o.pillar];
      var priority = points * effortMult * weakBoost;
      if (tier && tier.gap <= WEIGHTS.tierProximityWindow) priority += WEIGHTS.tierProximityBonus * (points / Math.max(tier.gap, 1));
      opps.push({
        id: o.id, pillar: o.pillar, pillarLabel: PILLAR_LABEL[o.pillar],
        group: groupOf(o.pillar, deliveryOptions),
        action: o.label, detail: o.detail, points: points,
        effort: o.effort,
        delivery_options: deliveryOptions,
        season: o.season || null,
        priority: Math.round(priority * 100) / 100
      });
    });
    opps.sort(function (a, b) { return b.priority - a.priority; });

    // fastest path to next tier: ecological actions first, record fallback if gap remains
    var path = [];
    if (tier) {
      var roi = function (o) { return o.points * (WEIGHTS.effort[o.effort] || 1); };
      var roiSort = function (arr) { return arr.slice().sort(function (a, b) { return roi(b) - roi(a); }); };
      var ecoOpps = roiSort(opps.filter(function (o) { return o.group === 'ecological'; }));
      var recOpps = roiSort(opps.filter(function (o) { return o.group === 'record'; }));
      var acc = 0;
      for (var i = 0; i < ecoOpps.length && acc < tier.gap; i++) { path.push(ecoOpps[i]); acc += ecoOpps[i].points; }
      for (var j = 0; j < recOpps.length && acc < tier.gap; j++) { path.push(recOpps[j]); acc += recOpps[j].points; }
    }

    var byPillar = {};
    Object.keys(PILLAR_MAX).forEach(function (p) {
      byPillar[p] = {
        label: PILLAR_LABEL[p],
        score: base.scores[p] ? base.scores[p].score : 0,
        max: PILLAR_MAX[p],
        headroom: PILLAR_MAX[p] - (base.scores[p] ? base.scores[p].score : 0),
        opportunities: opps.filter(function (o) { return o.pillar === p; })
      };
    });

    return {
      summary: {
        score: baseTotal,
        tier: (function () { for (var i = TIERS.length - 1; i >= 0; i--) if (baseTotal >= TIERS[i].min) return TIERS[i].name; return 'Basic Garden'; })(),
        nextTier: tier,
        totalPointsAvailable: opps.reduce(function (s, o) { return s + o.points; }, 0),
        pathPointsToTier: path.reduce(function (s, o) { return s + o.points; }, 0)
      },
      opportunities: opps,
      byPillar: byPillar,
      path: path
    };
  }

  /* ---- rendering (three surfaces) ---------------------------------------- */
  function deliveryLine(o) {
    return o.delivery_options.map(function (d) {
      return (DELIVERY_PATH_LABEL[d.path] || d.path) + ' ' + d.cost;
    }).join(' · ');
  }

  function renderOpportunities(result, mode) {
    mode = mode || 'steward';
    var top = result.opportunities;
    var ecological = top.filter(function (o) { return o.group === 'ecological'; });
    var record = top.filter(function (o) { return o.group === 'record'; });
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

    if (mode === 'steward') { // public profile — ecological first, no pricing
      var lead = (ecological.length ? ecological : top).slice(0, 3).map(function (o) {
        return '<div class="opp-card"><div class="opp-action">' + esc(o.action) + '</div>' +
          '<div class="opp-meta">+' + o.points + ' pts · ' + esc(deliveryLine(o)) + '</div>' +
          '<div class="opp-detail">' + esc(o.detail) + '</div></div>';
      }).join('');
      if (record.length) {
        lead += '<div class="opp-record-h">Strengthen your record</div>' +
          record.slice(0, 2).map(function (o) {
            return '<div class="opp-card opp-card--record"><div class="opp-action">' + esc(o.action) + '</div>' +
              '<div class="opp-meta">+' + o.points + ' pts · ' + esc(deliveryLine(o)) + '</div></div>';
          }).join('');
      }
      return lead;
    }

    if (mode === 'enrolment') { // end of self-enrolment — encouraging, path to next tier
      var s = result.summary, out = '';
      out += '<p class="opp-lead">Your garden scores <strong>' + s.score + '</strong> — ' + esc(s.tier) + '.';
      if (s.nextTier) out += ' You\'re <strong>' + s.nextTier.gap + ' points</strong> from ' + esc(s.nextTier.name) + '.';
      out += '</p>';
      var list = (result.path.length ? result.path : top).slice(0, 4);
      out += '<ol class="opp-steps">' + list.map(function (o) {
        return '<li><span class="opp-action">' + esc(o.action) + '</span> <span class="opp-meta">+' + o.points + ' pts</span></li>';
      }).join('') + '</ol>';
      return out;
    }

    // designer — full detail incl. cost, grouped path + per-pillar headroom
    var s2 = result.summary, out2 = '';
    out2 += '<div class="opp-summary">Score ' + s2.score + ' · ' + esc(s2.tier) +
      (s2.nextTier ? ' · ' + s2.nextTier.gap + ' to ' + esc(s2.nextTier.name) : '') +
      ' · ' + s2.totalPointsAvailable + ' pts available</div>';
    if (result.path.length) {
      out2 += '<div class="opp-path"><div class="opp-path-h">Fastest path to next tier (' + s2.pathPointsToTier + ' pts)</div>' +
        result.path.map(function (o) { return '<span class="opp-pill">' + esc(o.action) + ' +' + o.points + '</span>'; }).join('') + '</div>';
    }
    var card = function (o) {
      return '<div class="opp-card"><div class="opp-action">' + esc(o.action) + '</div>' +
        '<div class="opp-meta">+' + o.points + ' pts · ' + esc(o.pillarLabel) + ' · ' + o.effort + ' · ' + esc(deliveryLine(o)) + (o.season ? ' · ' + esc(o.season) : '') + '</div>' +
        '<div class="opp-detail">' + esc(o.detail) + '</div></div>';
    };
    out2 += '<div class="opp-group-h">Improve the garden</div>' + ecological.map(card).join('');
    if (record.length) out2 += '<div class="opp-group-h">Strengthen the record</div>' + record.map(card).join('');
    return out2;
  }

  var api = { buildOpportunities: buildOpportunities, renderOpportunities: renderOpportunities, WEIGHTS: WEIGHTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.buildOpportunities = buildOpportunities; root.renderOpportunities = renderOpportunities; root.RegOpportunities = api; }

})(typeof self !== 'undefined' ? self : this);
