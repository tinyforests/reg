/**
 * VIC jurisdiction adapter.
 *
 * This adapter must produce output byte-identical to the current direct EVC
 * lookup. It therefore queries the SAME service with the SAME parameters and
 * reads the SAME fields. Do not "improve" the endpoint or the field mapping as
 * part of the abstraction work — that would make the proof meaningless and
 * risk moving a live score.
 *
 * ACTION BEFORE MERGE: set EVC_SERVICE to whatever findmyevc.com is calling in
 * production today. The value below is the DEECA NV2005_EVCBCS layer confirmed
 * reachable on 23 Aug 2026, but the live tool's exact endpoint is the one that
 * matters for output parity.
 */

import { queryPoint } from '../arcgis.js';
import { contextRecord, provenance, STATUS, CAPABILITY } from '../schema.js';

export const EVC_SERVICE =
  'https://starmaps.biodiversity.vic.gov.au/arcgis/rest/services/star_csdl/MapServer/27';

const DATASET = 'NV2005_EVCBCS';
const AUTHORITY = 'Victorian Government (DEECA)';

export const vicAdapter = {
  id: 'AU-VIC',
  country: 'AU',
  jurisdiction: 'VIC',

  capabilities: {
    original_vegetation: CAPABILITY.AVAILABLE,
    current_vegetation: CAPABILITY.INVESTIGATE,
    habitat_context: CAPABILITY.INVESTIGATE,
    canopy_context: CAPABILITY.INVESTIGATE,
    connectivity: CAPABILITY.UNSUPPORTED,
    bioregion: CAPABILITY.DELEGATED,
    national_vegetation: CAPABILITY.DELEGATED
  },

  /**
   * EVC is Victoria's implementation of ORIGINAL ECOLOGICAL COMMUNITY.
   * The Registry stores the concept; the record keeps the Victorian words.
   */
  async getOriginalVegetationContext(loc, ctx) {
    const attrs = await queryPoint({
      serviceUrl: EVC_SERVICE,
      lat: loc.lat,
      lng: loc.lng,
      outFields: 'X_EVCNAME,EVC,EVC_BCS_DESC,BIOREGION',
      fetchImpl: ctx.fetchImpl
    });

    const prov = provenance({
      authority: AUTHORITY,
      dataset: DATASET,
      dataset_version: ctx.datasetVersions?.[DATASET] ?? null,
      service_url: EVC_SERVICE,
      lookup_method: 'arcgis:query:point-in-polygon',
      queried_at: ctx.now(),
      jurisdiction: 'VIC'
    });

    if (!attrs) {
      return contextRecord({
        system: 'EVC', code: null, name: null,
        resolution: 'state', source: `DEECA ${DATASET}`,
        status: STATUS.NODATA, provenance: prov
      });
    }

    return contextRecord({
      system: 'EVC',
      code: attrs.EVC != null ? String(attrs.EVC) : null,
      name: attrs.X_EVCNAME ?? null,
      resolution: 'state',
      source: `DEECA ${DATASET}`,
      status: STATUS.OK,
      // Bioregional Conservation Status has no national analogue. It is kept
      // verbatim under `extra` rather than being mapped onto a shared metric.
      extra: {
        bioregional_conservation_status: attrs.EVC_BCS_DESC ?? null,
        victorian_bioregion: attrs.BIOREGION ?? null
      },
      provenance: prov
    });
  }
};

/**
 * Legacy projection. Emits the exact shape the current Victorian code path
 * returns, so existing callers (fmevc, fmeg, assess.html, sync_registry.py's
 * EVC field) can read the new record without changing a line.
 */
export function toLegacyEvcResult(record) {
  if (!record || record.status !== STATUS.OK) return null;
  return {
    evc_code: record.code,
    evc_name: record.name,
    bcs: record.extra?.bioregional_conservation_status ?? null,
    bioregion: record.extra?.victorian_bioregion ?? null
  };
}
