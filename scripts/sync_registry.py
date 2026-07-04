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

import json
import os
import shutil
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(REPO_ROOT, 'data', 'registry.json')
TMP_OUT = '/tmp/registry.sync.json'

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


def sync(check_only=False):
    with open(REGISTRY) as f:
        registry = json.load(f)

    changes = []

    for block in FORBIDDEN_BLOCKS:
        if block in registry:
            changes.append("removed stored derived block: %s" % block)
            del registry[block]

    for g in registry['gardens']:
        gid = g.get('garden_id', '?')
        data_file = (g.get('data_file') or '').lstrip('/')
        path = os.path.join(REPO_ROOT, data_file)
        if not os.path.exists(path):
            print("WARN %s: missing data_file %s — skipped" % (gid, data_file))
            continue
        with open(path) as f:
            record = json.load(f)

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

        # badge_count must equal the badges array.
        badges = g.get('badges') or []
        if g.get('badge_count') != len(badges):
            changes.append("%s: badge_count %s -> %s" % (gid, g.get('badge_count'), len(badges)))
            g['badge_count'] = len(badges)

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
    return 0


if __name__ == '__main__':
    sys.exit(sync(check_only='--check' in sys.argv))
