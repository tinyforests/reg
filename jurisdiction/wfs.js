/**
 * Thin GeoServer WFS helper, shared by adapters whose authority publishes a
 * WFS FeatureServer rather than an ArcGIS REST service (Victoria's DEECA open
 * data platform is one).
 *
 * Unlike ArcGIS `/query`, a WFS `GetFeature` cannot do server-side
 * point-in-polygon: it returns every feature intersecting a bbox, and the
 * caller decides which polygon actually contains the point. This helper
 * reproduces, byte-for-byte, the request and the client-side matching that
 * findmyevc.com runs in production (assets/evc-fetch.js) so the abstraction is
 * output-identical to the live Victorian lookup — the same service, not an
 * equivalent one.
 *
 * fetch is INJECTED. Nothing here reaches the network on its own, which is what
 * lets the proof run offline. Dependency-free: point-in-polygon and centroid
 * are implemented here rather than pulling Turf, matching the rest of the layer.
 */

/** Ray-casting test: is [x,y] inside a single linear ring? */
function pointInRing(pt, ring) {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** A single polygon = one outer ring minus any hole rings. */
function pointInPolygon(pt, rings) {
  if (!rings || !rings.length || !pointInRing(pt, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(pt, rings[h])) return false; // in a hole
  }
  return true;
}

/** Average of every vertex across a feature's geometry (production's centroid). */
function centroidOf(geometry) {
  let pts = [];
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) for (const ring of poly) pts = pts.concat(ring);
  } else {
    for (const ring of geometry.coordinates) pts = pts.concat(ring);
  }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [cx, cy];
}

/**
 * Build the production WFS GetFeature URL. Key order and values match
 * findmyevc.com's assets/evc-fetch.js exactly (WFS 1.0.0, bbox as
 * `lon-d,lat-d,lon+d,lat+d,EPSG:4326`, GeoJSON out).
 */
export function wfsGetFeatureUrl({ serviceUrl, layer, lat, lng, d = 0.05 }) {
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d},EPSG:4326`;
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: layer,
    bbox,
    outputFormat: 'application/json'
  });
  return `${serviceUrl}?${params}`;
}

/**
 * Query a WFS layer for the feature whose polygon contains (lat,lng),
 * reproducing production's matching order:
 *   1. exact containment — Polygon features first, then MultiPolygon
 *   2. fallback — the modal value of `groupBy` across the returned features,
 *      then the nearest centroid among that group
 *
 * @returns {Promise<object|null>} the matched feature's `properties`, or null
 *          when the bbox returned no features at all (a real "no coverage"
 *          answer that the caller maps to nodata).
 */
export async function queryPolygonWfs({ serviceUrl, layer, lat, lng, d = 0.05, groupBy = null, fetchImpl }) {
  const res = await fetchImpl(wfsGetFeatureUrl({ serviceUrl, layer, lat, lng, d }));
  const data = await res.json();
  const features = (data && data.features) || [];
  if (!features.length) return null;

  const pt = [lng, lat];

  // 1a. exact containment — Polygons first
  for (const f of features) {
    if (f.geometry && f.geometry.type === 'Polygon' && pointInPolygon(pt, f.geometry.coordinates)) {
      return f.properties;
    }
  }
  // 1b. then MultiPolygons
  for (const f of features) {
    if (f.geometry && f.geometry.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) {
        if (pointInPolygon(pt, poly)) return f.properties;
      }
    }
  }

  // 2. no exact match: modal group by count, then nearest centroid within it
  if (!groupBy) return null;
  const counts = {};
  const groups = {};
  for (const f of features) {
    const key = f.properties ? f.properties[groupBy] : undefined;
    counts[key] = (counts[key] || 0) + 1;
    (groups[key] = groups[key] || []).push(f);
  }
  let topKey = null, topCount = 0;
  for (const key of Object.keys(counts)) {
    if (counts[key] > topCount) { topCount = counts[key]; topKey = key; }
  }
  const group = groups[topKey] || features;
  let best = Infinity, matched = null;
  for (const f of group) {
    try {
      const [cx, cy] = centroidOf(f.geometry);
      const dist = Math.sqrt((cx - lng) ** 2 + (cy - lat) ** 2);
      if (dist < best) { best = dist; matched = f; }
    } catch (_) { /* skip malformed geometry, as production does */ }
  }
  matched = matched || group[0] || features[0];
  return matched.properties;
}
