/**
 * Thin ArcGIS REST helpers, shared by every adapter.
 *
 * Two access patterns, matching the two service kinds in the capability matrix:
 *   queryPoint    — vector FeatureServer/MapServer /query (point-in-polygon)
 *   identifyPoint — raster/map MapServer /identify (pixel or polygon under a point)
 *
 * fetch is INJECTED (ctx.fetchImpl). Nothing here reaches the network on its own,
 * which is what lets the proof run offline and lets provenance timestamps be
 * deterministic in CI.
 *
 * queryPoint deliberately builds the SAME URL the pre-abstraction Victorian code
 * built (geometry as `lng,lat`, EPSG:4326, intersects) — output parity means the
 * same service with the same parameters, verified by the proof.
 */

/**
 * @returns {Promise<object|null>} the first feature's attributes, or null when
 *          the point falls outside all polygons (a real "no coverage" answer).
 */
export async function queryPoint({ serviceUrl, lat, lng, outFields = '*', inSR = '4326', fetchImpl }) {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR,
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'false',
    f: 'json'
  });
  const res = await fetchImpl(`${serviceUrl}/query?${params}`);
  const data = await res.json();
  const feature = data && data.features && data.features[0];
  return feature ? feature.attributes : null;
}

/**
 * @returns {Promise<Array>} the ArcGIS identify `results` array (possibly empty).
 *          Rasters return a populated array whose value may be the literal
 *          'NoData'; callers decide what that means (see au-national nvisPixel).
 */
export async function identifyPoint({ serviceUrl, lat, lng, layers = 'all', tolerance = 1, sr = '4326', fetchImpl }) {
  const half = 0.05;
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: 'esriGeometryPoint',
    sr,
    layers,
    tolerance: String(tolerance),
    mapExtent: `${lng - half},${lat - half},${lng + half},${lat + half}`,
    imageDisplay: '400,400,96',
    returnGeometry: 'false',
    f: 'json'
  });
  const res = await fetchImpl(`${serviceUrl}/identify?${params}`);
  const data = await res.json();
  return (data && data.results) || [];
}
