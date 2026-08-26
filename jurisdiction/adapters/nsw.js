/**
 * NSW jurisdiction adapter — PHASE 4, NOT ENABLED.
 *
 * Endpoints below were confirmed reachable and public (no token) on
 * 23 Aug 2026. This file exists so the abstraction is exercised by a second,
 * structurally different provider before anyone claims it works: NSW is a
 * RASTER identify against a MapServer in EPSG:3308, where Victoria is a vector
 * query in EPSG:4283. If the interface survives that, it is a real interface.
 *
 * Register it in adapters/index.js only after:
 *   - a live identify has been run against a known Sydney address and the
 *     returned field names below have been VERIFIED (they are inferred from
 *     the raster attribute table description, not yet observed);
 *   - the pre-clearing coverage gap in Central NSW has been characterised
 *     (the authority states Central NSW pre-clearing mapping is a work in
 *     progress, so 'nodata' will be a real and reportable outcome, not a bug).
 */

import { identifyPoint } from '../arcgis.js';
import { contextRecord, provenance, STATUS, CAPABILITY } from '../schema.js';

export const SVTM_PRE_CLEARING_SERVICE =
  'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/VIS/SVTM_NSW_1750_PCT/MapServer';
const PCT_LAYER = 'all:2'; // NSW_PlantCommunityType_5m

export const nswAdapter = {
  id: 'AU-NSW',
  country: 'AU',
  jurisdiction: 'NSW',
  enabled: false,

  capabilities: {
    original_vegetation: CAPABILITY.AVAILABLE,
    current_vegetation: CAPABILITY.AVAILABLE,   // SVTM extant, same pattern
    habitat_context: CAPABILITY.INVESTIGATE,    // Biodiversity Values Map — regulatory, not a garden metric
    canopy_context: CAPABILITY.INVESTIGATE,     // Greater Sydney only, licence to confirm
    connectivity: CAPABILITY.INVESTIGATE,
    bioregion: CAPABILITY.DELEGATED,
    national_vegetation: CAPABILITY.DELEGATED
  },

  async getOriginalVegetationContext(loc, ctx) {
    const results = await identifyPoint({
      serviceUrl: SVTM_PRE_CLEARING_SERVICE, lat: loc.lat, lng: loc.lng,
      layers: PCT_LAYER, fetchImpl: ctx.fetchImpl
    });

    const prov = provenance({
      authority: 'NSW Government (DCCEEW / BioNet)',
      dataset: 'SVTM NSW 1750 PCT',
      dataset_version: ctx.datasetVersions?.['SVTM_NSW_1750_PCT'] ?? null,
      service_url: SVTM_PRE_CLEARING_SERVICE,
      lookup_method: 'arcgis:identify:raster',
      queried_at: ctx.now(),
      jurisdiction: 'NSW'
    });

    const attrs = results[0] && results[0].attributes;
    if (!attrs) {
      return contextRecord({
        system: 'Plant Community Type', code: null, name: null,
        resolution: 'state', source: 'NSW SVTM (Pre-Clearing)',
        status: STATUS.NODATA, provenance: prov
      });
    }

    return contextRecord({
      system: 'Plant Community Type',
      code: attrs.PCTID != null ? String(attrs.PCTID) : null,
      name: attrs.PCTName ?? null,
      resolution: 'state',
      source: 'NSW SVTM (Pre-Clearing)',
      status: STATUS.OK,
      // Keith formation/class are NSW-specific hierarchy levels with no
      // Victorian or Queensland equivalent. Kept, not mapped.
      extra: {
        vegetation_class: attrs.vegetationClass ?? null,
        vegetation_formation: attrs.vegetationFormation ?? null
      },
      provenance: prov
    });
  }
};
