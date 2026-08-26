/**
 * AU national adapter.
 *
 * Two jobs:
 *   1. NATIONAL ECOLOGICAL CONTEXT — IBRA bioregion + NVIS MVS attach to every
 *      Australian garden regardless of which state adapter ran. This is the
 *      comparison layer.
 *   2. FALLBACK — where a state adapter has no coverage or is not yet built,
 *      NVIS pre-1750 MVS still gives the property an original ecological
 *      community at national resolution.
 *
 * Fallback output is never relabelled as state data. resolution: 'national'
 * travels with the record and the public profile must show it as such.
 *
 * MVS (85 subgroups) is used rather than MVG (33 groups) — the structural
 * specificity is what makes the national fallback worth showing to a steward.
 * Both services return the name inline via Raster.MVS_NAME, so no lookup join.
 */

import { identifyPoint } from '../arcgis.js';
import { contextRecord, provenance, STATUS, CAPABILITY } from '../schema.js';

// Both confirmed reachable 23 Aug 2026.
export const NVIS_PRE_MVS_SERVICE =
  'https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/NVIS_pre_mvs/MapServer';
export const IBRA_SUBREGIONS_SERVICE =
  'https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/IBRA7_Subregions/MapServer';

const DCCEEW = 'Australian Government (DCCEEW)';

/**
 * NVIS returns the literal string 'NoData' in a POPULATED results array when a
 * pixel has no coverage. Checking for an empty array here would silently write
 * a real-looking record. This is a string check, deliberately.
 */
function nvisPixel(results) {
  const r = results[0];
  if (!r) return null;
  const attrs = r.attributes || {};
  const pixel = attrs['UniqueValue.Pixel Value'] ?? attrs['Pixel Value'] ?? null;
  if (pixel == null || String(pixel).trim() === 'NoData') return null;
  const name = attrs['Raster.MVS_NAME'] ?? attrs['MVS_NAME'] ?? null;
  return { code: String(pixel), name };
}

export const auNationalAdapter = {
  id: 'AU-NATIONAL',
  country: 'AU',
  jurisdiction: 'AU',

  capabilities: {
    original_vegetation: CAPABILITY.AVAILABLE,   // as fallback only
    bioregion: CAPABILITY.AVAILABLE,
    national_vegetation: CAPABILITY.AVAILABLE,
    current_vegetation: CAPABILITY.INVESTIGATE,  // NVIS_ext_mvs exists, not wired
    habitat_context: CAPABILITY.UNSUPPORTED,
    canopy_context: CAPABILITY.INVESTIGATE,
    connectivity: CAPABILITY.UNSUPPORTED
  },

  async getOriginalVegetationContext(loc, ctx) {
    const results = await identifyPoint({
      serviceUrl: NVIS_PRE_MVS_SERVICE, lat: loc.lat, lng: loc.lng,
      layers: 'all:0', fetchImpl: ctx.fetchImpl
    });

    const prov = provenance({
      authority: DCCEEW,
      dataset: 'NVIS7_0_AUST_PRE_MVS_ALB',
      dataset_version: '7.0',
      service_url: NVIS_PRE_MVS_SERVICE,
      lookup_method: 'arcgis:identify:raster',
      queried_at: ctx.now(),
      jurisdiction: 'AU'
    });

    const hit = nvisPixel(results);
    if (!hit) {
      return contextRecord({
        system: 'NVIS MVS', code: null, name: null,
        resolution: 'national', source: 'DCCEEW NVIS 7.0 pre-1750 MVS',
        status: STATUS.NODATA, provenance: prov
      });
    }

    return contextRecord({
      system: 'NVIS MVS',
      code: hit.code,
      name: hit.name,
      resolution: 'national',
      source: 'DCCEEW NVIS 7.0 pre-1750 MVS',
      status: STATUS.OK,
      provenance: prov
    });
  },

  async getBioregionContext(loc, ctx) {
    const results = await identifyPoint({
      serviceUrl: IBRA_SUBREGIONS_SERVICE, lat: loc.lat, lng: loc.lng,
      layers: 'all:0', fetchImpl: ctx.fetchImpl
    });

    const prov = provenance({
      authority: DCCEEW,
      dataset: 'IBRA7_Subregions',
      dataset_version: '7.1',
      service_url: IBRA_SUBREGIONS_SERVICE,
      lookup_method: 'arcgis:identify:polygon',
      queried_at: ctx.now(),
      jurisdiction: 'AU'
    });

    const attrs = results[0] && results[0].attributes;
    if (!attrs) {
      return contextRecord({
        system: 'IBRA', code: null, name: null,
        resolution: 'national', source: 'DCCEEW IBRA 7.1',
        status: STATUS.NODATA, provenance: prov
      });
    }

    return contextRecord({
      system: 'IBRA',
      code: attrs.REG_CODE_7 ?? null,
      name: attrs.REG_NAME_7 ?? null,
      resolution: 'national',
      source: 'DCCEEW IBRA 7.1',
      status: STATUS.OK,
      extra: { subregion: attrs.SUB_NAME_7 ?? null, subregion_code: attrs.SUB_CODE_7 ?? null },
      provenance: prov
    });
  }
};
