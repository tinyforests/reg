"""
sync_registry.py
Regenerates derived fields in data/registry.json from each garden's
canonical input file, scored through the Python engine (parity-tested
against js/reg-score.js via test_parity.py).

Principles:
  - Inputs are truth, score is consequence. Every garden's score is
    recomputed from its data_file on every run.
  - No stored aggregates. This script strips the statistics,
    leaderboard, and network blocks if present; all public aggregates
    are computed client-side from the gardens array.
  - Gardens with status "Design Proposal" are held at score 0 until
    installation inputs exist.
  - Gardens flagged demo (in their input file or registry entry) are
    marked demo: true so public surfaces can exclude them.

Workflow (per studio convention): writes to /tmp first, validates
round-trip JSON, then copies into data/.

Usage:
  python scripts/sync_registry.py           # sync and write
  python scripts/sync_registry.py --check   # report drift, write nothing
"""

import hashlib
import hmac
import json
import math
import os
import shutil
import struct
import sys
import time
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(REPO_ROOT, 'data', 'registry.json')
TMP_OUT = '/tmp/registry.sync.json'
PRIVATE_COORDS = os.path.join(REPO_ROOT, 'data', 'private', 'coords.json')
APPS_SCRIPT_URL = (
    'https://script.google.com/macros/s/'
    'AKfycbywnSUukawAaCJ0JTSo6bowC0TWqGUPtclsvs6bHWglvzp4qtczulyeeFyKHqTt8HR_/exec'
)


def _fetch_sheet_coords(admin_token):
    """Pull precise coords from the Apps Script sheet (Garden Coords + Submissions).
    Returns a dict of {garden_id: {lat, lng, address}} or raises on failure."""
    qs = urllib.parse.urlencode({'action': 'get_all_coords', 'admin_token': admin_token})
    url = APPS_SCRIPT_URL + '?' + qs
    req = urllib.request.Request(url, headers={'User-Agent': 'sync_registry/1.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())
    if not data.get('ok'):
        raise RuntimeError(data.get('error', 'Apps Script returned ok:false'))
    return data['coords']


def _load_private_coords():
    """Load garden_id → {lat, lng} from the git-ignored private coords file.
    Aborts loudly if the file or the ER_COORD_SEED env var are missing."""
    seed = os.environ.get('ER_COORD_SEED', '').strip()
    if not seed:
        sys.exit(
            "\nERROR: ER_COORD_SEED environment variable is not set.\n"
            "Export it before running sync_registry.py:\n"
            "  export ER_COORD_SEED=<your-secret-seed>\n"
            "The seed is stored outside the repo — check your team password manager.\n"
        )
    if not os.path.exists(PRIVATE_COORDS):
        sys.exit(
            "\nERROR: data/private/coords.json not found.\n"
            "This file is git-ignored and must be present locally.\n"
            "Recover it from your secure backup (password manager / private drive).\n"
        )
    with open(PRIVATE_COORDS) as f:
        return json.load(f), seed


def _fuzz_coords(lat, lng, garden_id, seed):
    """Derive a deterministic ~250 m display offset from a private seed + garden_id.
    Uses HMAC-SHA256 so the offset cannot be reconstructed from the public JS or JSON.
    Returns (display_lat, display_lng) rounded to 4 dp (≈11 m precision)."""
    digest = hmac.new(seed.encode(), garden_id.encode(), hashlib.sha256).digest()
    dlat = (struct.unpack('>H', digest[0:2])[0] / 65535 - 0.5) * 0.005  # ±~278 m
    dlng = (struct.unpack('>H', digest[2:4])[0] / 65535 - 0.5) * 0.006  # ±~250 m at -37°
    return round(lat + dlat, 4), round(lng + dlng, 4)


def _sanitise_connectivity(record, private_coords, seed):
    """Replace lat/lng with pre-fuzzed display_lat/display_lng in connectivity block.
    Also sanitises adjacent_registered_gardens entries the same way.
    Modifies record in-place; returns record."""
    c = record.get('connectivity')
    if not c:
        return record
    gid = record.get('garden_id', '')

    # Primary garden coordinates
    prec = private_coords.get(gid)
    if prec:
        dlat, dlng = _fuzz_coords(prec['lat'], prec['lng'], gid, seed)
        c['display_lat'] = dlat
        c['display_lng'] = dlng
    c.pop('lat', None)
    c.pop('lng', None)

    # Adjacent gardens: fuzz each neighbour's coords too
    for adj in c.get('adjacent_registered_gardens') or []:
        adj_gid = adj.get('garden_id') or adj.get('id', '')
        adj_prec = private_coords.get(adj_gid)
        if adj_prec:
            adlat, adlng = _fuzz_coords(adj_prec['lat'], adj_prec['lng'], adj_gid, seed)
            adj['display_lat'] = adlat
            adj['display_lng'] = adlng
        adj.pop('lat', None)
        adj.pop('lng', None)

    return record

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reg_score import score_ecological_registry  # noqa: E402

# Mirrors ratingFromScore() in js/reg-score.js — keep in lockstep.
RATING_BANDS = [
    (91, "Urban Biodiversity Node"),
    (81, "High Habitat Garden"),
    (61, "Registered Ecological Garden"),
    (41, "Ecological Garden"),
    (21, "Habitat Garden"),
    (0,  "Basic Garden"),
]

# Statuses whose gardens are documented but not yet installed.
PRE_INSTALL_STATUSES = {"Design Proposal"}

# Statuses whose gardens must not be awarded badges.
# Provisional gardens have unverified inputs -- no badge until assessment complete.
NO_BADGE_STATUSES = {"Design Proposal", "Provisional"}

# Blocks of stored derived data that must not live in registry.json.
FORBIDDEN_BLOCKS = ("statistics", "leaderboard", "network")


def rating_from_score(score):
    for floor, name in RATING_BANDS:
        if score >= floor:
            return name
    return "Basic Garden"


def rating_object(score):
    """Full rating object matching the registry schema:
    { current, next, points_to_next }."""
    current = rating_from_score(score)
    ascending = sorted(RATING_BANDS)  # (floor, name) low -> high
    for floor, name in ascending:
        if floor > score:
            return {"current": current, "next": name,
                    "points_to_next": floor - score}
    return {"current": current, "next": None, "points_to_next": 0}


def award_badges(record):
    """Python port of awardBadges() in js/badge-engine.js.
    Returns a list of badge IDs in the same order as the JS engine.
    Keep in lockstep with badge-engine.js — if the JS changes, update here."""
    b  = record.get('biodiversity') or {}
    h  = record.get('habitat')      or {}
    c  = record.get('connectivity') or {}
    e  = record.get('evidence')     or {}
    sw = record.get('soil_water')   or {}

    score_badges        = []
    verification_badges = []
    evidence_badges     = []

    if b.get('indigenous_dominant'):
        score_badges.append('indigenous_dominant')
    if (b.get('indigenous_species_current') or 0) >= 20:
        score_badges.append('species_rich_20')
    if (b.get('indigenous_species_current') or 0) >= 30:
        score_badges.append('species_rich_30')
    if (b.get('canopy_cover_pct_current') or 0) >= 30:
        score_badges.append('full_canopy')
    if (b.get('structural_layers_current') or 0) >= 5:
        score_badges.append('five_layers')

    if (h.get('habitat_nodes') or 0) >= 3:
        score_badges.append('habitat_builder')

    verified_fauna = [s for s in (h.get('fauna_sightings') or []) if s.get('verified')]
    if len(verified_fauna) >= 1:
        score_badges.append('amphibian_active')
        evidence_badges.append('fauna_record')
    if len(verified_fauna) >= 3:
        score_badges.append('pollinator_rich')

    if sw.get('has_rainwater_system') and sw.get('has_moisture_basin'):
        score_badges.append('water_wise')

    if c.get('corridor_node_confirmed'):
        score_badges.append('corridor_node')
    adj_verified = len([g for g in (c.get('adjacent_registered_gardens') or []) if g.get('verified')])
    if adj_verified >= 2:
        score_badges.append('network_connected')

    if e.get('verification_level') == 'gardener_and_son_verified':
        verification_badges.append('gs_verified')
    if e.get('verification_level') == 'site_visit':
        verification_badges.append('site_visit_badge')

    if (e.get('has_photos') and e.get('has_field_notes') and
            e.get('has_species_list') and e.get('has_fauna_record')):
        evidence_badges.append('full_record')

    return score_badges + verification_badges + evidence_badges


ADJACENCY_RADIUS_M = 500  # gardens within this distance are considered adjacent


def _haversine_m(lat1, lng1, lat2, lng2):
    """Great-circle distance in metres between two WGS-84 points."""
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lng2 - lng1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_adjacency(coord_index, name_index=None):
    """Given {garden_id: (lat, lng, verified)}, return {garden_id: [neighbour_dict, ...]}.
    Neighbour dicts include lat/lng for internal scoring only — call _sanitise_connectivity()
    before writing any record to disk so precise coords never reach the public JSON."""
    ids = list(coord_index.keys())
    adjacency = {gid: [] for gid in ids}
    name_index = name_index or {}
    for i, a in enumerate(ids):
        lat_a, lng_a, _ = coord_index[a]
        for b in ids[i + 1:]:
            lat_b, lng_b, verified_b = coord_index[b]
            dist = _haversine_m(lat_a, lng_a, lat_b, lng_b)
            if dist <= ADJACENCY_RADIUS_M:
                _, _, verified_a = coord_index[a]
                adjacency[a].append({"id": b, "garden_id": b,
                                     "name": name_index.get(b, b),
                                     "lat": lat_b, "lng": lng_b,
                                     "verified": verified_b,
                                     "distance_m": int(dist)})
                adjacency[b].append({"id": a, "garden_id": a,
                                     "name": name_index.get(a, a),
                                     "lat": lat_a, "lng": lng_a,
                                     "verified": verified_a,
                                     "distance_m": int(dist)})
    return adjacency


_OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
_PARK_RADIUS_M = 600
_PARK_TAGS = [
    'way["leisure"="park"]',
    'way["leisure"="nature_reserve"]',
    'way["leisure"="garden"]["access"!="private"]',
    'way["landuse"="grass"]',
    'way["landuse"="meadow"]',
    'relation["leisure"="park"]',
    'relation["leisure"="nature_reserve"]',
]


def resolve_nearest_park(lat, lng):
    """Query Overpass for the nearest greenspace within _PARK_RADIUS_M metres.
    Returns (name, park_lat, park_lng, distance_m) or None if not found."""
    tag_block = ''.join(
        '  %s(around:%d,%.6f,%.6f);\n' % (tag, _PARK_RADIUS_M, lat, lng)
        for tag in _PARK_TAGS
    )
    query = '[out:json][timeout:15];\n(\n%s);\nout center tags;' % tag_block
    try:
        data = urllib.parse.urlencode({'data': query}).encode()
        req  = urllib.request.Request(_OVERPASS_URL, data=data,
                                      headers={'User-Agent': 'ecological-registry/1.0'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read())
    except Exception as e:
        print("  WARN park lookup failed: %s" % e)
        return None

    best_dist, best = float('inf'), None
    for el in result.get('elements', []):
        c = el.get('center') or {}
        clat, clng = c.get('lat'), c.get('lon')
        if clat is None or clng is None:
            continue
        d = _haversine_m(lat, lng, clat, clng)
        if d < best_dist:
            best_dist, best = d, (el.get('tags', {}).get('name') or '', clat, clng)

    if best is None:
        return None
    name, plat, plng = best
    return (name or 'Unnamed park', round(plat, 6), round(plng, 6), int(best_dist))


def sync(check_only=False):
    # Load private coords + seed — fails loudly if either is missing.
    private_coords, coord_seed = _load_private_coords()

    # If ER_ADMIN_TOKEN is set, pull fresh geocoded coords from the Apps Script
    # sheet and merge into private_coords (sheet takes precedence over local file).
    admin_token = os.environ.get('ER_ADMIN_TOKEN', '').strip()
    if admin_token:
        try:
            sheet_coords = _fetch_sheet_coords(admin_token)
            updated = 0
            for gid, entry in sheet_coords.items():
                slat = float(entry.get('lat', 0))
                slng = float(entry.get('lng', 0))
                if not slat or not slng:
                    continue
                existing = private_coords.get(gid, {})
                if existing.get('lat') != slat or existing.get('lng') != slng:
                    merged = dict(existing)
                    merged['lat'] = slat
                    merged['lng'] = slng
                    if entry.get('address'):
                        merged['address'] = entry['address']
                    private_coords[gid] = merged
                    updated += 1
            if updated and not check_only:
                with open(PRIVATE_COORDS, 'w') as f:
                    json.dump(private_coords, f, indent=2)
                    f.write('\n')
                print("Synced %d coord(s) from Apps Script sheet → coords.json" % updated)
        except Exception as e:
            print("WARN: could not fetch coords from sheet: %s" % e)

    with open(REGISTRY) as f:
        registry = json.load(f)

    changes = []

    for block in FORBIDDEN_BLOCKS:
        if block in registry:
            changes.append("removed stored derived block: %s" % block)
            del registry[block]

    # Pre-pass: absorb any freshly geocoded coords from data files into coords.json.
    # If a data file has connectivity.lat + connectivity.lng (set via the assess form),
    # those precise values take precedence over whatever is currently in coords.json.
    coords_updated = False
    for g in registry['gardens']:
        gid = g.get('garden_id', '?')
        data_file = (g.get('data_file') or '').lstrip('/')
        path = os.path.join(REPO_ROOT, data_file)
        if not os.path.exists(path):
            continue
        with open(path) as f:
            rec = json.load(f)
        c = rec.get('connectivity') or {}
        raw_lat = c.get('lat')
        raw_lng = c.get('lng')
        if raw_lat is not None and raw_lng is not None:
            new_lat = float(raw_lat)
            new_lng = float(raw_lng)
            existing = private_coords.get(gid, {})
            if existing.get('lat') != new_lat or existing.get('lng') != new_lng:
                entry = dict(existing)
                entry['lat'] = new_lat
                entry['lng'] = new_lng
                private_coords[gid] = entry
                changes.append("%s: absorbed geocoded coords (%.6f, %.6f) into coords.json" % (
                    gid, new_lat, new_lng))
                coords_updated = True
    if coords_updated and not check_only:
        with open(PRIVATE_COORDS, 'w') as f:
            json.dump(private_coords, f, indent=2)
            f.write('\n')
        print("Updated data/private/coords.json with new geocoded coordinates.")

    # Pass 1: build coordinate index for adjacency computation.
    # Source of truth is the private coords file — never the public data/*.json.
    # Format: {garden_id: (lat, lng, is_verified)}
    coord_index = {}
    _records = {}  # cache loaded records to avoid re-reading in pass 2
    for g in registry['gardens']:
        gid = g.get('garden_id', '?')
        data_file = (g.get('data_file') or '').lstrip('/')
        path = os.path.join(REPO_ROOT, data_file)
        if not os.path.exists(path):
            continue
        with open(path) as f:
            record = json.load(f)
        _records[gid] = record
        prec = private_coords.get(gid)
        if prec:
            is_verified = g.get('status') not in PRE_INSTALL_STATUSES | {'Provisional'}
            coord_index[gid] = (float(prec['lat']), float(prec['lng']), is_verified)

    name_index = {g.get('garden_id'): g.get('garden_name', '')
                  for g in registry['gardens'] if g.get('garden_id')}
    adjacency = build_adjacency(coord_index, name_index)

    for g in registry['gardens']:
        gid = g.get('garden_id', '?')
        data_file = (g.get('data_file') or '').lstrip('/')
        path = os.path.join(REPO_ROOT, data_file)
        if not os.path.exists(path):
            print("WARN %s: missing data_file %s — skipped" % (gid, data_file))
            continue
        record = _records.get(gid)
        if record is None:
            with open(path) as f:
                record = json.load(f)

        # Computed adjacency is the authority for gardens with coordinates.
        # Always inject into in-memory record for scoring.
        # Write back to data file if the neighbour set changed, so profile
        # maps stay correct without manual maintenance.
        # IMPORTANT: _sanitise_connectivity() is called before any disk write so
        # precise lat/lng never reach public JSON — display_lat/display_lng only.
        computed_adj = adjacency.get(gid, [])
        if gid in coord_index:
            def _adj_sig(entries):
                return sorted((e.get('id') or e.get('garden_id'), e.get('verified'))
                              for e in entries)
            file_adj = (record.get('connectivity') or {}).get('adjacent_registered_gardens') or []
            # Always update in-memory record so score is computed with adjacency.
            record.setdefault('connectivity', {})['adjacent_registered_gardens'] = computed_adj

            # Determine whether the public-facing adjacency data (display coords) differs.
            # We compare on garden_id + verified only; lat/lng are internal.
            if _adj_sig(computed_adj) != _adj_sig(file_adj):
                changes.append("%s: adjacency %s -> %s" % (
                    gid,
                    [e.get('id') or e.get('garden_id') for e in file_adj],
                    [e['garden_id'] for e in computed_adj]))
                if not check_only:
                    pub = _sanitise_connectivity(
                        json.loads(json.dumps(record)), private_coords, coord_seed)
                    with open(path, 'w') as wf:
                        json.dump(pub, wf, indent=2, ensure_ascii=False)
                        wf.write('\n')
            elif gid in private_coords:
                # Adjacency unchanged — still sanitise if: lat/lng present (first run
                # after migration), display coords missing, or seed was rotated and the
                # pre-baked display coords no longer match the current seed output.
                c_now = record.get('connectivity') or {}
                prec = private_coords[gid]
                expected_dlat, expected_dlng = _fuzz_coords(
                    prec['lat'], prec['lng'], gid, coord_seed)
                needs_sanitise = (
                    'lat' in c_now
                    or 'display_lat' not in c_now
                    or c_now.get('display_lat') != expected_dlat
                    or c_now.get('display_lng') != expected_dlng
                )
                if needs_sanitise:
                    changes.append("%s: updating display_lat/display_lng" % gid)
                    if not check_only:
                        pub = _sanitise_connectivity(
                            json.loads(json.dumps(record)), private_coords, coord_seed)
                        with open(path, 'w') as wf:
                            json.dump(pub, wf, indent=2, ensure_ascii=False)
                            wf.write('\n')

        # Store neighbour IDs in the registry entry for profile page map.
        adj_ids = [n['garden_id'] for n in computed_adj]
        old_adj  = g.get('adjacent_garden_ids') or []
        if adj_ids != old_adj:
            changes.append("%s: adjacent_garden_ids %s -> %s" % (gid, old_adj, adj_ids))
            if adj_ids:
                g['adjacent_garden_ids'] = adj_ids
            elif 'adjacent_garden_ids' in g:
                del g['adjacent_garden_ids']

        # Park resolution: auto-fill park_lat/park_lng via Overpass for any
        # garden with coordinates but missing park pin.
        # park_distance_m is only set if absent — preserves manually-entered
        # boundary distances (Overpass gives centroid distance).
        # Skipped in check_only mode to avoid HTTP calls on every check run.
        if not check_only and gid in coord_index:
            c_block = record.get('connectivity') or {}
            if c_block.get('adjacent_park') and (
                    c_block.get('park_lat') is None or c_block.get('park_lng') is None):
                glat, glng, _ = coord_index[gid]
                print("  resolving park for %s…" % gid)
                time.sleep(1)  # be polite to Overpass
                park = resolve_nearest_park(glat, glng)
                if park:
                    pname, plat, plng, pdist = park
                    c_block['park_name'] = c_block.get('park_name') or pname
                    c_block['park_lat']  = plat
                    c_block['park_lng']  = plng
                    if c_block.get('park_distance_m') is None:
                        c_block['park_distance_m'] = pdist
                    changes.append("%s: park resolved -> %s (%.4f, %.4f)" % (
                        gid, c_block['park_name'], plat, plng))
                    pub = _sanitise_connectivity(
                        json.loads(json.dumps(record)), private_coords, coord_seed)
                    with open(path, 'w') as wf:
                        json.dump(pub, wf, indent=2, ensure_ascii=False)
                        wf.write('\n')

        # Demo flag: input file is authoritative.
        demo = bool(record.get('demo')) or bool(g.get('demo'))
        if demo != bool(g.get('demo')):
            changes.append("%s: demo -> %s" % (gid, demo))
        if demo:
            g['demo'] = True
        elif 'demo' in g:
            del g['demo']

        # Score: engine output, unless pre-install.
        if g.get('status') in PRE_INSTALL_STATUSES:
            new_score = 0
        else:
            new_score = score_ecological_registry(record)['total']
        if new_score != g.get('score'):
            changes.append("%s: score %s -> %s" % (gid, g.get('score'), new_score))
            g['score'] = new_score

        # Rating tracks score, except pre-install gardens keep their
        # status-derived label (e.g. "Design Proposal").
        if g.get('status') not in PRE_INSTALL_STATUSES:
            new_rating = rating_object(new_score)
            if new_rating != g.get('rating'):
                changes.append("%s: rating -> %s (next: %s, +%s)" % (
                    gid, new_rating['current'], new_rating['next'],
                    new_rating['points_to_next']))
                g['rating'] = new_rating

        # Derive badges from canonical engine; stored array is the output, not the input.
        # Provisional gardens do not award badges -- inputs are unverified.
        if g.get('status') in NO_BADGE_STATUSES:
            if g.get('badges'):
                changes.append("%s: badges cleared (status=%s)" % (gid, g['status']))
                g['badges'] = []
            if g.get('badge_count', 0) != 0:
                changes.append("%s: badge_count -> 0 (status=%s)" % (gid, g['status']))
                g['badge_count'] = 0
        else:
            new_badges = award_badges(record)
            old_badges = g.get('badges') or []
            if new_badges != old_badges:
                added   = [b for b in new_badges if b not in old_badges]
                removed = [b for b in old_badges if b not in new_badges]
                changes.append("%s: badges +%s -%s" % (gid, added, removed))
                g['badges'] = new_badges
            new_count = len(new_badges)
            if g.get('badge_count') != new_count:
                changes.append("%s: badge_count %s -> %s" % (gid, g.get('badge_count'), new_count))
                g['badge_count'] = new_count

    # Metadata: counts derived live, demo gardens excluded from the
    # public total but reported separately.
    real = [g for g in registry['gardens'] if not g.get('demo')]
    demos = len(registry['gardens']) - len(real)
    meta = registry.setdefault('registry_metadata', {})
    if meta.get('total_gardens') != len(real):
        changes.append("metadata: total_gardens %s -> %s" % (meta.get('total_gardens'), len(real)))
        meta['total_gardens'] = len(real)
    if meta.get('demo_gardens') != demos:
        changes.append("metadata: demo_gardens %s -> %s" % (meta.get('demo_gardens'), demos))
        meta['demo_gardens'] = demos

    if not changes:
        print("Registry in sync. No changes.")
        return 0

    print("%d change(s):" % len(changes))
    for c in changes:
        print("  - " + c)

    if check_only:
        print("\n--check: registry.json NOT written.")
        return 1

    # Write to /tmp, validate round-trip, then copy into data/.
    with open(TMP_OUT, 'w') as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.write('\n')
    with open(TMP_OUT) as f:
        json.load(f)  # raises if invalid
    shutil.copy(TMP_OUT, REGISTRY)
    print("\nWritten to data/registry.json (validated via %s)." % TMP_OUT)

    # Write data/garden-locations.json — lightweight public index of display coords
    # used by assess.html to find the nearest registered garden after geocoding.
    locs = []
    for g in registry['gardens']:
        gid = g.get('garden_id', '')
        data_file = (g.get('data_file') or '').lstrip('/')
        path = os.path.join(REPO_ROOT, data_file)
        if not os.path.exists(path):
            continue
        rec = _records.get(gid)
        if rec is None:
            try:
                with open(path) as f:
                    rec = json.load(f)
            except Exception:
                continue
        c = rec.get('connectivity') or {}
        if c.get('display_lat') and c.get('display_lng'):
            locs.append({
                'garden_id':   gid,
                'garden_name': g.get('garden_name', gid),
                'display_lat': c['display_lat'],
                'display_lng': c['display_lng'],
            })
    locs_path = os.path.join(REPO_ROOT, 'data', 'garden-locations.json')
    with open(locs_path, 'w') as f:
        json.dump(locs, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print("Written data/garden-locations.json (%d gardens with display coords)." % len(locs))

    return 0


if __name__ == '__main__':
    sys.exit(sync(check_only='--check' in sys.argv))
