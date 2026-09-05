/**
 * Jurisdiction resolver.
 *
 * PROPERTY COORDINATES are the only input. Visitor IP/geolocation never
 * reaches this module — there is no code path that could pass it in.
 *
 * Resolution order:
 *   1. explicit override        (manual correction / test fixtures)
 *   2. trusted interior box     (offline fast path, only for boxes provably
 *                                inside one jurisdiction)
 *   3. authoritative boundary   (ABS ASGS State & Territory polygons)
 *   4. nodata                   (never guess a border case)
 *
 * Bounding boxes for Australian states overlap heavily, so a bbox is NEVER
 * used to choose between candidates. Only boxes that lie wholly inside a
 * single jurisdiction may appear in TRUSTED_INTERIOR.
 */

// Authoritative. ABS ASGS Edition 3 (2021), WGS84 — confirmed live 23 Aug 2026.
// NOTE: ASGS Edition 4 (2026) is now published. Confirm whether geo.abs.gov.au
// exposes an ASGS2026/STE service and pin to it before this ships.
export const STATE_BOUNDARY_SERVICE =
  'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer/0/query';

// Coarse country gate. Rejects obviously-non-Australian points before any
// network call. Wide enough to include external territories.
const AU_BBOX = { west: 96.0, east: 169.0, south: -45.0, north: -8.0 };

/**
 * Boxes that are wholly inside one jurisdiction. Adding an entry here is a
 * claim that EVERY point in the box is in that jurisdiction — check it before
 * adding one. Greater Melbourne is the only entry that earns its place today,
 * and it covers every garden currently on the Registry.
 */
const TRUSTED_INTERIOR = [
  {
    state: 'VIC',
    box: { west: 144.30, east: 145.60, south: -38.50, north: -37.40 },
    note: 'Greater Melbourne — wholly within Victoria'
  }
];

const AU_STATES = new Set(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']);

function inBox(lat, lng, b) {
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

function normaliseStateName(nameOrAbbrev) {
  const map = {
    'new south wales': 'NSW',
    'victoria': 'VIC',
    'queensland': 'QLD',
    'south australia': 'SA',
    'western australia': 'WA',
    'tasmania': 'TAS',
    'northern territory': 'NT',
    'australian capital territory': 'ACT'
  };
  const key = String(nameOrAbbrev || '').trim().toLowerCase();
  if (map[key]) return map[key];
  const up = String(nameOrAbbrev || '').trim().toUpperCase();
  return AU_STATES.has(up) ? up : null;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {object} opts
 * @param {string} [opts.override]   force a jurisdiction (manual correction)
 * @param {function} [opts.fetchImpl] injected fetch, for testing and for Node
 * @returns {Promise<{country, jurisdiction, method, source, resolved_at}>}
 */
export async function resolveJurisdiction(lat, lng, opts = {}) {
  const resolved_at = (opts.now || (() => new Date().toISOString()))();

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('resolveJurisdiction requires numeric lat/lng');
  }

  if (opts.override) {
    const st = normaliseStateName(opts.override);
    if (!st) throw new Error(`unknown jurisdiction override: ${opts.override}`);
    return {
      country: 'AU', jurisdiction: st,
      method: 'override', source: 'manual', resolved_at
    };
  }

  if (!inBox(lat, lng, AU_BBOX)) {
    // Not an error. Room is left here for /sg and other country adapters.
    return {
      country: null, jurisdiction: null,
      method: 'country_gate', source: 'bbox', resolved_at
    };
  }

  for (const entry of TRUSTED_INTERIOR) {
    if (inBox(lat, lng, entry.box)) {
      return {
        country: 'AU', jurisdiction: entry.state,
        method: 'trusted_interior', source: entry.note, resolved_at
      };
    }
  }

  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) {
    return {
      country: 'AU', jurisdiction: null,
      method: 'boundary_service_unavailable', source: null, resolved_at
    };
  }

  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'state_name_2021,state_code_2021',
    returnGeometry: 'false',
    f: 'json'
  });

  let data;
  try {
    const res = await fetchImpl(`${STATE_BOUNDARY_SERVICE}?${params}`);
    data = await res.json();
  } catch (err) {
    return {
      country: 'AU', jurisdiction: null,
      method: 'boundary_service_error', source: String(err), resolved_at
    };
  }

  const feature = data && data.features && data.features[0];
  const st = feature ? normaliseStateName(feature.attributes.state_name_2021) : null;

  return {
    country: 'AU',
    jurisdiction: st,
    method: st ? 'boundary_polygon' : 'boundary_no_match',
    source: st ? 'ABS ASGS 2021 State and Territory boundaries' : null,
    resolved_at
  };
}
