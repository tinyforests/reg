/**
 * PROOF: existing Victorian functionality operates through the new abstraction
 * without changing its current output.
 *
 * Runs offline against recorded-shape fixtures so it can sit in CI next to
 * test_parity.py. The fixture SHAPES follow each service's published attribute
 * table; capture live responses with tools/capture-fixtures.mjs and overwrite
 * them before this is treated as evidence about the live services.
 *
 *   node jurisdiction/test/proof.mjs
 */

import assert from 'node:assert';
import { resolveEcologicalContext, toLegacyEvcResult, STATUS } from '../index.js';
import { EVC_SERVICE } from '../adapters/vic.js';
import { NVIS_PRE_MVS_SERVICE, IBRA_SUBREGIONS_SERVICE } from '../adapters/au-national.js';

const FIXED_NOW = '2026-08-23T00:00:00.000Z';
const now = () => FIXED_NOW;

// --- fixtures ------------------------------------------------------------

// Real GeoServer WFS response shape (opendata.maps.vic.gov.au, nv1750_evcbcs —
// the pre-1750 EVC that NatureKit shows). Property names/values verbatim; the
// geometry is a small square that contains the MELBOURNE test point so the
// client-side point-in-polygon match fires on the primary (Polygon) path.
const EVC_HIT = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 'nv1750_evcbcs.fixture',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [145.08, -37.83], [145.10, -37.83], [145.10, -37.81], [145.08, -37.81], [145.08, -37.83]
      ]]
    },
    geometry_name: 'geom',
    properties: {
      scale: 100000, evc: 175, evc_bcs: 'E', bioregion_no: 5.1,
      evc_bcs_desc: 'Endangered', bioregion: 'Gippsland Plain', evc_code: '0175',
      veg_code: 'GipP0175', bioregion_code: 'GipP', x_evcname: 'Grassy Woodland',
      x_groupname: 'Lower Slopes or Hills Woodlands', x_subgroupname: 'Grassy'
    }
  }],
  totalFeatures: 1, numberReturned: 1,
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::7844' } }
};
const EVC_MISS = { type: 'FeatureCollection', features: [], totalFeatures: 0 };

const NVIS_HIT = {
  results: [{
    attributes: {
      'UniqueValue.Pixel Value': '28',
      'Raster.MVS_NAME': 'Eucalyptus woodlands with a grassy understorey'
    }
  }]
};
const NVIS_NODATA = {
  // NVIS populates the array and writes the literal string 'NoData'.
  results: [{ attributes: { 'UniqueValue.Pixel Value': 'NoData', 'Raster.MVS_NAME': '' } }]
};

const IBRA_HIT = {
  results: [{
    attributes: {
      REG_CODE_7: 'SCP',
      REG_NAME_7: 'South East Coastal Plain',
      SUB_CODE_7: 'SCP01',
      SUB_NAME_7: 'Gippsland Plain'
    }
  }]
};

function makeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    for (const [needle, body] of routes) {
      if (url.startsWith(needle)) return { json: async () => body };
    }
    throw new Error(`unrouted fetch: ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// A Melbourne garden — inside the trusted-interior box, so no boundary call.
const MELBOURNE = { lat: -37.8203, lng: 145.0867 }; // Mont Albert, approx

// --- 1. LEGACY BASELINE --------------------------------------------------
// This is the current Victorian code path, written out longhand exactly as
// findmyevc.com runs it (findyourevc/assets/evc-fetch.js): a WFS GetFeature over
// a 0.05-degree bbox, then client-side point-in-polygon over the returned
// features, reading the same four fields. The abstraction must reproduce it —
// same request, same result. Kept independent of wfs.js on purpose.
function ringContains(pt, ring) {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

async function legacyEvcLookup(loc, fetchImpl) {
  const d = 0.05;
  const bbox = `${loc.lng - d},${loc.lat - d},${loc.lng + d},${loc.lat + d},EPSG:4326`;
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: 'open-data-platform:nv1750_evcbcs',
    bbox,
    outputFormat: 'application/json'
  });
  const res = await fetchImpl(`${EVC_SERVICE}?${params}`);
  const data = await res.json();
  const features = (data && data.features) || [];
  const pt = [loc.lng, loc.lat];
  let f = features.find(ft => ft.geometry && ft.geometry.type === 'Polygon'
    && ringContains(pt, ft.geometry.coordinates[0]));
  if (!f) return null;
  return {
    evc_code: String(f.properties.evc),
    evc_name: f.properties.x_evcname,
    bcs: f.properties.evc_bcs_desc,
    bioregion: f.properties.bioregion
  };
}

const results = [];
function check(name, fn) {
  try { fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
}

// --- run -----------------------------------------------------------------

const vicRoutes = [
  [EVC_SERVICE, EVC_HIT],
  [NVIS_PRE_MVS_SERVICE, NVIS_HIT],
  [IBRA_SUBREGIONS_SERVICE, IBRA_HIT]
];

const legacyFetch = makeFetch(vicRoutes);
const legacy = await legacyEvcLookup(MELBOURNE, legacyFetch);

const newFetch = makeFetch(vicRoutes);
const ctx = await resolveEcologicalContext(MELBOURNE, { fetchImpl: newFetch, now });
const viaAbstraction = toLegacyEvcResult(ctx.original_vegetation);

check('VIC output is byte-identical through the abstraction', () => {
  assert.deepStrictEqual(viaAbstraction, legacy);
  assert.strictEqual(JSON.stringify(viaAbstraction), JSON.stringify(legacy));
});

check('VIC still queries the same endpoint with the same parameters', () => {
  const legacyEvcCall = legacyFetch.calls.find(u => u.startsWith(EVC_SERVICE));
  const newEvcCall = newFetch.calls.find(u => u.startsWith(EVC_SERVICE));
  assert.strictEqual(newEvcCall, legacyEvcCall);
});

check('jurisdiction resolved from property coordinates, not a visitor', () => {
  assert.strictEqual(ctx.jurisdiction.country, 'AU');
  assert.strictEqual(ctx.jurisdiction.jurisdiction, 'VIC');
  assert.strictEqual(ctx.jurisdiction.resolver_method, 'trusted_interior');
});

check('local identity keeps Victorian terminology verbatim', () => {
  assert.strictEqual(ctx.original_vegetation.system, 'EVC');
  assert.strictEqual(ctx.original_vegetation.code, '175');
  assert.strictEqual(ctx.original_vegetation.resolution, 'state');
  assert.strictEqual(
    ctx.original_vegetation.extra.bioregional_conservation_status, 'Endangered');
});

check('national context attaches alongside, not instead of, local identity', () => {
  assert.strictEqual(ctx.bioregion.system, 'IBRA');
  assert.strictEqual(ctx.bioregion.extra.subregion, 'Gippsland Plain');
  assert.strictEqual(ctx.national_vegetation.system, 'NVIS MVS');
  assert.strictEqual(ctx.national_vegetation.resolution, 'national');
  // and the local record is untouched by it
  assert.strictEqual(ctx.original_vegetation.system, 'EVC');
});

check('provenance survives the abstraction', () => {
  const p = ctx.original_vegetation.provenance;
  assert.strictEqual(p.authority, 'Victorian Government (DEECA)');
  assert.strictEqual(p.dataset, 'NV1750_EVCBCS');
  assert.strictEqual(p.lookup_method, 'wfs:getfeature:point-in-polygon');
  assert.strictEqual(p.service_url, EVC_SERVICE);
  assert.strictEqual(p.queried_at, FIXED_NOW);
  assert.strictEqual(p.jurisdiction, 'VIC');
});

// --- fallback ------------------------------------------------------------

const gapFetch = makeFetch([
  [EVC_SERVICE, EVC_MISS],
  [NVIS_PRE_MVS_SERVICE, NVIS_HIT],
  [IBRA_SUBREGIONS_SERVICE, IBRA_HIT]
]);
const gapCtx = await resolveEcologicalContext(MELBOURNE, { fetchImpl: gapFetch, now });

check('state gap falls back to national, correctly labelled', () => {
  assert.strictEqual(gapCtx.original_vegetation.system, 'NVIS MVS');
  assert.strictEqual(gapCtx.original_vegetation.resolution, 'national');
  assert.strictEqual(gapCtx.original_vegetation.status, STATUS.OK);
});

check('the failed state attempt is preserved, not discarded', () => {
  assert.strictEqual(gapCtx.original_vegetation_state_attempt.system, 'EVC');
  assert.strictEqual(gapCtx.original_vegetation_state_attempt.status, STATUS.NODATA);
});

// --- unbuilt jurisdiction ------------------------------------------------

const SYDNEY = { lat: -33.8688, lng: 151.2093 };
const nswFetch = makeFetch([
  ['https://geo.abs.gov.au', { features: [{ attributes: { state_name_2021: 'New South Wales' } }] }],
  [NVIS_PRE_MVS_SERVICE, NVIS_HIT],
  [IBRA_SUBREGIONS_SERVICE, IBRA_HIT]
]);
const nswCtx = await resolveEcologicalContext(SYDNEY, { fetchImpl: nswFetch, now });

check('a NSW property registers with national context before NSW is built', () => {
  assert.strictEqual(nswCtx.jurisdiction.jurisdiction, 'NSW');
  assert.strictEqual(nswCtx.jurisdiction.resolver_method, 'boundary_polygon');
  assert.strictEqual(nswCtx.original_vegetation.status, STATUS.OK);
  assert.strictEqual(nswCtx.original_vegetation.resolution, 'national');
  // no EVC anywhere near a NSW record
  assert.ok(!JSON.stringify(nswCtx).includes('EVC'));
});

// --- total absence -------------------------------------------------------

const voidFetch = makeFetch([
  ['https://geo.abs.gov.au', { features: [{ attributes: { state_name_2021: 'New South Wales' } }] }],
  [NVIS_PRE_MVS_SERVICE, NVIS_NODATA],
  [IBRA_SUBREGIONS_SERVICE, { results: [] }]
]);
const voidCtx = await resolveEcologicalContext(SYDNEY, { fetchImpl: voidFetch, now });

check('no coverage anywhere records nodata, never zero', () => {
  assert.strictEqual(voidCtx.original_vegetation.status, STATUS.NODATA);
  assert.strictEqual(voidCtx.original_vegetation.code, null);
  assert.strictEqual(voidCtx.bioregion.status, STATUS.NODATA);
  const flat = JSON.stringify(voidCtx);
  assert.ok(!/:0[,}]/.test(flat), 'a zero was written into an empty field');
});

check('capabilities never queried are absent, not nulled', () => {
  assert.ok(!('habitat_context' in voidCtx));
  assert.ok(!('canopy_context' in voidCtx));
});

// --- non-Australian ------------------------------------------------------

const SINGAPORE = { lat: 1.3521, lng: 103.8198 };
const sgCtx = await resolveEcologicalContext(SINGAPORE, { fetchImpl: makeFetch([]), now });

check('a non-Australian property still registers, with no fabricated context', () => {
  assert.strictEqual(sgCtx.jurisdiction.country, null);
  assert.ok(!('original_vegetation' in sgCtx));
  assert.ok(!('bioregion' in sgCtx));
});

// --- report --------------------------------------------------------------

let failed = 0;
for (const [state, name] of results) {
  if (state === 'FAIL') failed++;
  console.log(`${state}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
