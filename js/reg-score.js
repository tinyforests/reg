/**
 * reg-score.js
 * Ecological Registry Scoring Engine — Gardener & Son v1.0
 *
 * Five pillars, 100 points total:
 *   Biodiversity Structure   25 pts
 *   Soil & Water Function    20 pts
 *   Habitat Complexity       20 pts
 *   Connectivity             20 pts
 *   Evidence & Verification  15 pts
 */

function scoreEcologicalRegistry(record) {
  const scores = {
    biodiversity: scoreBiodiversity(record),
    soil_water:   scoreSoilWater(record),
    habitat:      scoreHabitat(record),
    connectivity: scoreConnectivity(record),
    evidence:     scoreEvidence(record)
  };

  const total = Object.values(scores).reduce((sum, c) => sum + c.score, 0);

  const categories = [
    { label: "Biodiversity Structure",  score: scores.biodiversity.score, max: 25, notes: scores.biodiversity.notes },
    { label: "Soil & Water Function",   score: scores.soil_water.score,   max: 20, notes: scores.soil_water.notes },
    { label: "Habitat Complexity",      score: scores.habitat.score,      max: 20, notes: scores.habitat.notes },
    { label: "Connectivity",            score: scores.connectivity.score,  max: 20, notes: scores.connectivity.notes },
    { label: "Evidence & Verification", score: scores.evidence.score,     max: 15, notes: scores.evidence.notes }
  ];

  return {
    total,
    scores,
    categories,
    rating:            ratingFromScore(total),
    nextLevel:         nextLevelFromScore(total),
    recommendations:   buildRecommendations(record, scores),
    verificationLabel: verificationLabelFromLevel(record.evidence?.verification_level),
    baselineScore:     estimateBaseline(record)
  };
}

/* ── Pillar 1: Biodiversity Structure (25 pts) ── */
function scoreBiodiversity(r) {
  const b = r.biodiversity || {};
  let score = 0; const notes = [];

  const species = b.indigenous_species_current || 0;
  if      (species >= 30) { score += 10; notes.push("30+ indigenous species"); }
  else if (species >= 20) { score += 8;  notes.push("20–29 indigenous species"); }
  else if (species >= 12) { score += 6;  notes.push("12–19 indigenous species"); }
  else if (species >= 6)  { score += 4;  notes.push("6–11 indigenous species"); }
  else if (species >= 1)  { score += 2;  notes.push("1–5 indigenous species"); }

  if (b.indigenous_dominant) { score += 4; notes.push("Indigenous dominant"); }

  const layers = b.structural_layers_current || 0;
  if      (layers >= 5) { score += 6; notes.push("5 structural layers"); }
  else if (layers >= 4) { score += 5; notes.push("4 structural layers"); }
  else if (layers >= 3) { score += 3; notes.push("3 structural layers"); }
  else if (layers >= 2) { score += 1; notes.push("2 structural layers"); }

  const canopy = b.canopy_cover_pct_current || 0;
  if      (canopy >= 50) { score += 5; notes.push("50%+ canopy"); }
  else if (canopy >= 30) { score += 4; notes.push("30–49% canopy"); }
  else if (canopy >= 15) { score += 2; notes.push("15–29% canopy"); }
  else if (canopy >= 5)  { score += 1; notes.push("5–14% canopy"); }

  return { score: Math.min(score, 25), notes };
}

/* ── Pillar 2: Soil & Water Function (20 pts) ── */
function scoreSoilWater(r) {
  const sw = r.soil_water || {};
  let score = 0; const notes = [];

  const soil = sw.soil_health_score || 0;
  score += Math.round((soil / 5) * 8);
  if (soil > 0) notes.push(`Soil health ${soil}/5`);

  const water = sw.water_function_score || 0;
  score += Math.round((water / 5) * 7);
  if (water > 0) notes.push(`Water function ${water}/5`);

  if (sw.has_rainwater_system) { score += 2; notes.push("Rainwater system"); }
  if (sw.has_moisture_basin)   { score += 2; notes.push("Moisture basin"); }
  if (sw.has_swale)            { score += 1; notes.push("Swale installed"); }

  return { score: Math.min(score, 20), notes };
}

/* ── Pillar 3: Habitat Complexity (20 pts) ── */
function scoreHabitat(r) {
  const h = r.habitat || {};
  let score = 0; const notes = [];

  const nodes = h.habitat_nodes || 0;
  if      (nodes >= 5) { score += 6; notes.push("5+ habitat nodes"); }
  else if (nodes >= 3) { score += 4; notes.push("3–4 habitat nodes"); }
  else if (nodes >= 1) { score += 2; notes.push("1–2 habitat nodes"); }

  if (h.has_embedded_logs)  { score += 3; notes.push("Embedded logs"); }
  if (h.has_rock_refuges)   { score += 2; notes.push("Rock refuges"); }
  if (h.has_water_feature)  { score += 3; notes.push("Water feature"); }
  if (h.has_nest_boxes)     { score += 2; notes.push("Nest boxes"); }

  const fauna = (h.fauna_sightings || []).filter(s => s.verified).length;
  if      (fauna >= 3) { score += 4; notes.push("3+ fauna sightings"); }
  else if (fauna >= 1) { score += 3; notes.push(`${fauna} fauna sighting${fauna > 1 ? 's' : ''}`); }

  return { score: Math.min(score, 20), notes };
}

/* ── Pillar 4: Connectivity (20 pts) ── */
function scoreConnectivity(r) {
  const c = r.connectivity || {};
  let score = 0; const notes = [];

  if (c.adjacent_park) {
    const dist = c.park_distance_m || 999;
    if      (dist <= 50)  { score += 6; notes.push("Park within 50m"); }
    else if (dist <= 150) { score += 4; notes.push("Park within 150m"); }
    else if (dist <= 300) { score += 2; notes.push("Park within 300m"); }
  }

  const adj = (c.adjacent_registered_gardens || []).filter(g => g.verified).length;
  if      (adj >= 3) { score += 6; notes.push("3+ adjacent registered gardens"); }
  else if (adj >= 2) { score += 4; notes.push("2 adjacent registered gardens"); }
  else if (adj >= 1) { score += 3; notes.push("1 adjacent registered garden"); }

  if (c.corridor_node_confirmed) { score += 5; notes.push("Corridor node confirmed"); }

  if      ((c.cluster_area_ha || 0) >= 2) { score += 3; notes.push(`${c.cluster_area_ha}ha cluster`); }
  else if ((c.cluster_area_ha || 0) >= 1) { score += 1; notes.push("Cluster forming"); }

  return { score: Math.min(score, 20), notes };
}

/* ── Pillar 5: Evidence & Verification (15 pts) ── */
function scoreEvidence(r) {
  const e = r.evidence || {};
  let score = 0; const notes = [];

  if (e.has_photos)                { score += 2; notes.push("Photos documented"); }
  if (e.has_field_notes)           { score += 2; notes.push("Field notes recorded"); }
  if (e.has_species_list)          { score += 2; notes.push("Species list complete"); }
  if (e.has_fauna_record)          { score += 2; notes.push("Fauna record included"); }
  if (e.has_professional_assessment) { score += 3; notes.push("Professional assessment"); }

  const vl = e.verification_level || '';
  if      (vl === 'gardener_and_son_verified') { score += 4; notes.push("G&S Verified"); }
  else if (vl === 'site_visit')                { score += 3; notes.push("Site visit verified"); }
  else if (vl === 'photo_verified')            { score += 1; notes.push("Photo verified"); }

  return { score: Math.min(score, 15), notes };
}

/* ── Helpers ── */

function ratingFromScore(score) {
  if (score >= 91) return "Urban Biodiversity Node";
  if (score >= 81) return "High Habitat Garden";
  if (score >= 61) return "Registered Ecological Garden";
  if (score >= 41) return "Ecological Garden";
  if (score >= 21) return "Habitat Garden";
  return "Basic Garden";
}

function nextLevelFromScore(score) {
  const levels = [
    { min: 91, name: "Urban Biodiversity Node",     benefits: "Maximum ecological recognition and network leadership status." },
    { min: 81, name: "High Habitat Garden",          benefits: "Advanced habitat verification and corridor-node recognition." },
    { min: 61, name: "Registered Ecological Garden", benefits: "Full registry benefits and ecological infrastructure status." },
    { min: 41, name: "Ecological Garden",            benefits: "Recognised ecological function and habitat contribution." },
    { min: 21, name: "Habitat Garden",               benefits: "Basic habitat recognition and scoring system access." },
    { min: 0,  name: "Basic Garden",                 benefits: "Entry level — opportunity for ecological development." }
  ];
  for (const level of levels) {
    if (score < level.min) {
      return { name: level.name, target: level.min, gap: level.min - score, progress: Math.round((score / level.min) * 100), benefits: level.benefits };
    }
  }
  return { name: "Maximum Level Achieved", target: 100, gap: 0, progress: 100, benefits: "Highest level achieved." };
}

function verificationLabelFromLevel(level) {
  return { gardener_and_son_verified: "G&S Verified", site_visit: "Site Visit", photo_verified: "Photo Verified", self_reported: "Self Reported" }[level] || "Unverified";
}

function estimateBaseline(record) {
  const b = record.biodiversity || {};
  const sw = record.soil_water || {};
  const h = record.habitat || {};
  const baselineRecord = {
    ...record,
    biodiversity: { ...b, indigenous_species_current: b.indigenous_species_baseline || 0, structural_layers_current: b.structural_layers_baseline || 0, canopy_cover_pct_current: b.canopy_cover_pct_baseline || 0, indigenous_dominant: false },
    soil_water:   { ...sw, soil_health_score: sw.soil_health_baseline || 0, water_function_score: sw.water_function_baseline || 0, has_rainwater_system: false, has_moisture_basin: false, has_swale: false },
    habitat:      { ...h, habitat_nodes: h.habitat_nodes_baseline || 0, has_embedded_logs: false, has_rock_refuges: false, has_water_feature: false, has_nest_boxes: false, fauna_sightings: [] },
    connectivity: { ...record.connectivity, corridor_node_confirmed: false, adjacent_registered_gardens: [] },
    evidence:     { has_photos: false, has_field_notes: false, has_professional_assessment: false, has_fauna_record: false, has_species_list: false, verification_level: 'self_reported' }
  };
  return scoreEcologicalRegistry(baselineRecord).total;
}

function buildRecommendations(record, scores) {
  const recs = [];
  const sw = record.soil_water || {};
  const h  = record.habitat || {};
  const b  = record.biodiversity || {};
  const c  = record.connectivity || {};

  if (!sw.has_moisture_basin)    recs.push({ action: "Install seasonal moisture basin",          points: 6 });
  if (!h.has_water_feature)      recs.push({ action: "Add a small water feature",                points: 3 });
  if (!sw.has_rainwater_system)  recs.push({ action: "Add rainwater collection system",          points: 2 });
  if (!h.has_rock_refuges)       recs.push({ action: "Add rock refuge zones",                    points: 2 });
  if (!h.has_nest_boxes)         recs.push({ action: "Install nest boxes",                       points: 2 });

  const gap = (b.indigenous_species_target || 40) - (b.indigenous_species_current || 0);
  if (gap > 0) recs.push({ action: `Add ${Math.min(gap, 5)} more indigenous species`, points: Math.min(gap, 4) });

  const adjCount = (c.adjacent_registered_gardens || []).length;
  if (adjCount < 3) recs.push({ action: "Encourage adjacent gardens to register", points: adjCount < 1 ? 3 : 1 });

  return recs.sort((a, b) => b.points - a.points).slice(0, 5);
}
