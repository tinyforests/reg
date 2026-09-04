/**
 * Capture live responses from the confirmed endpoints so the proof harness
 * runs against real payloads rather than published-shape fixtures.
 *
 *   node tools/capture-fixtures.mjs -37.8203 145.0867
 *
 * Prints raw JSON per service. Paste into jurisdiction/test/proof.mjs, or
 * redirect to files and import them. Run this before treating the proof as
 * evidence about the live services — in particular the NSW field names in
 * adapters/nsw.js are inferred from the raster attribute table description
 * and have not been observed.
 */

import { EVC_SERVICE, EVC_LAYER } from '../jurisdiction/adapters/vic.js';
import { wfsGetFeatureUrl } from '../jurisdiction/wfs.js';
import {
  NVIS_PRE_MVS_SERVICE, IBRA_SUBREGIONS_SERVICE
} from '../jurisdiction/adapters/au-national.js';
import { SVTM_PRE_CLEARING_SERVICE } from '../jurisdiction/adapters/nsw.js';
import { STATE_BOUNDARY_SERVICE } from '../jurisdiction/resolver.js';

const [lat, lng] = process.argv.slice(2).map(Number);
if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  console.error('usage: node tools/capture-fixtures.mjs <lat> <lng>');
  process.exit(1);
}

const q = (extra) => new URLSearchParams({
  geometry: `${lng},${lat}`,
  geometryType: 'esriGeometryPoint',
  returnGeometry: 'false',
  f: 'json',
  ...extra
});

const targets = [
  ['ABS state boundary', `${STATE_BOUNDARY_SERVICE}?${q({
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'STE_NAME21,STE_CODE21'
  })}`],
  // VIC EVC is a GeoServer WFS (GetFeature + bbox), not an ArcGIS /query.
  ['VIC EVC (NV2005_EVCBCS)', wfsGetFeatureUrl({ serviceUrl: EVC_SERVICE, layer: EVC_LAYER, lat, lng })],
  ['NVIS 7.0 pre-1750 MVS', `${NVIS_PRE_MVS_SERVICE}/identify?${q({
    sr: '4326', layers: 'all:0', tolerance: '1',
    mapExtent: `${lng - 0.001},${lat - 0.001},${lng + 0.001},${lat + 0.001}`,
    imageDisplay: '400,400,96'
  })}`],
  ['IBRA 7.1 subregions', `${IBRA_SUBREGIONS_SERVICE}/identify?${q({
    sr: '4326', layers: 'all:0', tolerance: '1',
    mapExtent: `${lng - 0.001},${lat - 0.001},${lng + 0.001},${lat + 0.001}`,
    imageDisplay: '400,400,96'
  })}`],
  ['NSW SVTM 1750 PCT', `${SVTM_PRE_CLEARING_SERVICE}/identify?${q({
    sr: '4326', layers: 'all:2', tolerance: '1',
    mapExtent: `${lng - 0.001},${lat - 0.001},${lng + 0.001},${lat + 0.001}`,
    imageDisplay: '400,400,96'
  })}`]
];

for (const [name, url] of targets) {
  process.stdout.write(`\n=== ${name} ===\n${url}\n`);
  try {
    const res = await fetch(url);
    const text = await res.text();
    process.stdout.write(`HTTP ${res.status}\n${text.slice(0, 4000)}\n`);
  } catch (err) {
    process.stdout.write(`ERROR ${err.message}\n`);
  }
}
