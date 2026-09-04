/**
 * VIC jurisdiction adapter.
 *
 * This adapter must produce output byte-identical to the current direct EVC
 * lookup. It therefore queries the SAME service with the SAME parameters and
 * reads the SAME fields. Do not "improve" the endpoint or the field mapping as
 * part of the abstraction work — that would make the proof meaningless and
 * risk moving a live score.
 *
 * ENDPOINT: this is the exact service findmyevc.com calls in production
 * (findyourevc/assets/evc-fetch.js) and the same one assess.html calls — the
 * DEECA open-data GeoServer WFS for NV2005_EVCBCS. It is a WFS, not an ArcGIS
 * REST service: GetFeature returns every polygon in a bbox and the containing
 * polygon is chosen client-side (see wfs.js). d=0.05 matches production's bbox.
 */

import { queryPolygonWfs } from '../wfs.js';
import { contextRecord, provenance, STATUS, CAPABILITY } from '../schema.js';

export const EVC_SERVICE = 'https://opendata.maps.vic.gov.au/geoserver/wfs';
export const EVC_LAYER = 'open-data-platform:nv2005_evcbcs';
const EVC_BBOX_DEGREES = 0.05;

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
    const props = await queryPolygonWfs({
      serviceUrl: EVC_SERVICE,
      layer: EVC_LAYER,
      lat: loc.lat,
      lng: loc.lng,
      d: EVC_BBOX_DEGREES,
      groupBy: 'evc',
      fetchImpl: ctx.fetchImpl
    });

    const prov = provenance({
      authority: AUTHORITY,
      dataset: DATASET,
      dataset_version: ctx.datasetVersions?.[DATASET] ?? null,
      service_url: EVC_SERVICE,
      lookup_method: 'wfs:getfeature:point-in-polygon',
      queried_at: ctx.now(),
      jurisdiction: 'VIC'
    });

    if (!props) {
      return contextRecord({
        system: 'EVC', code: null, name: null,
        resolution: 'state', source: `DEECA ${DATASET}`,
        status: STATUS.NODATA, provenance: prov
      });
    }

    return contextRecord({
      system: 'EVC',
      code: props.evc != null ? String(props.evc) : null,
      name: props.x_evcname ?? null,
      resolution: 'state',
      source: `DEECA ${DATASET}`,
      status: STATUS.OK,
      // Bioregional Conservation Status has no national analogue. It is kept
      // verbatim under `extra` rather than being mapped onto a shared metric.
      extra: {
        bioregional_conservation_status: props.evc_bcs_desc ?? null,
        victorian_bioregion: props.bioregion ?? null,
        victorian_bioregion_code: props.bioregion_code ?? null
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
