/**
 * REG canonical ecological-context schema.
 *
 * Deliberately a SUPERSET of the resolver schema already locked on 15 Aug 2026
 * (system / code / name / resolution / source / status) so fmeg, fmevc and fmnp
 * remain drop-in readers. No parallel schema is introduced.
 *
 * STATUS VOCABULARY — two values only, unchanged from the locked decision:
 *   'ok'      the dataset was queried and returned a classification
 *   'nodata'  the dataset was queried and returned nothing for this point
 *
 * A capability that was NOT queried (unsupported in this jurisdiction, or not
 * yet implemented) is ABSENT from ecological_context entirely. Absence and
 * 'nodata' are different facts and must stay distinguishable:
 *
 *   key absent          -> we did not ask
 *   status: 'nodata'    -> we asked, there is no coverage here
 *   status: 'ok'        -> we asked, here is the answer
 *
 * Zero is never written for any of these. Nothing in this module can emit 0
 * as a placeholder.
 */

export const STATUS = Object.freeze({ OK: 'ok', NODATA: 'nodata' });

export const CAPABILITY = Object.freeze({
  AVAILABLE: 'available',       // implemented and wired
  INVESTIGATE: 'investigate',   // dataset may exist, not confirmed
  UNSUPPORTED: 'unsupported',   // confirmed to have no equivalent
  DELEGATED: 'delegated'        // answered by the national adapter
});

export const SCHEMA_VERSION = '1.0.0-draft';

/**
 * One ecological-context field. `provenance` is mandatory and never collapsed:
 * the canonical abstraction must not destroy the source record.
 */
export function contextRecord({
  system,          // authoritative local system name, e.g. 'EVC', 'PCT', 'Regional Ecosystem'
  code = null,     // local code as the authority writes it, as a STRING
  name = null,     // local community name, verbatim
  resolution,      // 'state' | 'national'
  source,          // human-readable authority + dataset, e.g. 'DEECA NV2005_EVCBCS'
  status,
  extra = null,    // jurisdiction-specific fields that have no national analogue
  provenance
}) {
  if (status !== STATUS.OK && status !== STATUS.NODATA) {
    throw new Error(`invalid status: ${status}`);
  }
  const rec = { system, code, name, resolution, source, status, provenance };
  if (extra) rec.extra = extra;
  return rec;
}

/**
 * Provenance block. Answers: which authority, which dataset, what version,
 * what method, when, can we reproduce it.
 */
export function provenance({
  authority,        // 'Victorian Government (DEECA)'
  dataset,          // 'NV2005_EVCBCS'
  dataset_version = null,
  service_url,      // exact endpoint queried
  lookup_method,    // 'arcgis:query:point-in-polygon' | 'arcgis:identify:raster'
  queried_at,       // ISO 8601
  jurisdiction,     // 'VIC' | 'AU'
  reproducible = true
}) {
  return {
    authority, dataset, dataset_version, service_url,
    lookup_method, queried_at, jurisdiction, reproducible
  };
}

/**
 * Assemble the ecological_context block for a garden record.
 * Fields that were never queried are omitted, not nulled.
 */
export function ecologicalContext({ jurisdictionBlock, fields, resolved_at }) {
  const ctx = {
    schema_version: SCHEMA_VERSION,
    resolved_at,
    jurisdiction: jurisdictionBlock
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue; // not asked
    ctx[key] = value;
  }
  return ctx;
}
