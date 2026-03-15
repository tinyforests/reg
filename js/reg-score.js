function scoreEcologicalRegistry(record) {
  const i = record.inputs || {};

  const habitatStructure =
    (i.ground_layer_present ? 3 : 0) +
    (i.shrub_layer_present ? 3 : 0) +
    (i.subcanopy_present ? 3 : 0) +
    (i.canopy_present ? 3 : 0) +
    ((i.habitat_logs || i.rocks || i.pond || i.mulch_present) ? 3 : 0);

  const plantDiversity =
    ((i.species_count || 0) >= 10 ? 3 : 0) +
    ((i.species_count || 0) >= 20 ? 3 : 0) +
    ((i.species_count || 0) >= 40 ? 3 : 0) +
    (i.flowering_succession ? 3 : 0) +
    (i.mixed_growth_forms ? 3 : 0);

  let indigenousPercent = 0;
  if ((i.indigenous_percent || 0) >= 70) indigenousPercent = 10;
  else if ((i.indigenous_percent || 0) >= 50) indigenousPercent = 7;
  else if ((i.indigenous_percent || 0) >= 30) indigenousPercent = 5;
  else if ((i.indigenous_percent || 0) >= 10) indigenousPercent = 3;

  const waterHydrology =
    (i.permeable_surfaces ? 2 : 0) +
    (i.rainwater_use ? 2 : 0) +
    (i.swale_or_infiltration ? 2 : 0) +
    (i.pond_or_wet_area ? 2 : 0) +
    (i.passive_irrigation ? 2 : 0);

  const soilRegeneration =
    (i.organic_matter_or_mulch ? 2 : 0) +
    (i.no_synthetic_chemicals ? 2 : 0) +
    (i.compost_or_bioinputs ? 2 : 0) +
    (i.soil_improvement_works ? 2 : 0) +
    (i.mycorrhiza_or_regen_methods ? 2 : 0);

  const connectivity =
    (i.near_park_or_remnant ? 3 : 0) +
    (i.visible_native_planting_to_street ? 3 : 0) +
    (i.pollinator_support ? 3 : 0) +
    (i.bird_habitat ? 3 : 0) +
    (i.registered_in_network ? 3 : 0);

  const stewardshipActions =
    (i.registered_garden ? 2 : 0) +
    (i.annual_update_complete ? 2 : 0) +
    (i.field_report_complete ? 2 : 0) +
    (i.habitat_additions_recorded ? 2 : 0) +
    (i.monitoring_photos_uploaded ? 2 : 0);

  const verificationMap = {
    self_registered: { score: 5, label: 'Self Registered' },
    photo_verified: { score: 8, label: 'Photo Verified' },
    site_visit: { score: 12, label: 'Site Visit Verified' },
    gardener_and_son_verified: { score: 15, label: 'Gardener & Son Verified' }
  };

  const verificationData =
    verificationMap[record.verification_level] || { score: 0, label: 'Unverified' };

  const verification = verificationData.score;

  const total =
    habitatStructure +
    plantDiversity +
    indigenousPercent +
    waterHydrology +
    soilRegeneration +
    connectivity +
    stewardshipActions +
    verification;

  let level = 'Basic Garden';
  if (total >= 91) level = 'Urban Biodiversity Node';
  else if (total >= 81) level = 'High Habitat Garden';
  else if (total >= 61) level = 'Registered Ecological Garden';
  else if (total >= 41) level = 'Ecological Garden';
  else if (total >= 21) level = 'Habitat Garden';

  const badges = [];
  const habitatLayers = [
    i.ground_layer_present,
    i.shrub_layer_present,
    i.subcanopy_present,
    i.canopy_present
  ].filter(Boolean).length;

  const soilCount = [
    i.organic_matter_or_mulch,
    i.no_synthetic_chemicals,
    i.compost_or_bioinputs,
    i.soil_improvement_works,
    i.mycorrhiza_or_regen_methods
  ].filter(Boolean).length;

  if (habitatLayers >= 3) badges.push('Habitat Builder');
  if (i.flowering_succession && i.pollinator_support) badges.push('Pollinator Garden');
  if (i.canopy_present) badges.push('Canopy Restorer');
  if (i.permeable_surfaces && (i.swale_or_infiltration || i.pond_or_wet_area || i.passive_irrigation)) badges.push('Water Sensitive');
  if ((i.indigenous_percent || 0) >= 70) badges.push('Indigenous 70+');
  if (soilCount >= 4) badges.push('Soil Regenerator');
  if (i.near_park_or_remnant && i.pollinator_support && i.bird_habitat && i.registered_in_network) badges.push('Stepping Stone Garden');
  if (['site_visit', 'gardener_and_son_verified'].includes(record.verification_level)) badges.push('Verified Garden');
  if (total >= 80) badges.push('Wildlife Node');

  const recommendations = [];
  if (!i.canopy_present) recommendations.push({ action: 'Add a canopy tree', points: 3 });
  if (!i.rainwater_use) recommendations.push({ action: 'Add rainwater capture or reuse', points: 2 });
  if ((i.indigenous_percent || 0) < 70) {
    recommendations.push({
      action: 'Increase indigenous planting to 70%+',
      points: (i.indigenous_percent || 0) >= 50 ? 3 : 5
    });
  }
  if (!i.pond_or_wet_area) recommendations.push({ action: 'Add a pond or wet habitat', points: 2 });
  if (!i.monitoring_photos_uploaded) recommendations.push({ action: 'Upload monitoring photos', points: 2 });

  recommendations.sort((a, b) => b.points - a.points);

  return {
    total,
    level,
    verificationLabel: verificationData.label,
    categories: [
      { label: 'Habitat Structure', score: habitatStructure, max: 15 },
      { label: 'Plant Diversity', score: plantDiversity, max: 15 },
      { label: 'Indigenous %', score: indigenousPercent, max: 10 },
      { label: 'Water & Hydrology', score: waterHydrology, max: 10 },
      { label: 'Soil & Regeneration', score: soilRegeneration, max: 10 },
      { label: 'Connectivity', score: connectivity, max: 15 },
      { label: 'Stewardship Actions', score: stewardshipActions, max: 10 },
      { label: 'Verification', score: verification, max: 15 }
    ],
    badges,
    recommendations
  };
}
