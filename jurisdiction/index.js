/**
 * REG jurisdiction layer — public entry point.
 *
 *   The Registry understands ecological concepts.
 *   Jurisdiction adapters understand government datasets.
 *
 * Nothing above this module may name EVC, NatureKit, Vicmap, PCT or Regional
 * Ecosystem. Nothing below it may know what a Registry score is.
 */

import { resolveJurisdiction } from './resolver.js';
import { ecologicalContext, STATUS, CAPABILITY } from './schema.js';
import { vicAdapter } from './adapters/vic.js';
import { auNationalAdapter } from './adapters/au-national.js';

const ADAPTERS = {
  AU: {
    national: auNationalAdapter,
    states: {
      VIC: vicAdapter
      // NSW: nswAdapter  <- Phase 4, see adapters/nsw.js
    }
  }
};

export function capabilityMatrix() {
  const out = {};
  for (const [country, group] of Object.entries(ADAPTERS)) {
    out[`${country}-NATIONAL`] = group.national.capabilities;
    for (const [state, adapter] of Object.entries(group.states)) {
      out[`${country}-${state}`] = adapter.capabilities;
    }
  }
  return out;
}

/**
 * Resolve the full ecological context for a property.
 *
 * @param {{lat:number,lng:number}} location  PROPERTY coordinates. Never a
 *        visitor's geolocation. Callers holding private coordinates must not
 *        let them leak into the returned record — this function returns
 *        classifications only, no coordinates.
 * @param {object} opts
 * @param {function} opts.fetchImpl
 * @param {function} [opts.now]
 * @param {string}   [opts.override] force jurisdiction
 * @param {object}   [opts.datasetVersions] pinned dataset versions for provenance
 */
export async function resolveEcologicalContext(location, opts = {}) {
  const now = opts.now || (() => new Date().toISOString());
  const ctx = {
    fetchImpl: opts.fetchImpl,
    now,
    datasetVersions: opts.datasetVersions || {}
  };

  const jur = await resolveJurisdiction(location.lat, location.lng, {
    override: opts.override, fetchImpl: opts.fetchImpl, now
  });

  const jurisdictionBlock = {
    country: jur.country,
    jurisdiction: jur.jurisdiction,
    resolver_method: jur.method,
    resolver_source: jur.source
  };

  // Outside supported countries: return the jurisdiction block alone. The
  // garden still registers. Missing spatial data never blocks registration.
  if (jur.country !== 'AU') {
    return ecologicalContext({ jurisdictionBlock, fields: {}, resolved_at: now() });
  }

  const group = ADAPTERS.AU;
  const stateAdapter = jur.jurisdiction ? group.states[jur.jurisdiction] : null;

  const fields = {};

  // --- LOCAL ECOLOGICAL IDENTITY -----------------------------------------
  let original = null;
  if (stateAdapter && stateAdapter.capabilities.original_vegetation === CAPABILITY.AVAILABLE) {
    original = await stateAdapter.getOriginalVegetationContext(location, ctx);
  }

  // --- GRACEFUL FALLBACK --------------------------------------------------
  // Best available jurisdiction data -> best available national data ->
  // record the field as unavailable. Never 0, never a fabricated equivalence.
  if (!original || original.status === STATUS.NODATA) {
    const nationalOriginal =
      await group.national.getOriginalVegetationContext(location, ctx);

    if (original && original.status === STATUS.NODATA) {
      // Keep the fact that the state was asked and had no coverage.
      fields.original_vegetation_state_attempt = original;
    }
    original = nationalOriginal;
  }
  fields.original_vegetation = original;

  // --- NATIONAL ECOLOGICAL CONTEXT ---------------------------------------
  // Attaches to every Australian garden, alongside (never instead of) local
  // identity, so gardens in different states remain comparable at one level
  // without pretending their local classifications are equivalent.
  fields.bioregion = await group.national.getBioregionContext(location, ctx);

  if (original.resolution === 'state') {
    fields.national_vegetation =
      await group.national.getOriginalVegetationContext(location, ctx);
  }

  // habitat_context and canopy_context are intentionally ABSENT. No adapter
  // implements them, nothing in REG consumes them, and an empty key would
  // imply we looked. See NATIONAL-ARCHITECTURE.md, "What is deliberately not
  // being built".

  return ecologicalContext({ jurisdictionBlock, fields, resolved_at: now() });
}

export { resolveJurisdiction, STATUS, CAPABILITY };
export { toLegacyEvcResult } from './adapters/vic.js';
