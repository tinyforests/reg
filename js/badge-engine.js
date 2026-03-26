/**
 * badge-engine.js
 * Ecological Registry Badge Engine - Gardener & Son v1.0
 *
 * Exports:
 *   awardBadges(record)      - returns { all_badges, score_badges, verification_badges, evidence_badges }
 *   getBadgeDefinitions()    - returns Promise resolving to badge definitions object
 */

var BADGE_DEFINITIONS = {

  // Biodiversity
  indigenous_dominant: {
    name: "Indigenous Dominant",
    description: "Garden is dominated by indigenous species appropriate to EVC.",
    type: "score",
    category: "Habitat & Function"
  },
  species_rich_20: {
    name: "Species Rich",
    description: "20 or more indigenous species recorded.",
    type: "score",
    category: "Habitat & Function"
  },
  species_rich_30: {
    name: "Highly Species Rich",
    description: "30 or more indigenous species recorded.",
    type: "score",
    category: "Habitat & Function"
  },
  full_canopy: {
    name: "Canopy Forming",
    description: "30% or greater canopy cover established.",
    type: "score",
    category: "Habitat & Function"
  },
  five_layers: {
    name: "Five Layer Garden",
    description: "All five structural layers present.",
    type: "score",
    category: "Habitat & Function"
  },

  // Habitat
  habitat_builder: {
    name: "Habitat Builder",
    description: "Three or more habitat nodes installed and mapped.",
    type: "score",
    category: "Habitat & Function"
  },
  amphibian_active: {
    name: "Amphibian Active",
    description: "Verified amphibian sighting recorded in the garden.",
    type: "score",
    category: "Habitat & Function"
  },
  pollinator_rich: {
    name: "Pollinator Rich",
    description: "Three or more pollinator fauna sightings verified.",
    type: "score",
    category: "Habitat & Function"
  },
  water_wise: {
    name: "Water Wise",
    description: "Rainwater system and moisture basin both installed.",
    type: "score",
    category: "Habitat & Function"
  },

  // Connectivity
  corridor_node: {
    name: "Corridor Node",
    description: "Garden confirmed as an active ecological corridor node.",
    type: "score",
    category: "Habitat & Function"
  },
  network_connected: {
    name: "Network Connected",
    description: "Adjacent to two or more other registered gardens.",
    type: "score",
    category: "Habitat & Function"
  },

  // Verification
  gs_verified: {
    name: "G&S Verified",
    description: "Professionally assessed and verified by Gardener & Son.",
    type: "verification",
    category: "Verification"
  },
  site_visit: {
    name: "Site Visit",
    description: "On-site assessment completed by a registry assessor.",
    type: "verification",
    category: "Verification"
  },

  // Evidence
  full_record: {
    name: "Full Record",
    description: "Photos, field notes, species list, and fauna records all complete.",
    type: "evidence",
    category: "Evidence"
  },
  fauna_record: {
    name: "Fauna Record",
    description: "Verified fauna sighting recorded and documented.",
    type: "evidence",
    category: "Evidence"
  }
};

/**
 * Award badges based on a garden record.
 * Returns categorised badge ID arrays.
 */
function awardBadges(record) {
  var b  = record.biodiversity || {};
  var h  = record.habitat      || {};
  var c  = record.connectivity || {};
  var e  = record.evidence     || {};
  var sw = record.soil_water   || {};

  var score_badges        = [];
  var verification_badges = [];
  var evidence_badges     = [];

  // Biodiversity badges
  if (b.indigenous_dominant) {
    score_badges.push("indigenous_dominant");
  }
  if ((b.indigenous_species_current || 0) >= 20) {
    score_badges.push("species_rich_20");
  }
  if ((b.indigenous_species_current || 0) >= 30) {
    score_badges.push("species_rich_30");
  }
  if ((b.canopy_cover_pct_current || 0) >= 30) {
    score_badges.push("full_canopy");
  }
  if ((b.structural_layers_current || 0) >= 5) {
    score_badges.push("five_layers");
  }

  // Habitat badges
  if ((h.habitat_nodes || 0) >= 3) {
    score_badges.push("habitat_builder");
  }

  var verifiedFauna = (h.fauna_sightings || []).filter(function(s) { return s.verified; });
  if (verifiedFauna.length >= 1) {
    score_badges.push("amphibian_active");
    evidence_badges.push("fauna_record");
  }
  if (verifiedFauna.length >= 3) {
    score_badges.push("pollinator_rich");
  }

  if (sw.has_rainwater_system && sw.has_moisture_basin) {
    score_badges.push("water_wise");
  }

  // Connectivity badges
  if (c.corridor_node_confirmed) {
    score_badges.push("corridor_node");
  }
  var adjVerified = (c.adjacent_registered_gardens || []).filter(function(g) { return g.verified; }).length;
  if (adjVerified >= 2) {
    score_badges.push("network_connected");
  }

  // Verification badges
  if (e.verification_level === "gardener_and_son_verified") {
    verification_badges.push("gs_verified");
  }
  if (e.verification_level === "site_visit") {
    verification_badges.push("site_visit");
  }

  // Evidence badges
  if (e.has_photos && e.has_field_notes && e.has_species_list && e.has_fauna_record) {
    evidence_badges.push("full_record");
  }

  var all_badges = score_badges.concat(verification_badges).concat(evidence_badges);

  return {
    all_badges: all_badges,
    score_badges: score_badges,
    verification_badges: verification_badges,
    evidence_badges: evidence_badges
  };
}

/**
 * Returns badge definitions as a Promise (async-compatible for the index page).
 */
function getBadgeDefinitions() {
  return Promise.resolve(BADGE_DEFINITIONS);
}
