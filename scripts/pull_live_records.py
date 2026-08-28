"""
pull_live_records.py
Fetches live garden records from the Apps Script backend and writes them
into the local data/*.json files, making Apps Script the source of truth
for all scored and form-managed fields.

Run this after publishing any garden from assess.html, then run
sync_registry.py to recompute registry.json.

Workflow:
  1. Open garden in assess.html, edit fields, click Publish
  2. python scripts/pull_live_records.py
  3. python scripts/sync_registry.py
  4. git add data/ && git commit && git push

Fields pulled from Apps Script (scored/form fields):
  garden_name, garden_type, typology, registry_role, trajectory,
  suburb, state, council, ward, lga, area_sqm, description,
  assessment_date, baseline_date, target_score, stewards,
  evc, biodiversity, soil_water, habitat, connectivity, evidence,
  milestones, activity_log, notes, yield, score

Fields preserved from local file (never overwritten):
  demo, badges, rating, upgrade_potential, points_available,
  canopy, habitat_context (locally managed spatial layers),
  steward_email, garden_address (PII — never into the public repo),
  Any field present locally but absent from the live record.

Usage:
  python scripts/pull_live_records.py              # pull all gardens
  python scripts/pull_live_records.py ER-AU-VIC-SH-ARU-0001  # one garden
  python scripts/pull_live_records.py --check      # report drift, write nothing
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY  = os.path.join(REPO_ROOT, 'data', 'registry.json')
ENDPOINT  = (
    'https://script.google.com/macros/s/'
    'AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec'
)

# Fields in the root of the local JSON that are set by sync_registry.py
# or manually and must never be overwritten by a pull.
LOCAL_ONLY_ROOT_FIELDS = {'demo', 'badges', 'rating', 'upgrade_potential', 'points_available',
                          # canopy is managed locally by canopy_map.py; the live record may also
                          # carry a precise garden_extent_geojson (display overlay) that must never
                          # be pulled into the committed repo.
                          'canopy',
                          # habitat_context is managed locally by habitat_value.py (DEECA lookup).
                          'habitat_context',
                          # PII: never pull residents' email/street address into the PUBLIC repo.
                          'steward_email', 'garden_address', 'address'}


def fetch_live(garden_id):
    """Fetch the live Apps Script record for garden_id.
    Returns the record dict, or None if not published / not found."""
    # Cache-buster: Apps Script web-app GET responses can be served stale from
    # Google's edge cache. A unique query param + no-cache headers force a fresh
    # read — without it a pull (or a fetch-modify-write) can act on a stale record.
    url = ENDPOINT + '?' + urllib.parse.urlencode({
        'action':    'get_garden_record',
        'garden_id': garden_id,
        '_cb':       ('%d' % (time.time() * 1000)),
    })
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent':    'pull_live_records/1.0',
            'Accept':        'application/json',
            'Cache-Control': 'no-cache',
            'Pragma':        'no-cache',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode()
    except Exception as e:
        print("  WARN fetch failed for %s: %s" % (garden_id, e))
        return None

    try:
        payload = json.loads(raw)
    except Exception:
        print("  WARN non-JSON response for %s (may not be published yet)" % garden_id)
        return None

    if not payload.get('ok'):
        return None

    return payload.get('data') or payload.get('record') or None


def merge(local, live):
    """Return a new dict: live fields win, local-only fields preserved.
    Special cases:
    - habitat.fauna_sightings: keep local list if the live record has none
      (fauna count field defaults to 0 in assess, which clears the array;
      steward-reported sightings from field notes must not be lost this way).
    Modifies nothing in-place."""
    merged = dict(local)
    for key, val in live.items():
        if key in LOCAL_ONLY_ROOT_FIELDS:
            continue  # local always wins for these
        merged[key] = val

    # Protect fauna sightings from accidental clearing via form publish.
    local_sightings = (local.get('habitat') or {}).get('fauna_sightings') or []
    live_sightings  = (live.get('habitat')  or {}).get('fauna_sightings') or []
    if local_sightings and not live_sightings:
        merged.setdefault('habitat', {})['fauna_sightings'] = local_sightings

    return merged


def pull_garden(garden_id, data_file, check_only):
    path = os.path.join(REPO_ROOT, data_file.lstrip('/'))
    if not os.path.exists(path):
        print("  SKIP %s — data file not found: %s" % (garden_id, data_file))
        return False

    with open(path) as f:
        local = json.load(f)

    live = fetch_live(garden_id)
    if live is None:
        print("  SKIP %s — no published record in Apps Script" % garden_id)
        return False

    merged = merge(local, live)

    # Detect changes (ignoring key ordering).
    if json.dumps(merged, sort_keys=True) == json.dumps(local, sort_keys=True):
        print("  OK   %s — in sync" % garden_id)
        return False

    # Report changed keys.
    changed = [k for k in set(list(local.keys()) + list(merged.keys()))
               if merged.get(k) != local.get(k) and k not in LOCAL_ONLY_ROOT_FIELDS]
    print("  DIFF %s — changed: %s%s" % (
        garden_id,
        ', '.join(changed[:6]),
        (' (+%d more)' % (len(changed) - 6)) if len(changed) > 6 else ''
    ))

    if check_only:
        return True

    with open(path, 'w') as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print("       written → %s" % os.path.relpath(path, REPO_ROOT))
    return True


def run():
    check_only   = '--check' in sys.argv
    filter_ids   = [a for a in sys.argv[1:] if not a.startswith('--')]

    with open(REGISTRY) as f:
        registry = json.load(f)

    gardens = registry.get('gardens', [])
    if filter_ids:
        gardens = [g for g in gardens if g.get('garden_id') in filter_ids]
        if not gardens:
            sys.exit("No matching gardens found for: %s" % ', '.join(filter_ids))

    print("Pulling %d garden(s) from Apps Script…\n" % len(gardens))

    updated = 0
    for g in gardens:
        gid       = g.get('garden_id', '?')
        data_file = g.get('data_file', '')
        if not data_file:
            print("  SKIP %s — no data_file in registry" % gid)
            continue
        if pull_garden(gid, data_file, check_only):
            updated += 1

    print("\n%s — %d of %d garden(s) %s." % (
        'CHECK' if check_only else 'DONE',
        updated,
        len(gardens),
        'would update' if check_only else 'updated',
    ))
    if updated and not check_only:
        print("\nNext: python scripts/sync_registry.py")

    return 0


if __name__ == '__main__':
    sys.exit(run())
