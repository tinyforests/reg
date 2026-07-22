#!/usr/bin/env python3
"""
apply_claims.py
Ecological Registry -- apply confirmed steward claims to garden records.

Workflow:
    1. A steward claims a completed opportunity from their garden profile.
    2. You confirm the work happened, and set Review Status = confirmed
       in the Claims tab.
    3. Run this script.

It reads the published Claims CSV, finds every row marked confirmed, flips the
matching INPUT in the right garden record, and re-runs sync_registry.py. The
score follows from the input -- this script never writes a score.

Idempotent: a claim whose input is already set is skipped, so you can run it as
often as you like and there is no "applied" state to track in the sheet.

Safety: for every claim it asks the opportunity engine what the move is worth
BEFORE applying, then checks the actual score delta AFTER. A mismatch means the
field mapping has drifted from the engine, and it says so loudly.

Usage:
    python scripts/apply_claims.py              # apply confirmed claims
    python scripts/apply_claims.py --dry-run    # show what would change
    python scripts/apply_claims.py --url <csv>  # override the CSV source
"""

import argparse
import copy
import csv
import io
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

from reg_score import score_ecological_registry  # noqa: E402

CLAIMS_CSV_URL = (
    'https://docs.google.com/spreadsheets/d/e/'
    '2PACX-1vS-v90MASzlma0rqxLApLTlMqi1NVHXgfg8AmKy80yXOlogICKA-JGSDxrS_EqnWSCb_QziixcPJHlW'
    '/pub?gid=1458994815&single=true&output=csv'
)

CONFIRMED = {'confirmed', 'approved', 'yes', 'y'}

# opportunity_id -> (section, field, value)
# Mirrors the mutate() functions in js/reg-opportunities.js. Verified after
# every apply by comparing the score delta against the engine's promise.
FIELD_MAP = {
    'water_feature':  ('habitat', 'has_water_feature', True),
    'rocks':          ('habitat', 'has_rock_refuges', True),
    'logs':           ('habitat', 'has_embedded_logs', True),
    'nest_boxes':     ('habitat', 'has_nest_boxes', True),
    'moisture_basin': ('soil_water', 'has_moisture_basin', True),
    'rainwater':      ('soil_water', 'has_rainwater_system', True),
    'swale':          ('soil_water', 'has_swale', True),
    'photos':         ('evidence', 'has_photos', True),
    'field_notes':    ('evidence', 'has_field_notes', True),
    'species_list':   ('evidence', 'has_species_list', True),
    'fauna_record':   ('evidence', 'has_fauna_record', True),
    'nodes_to_1':     ('habitat', 'habitat_nodes', 1),
    'nodes_to_3':     ('habitat', 'habitat_nodes', 3),
    'nodes_to_5':     ('habitat', 'habitat_nodes', 5),
    # fauna_first is handled separately -- it appends to a list
}


def fetch_csv(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read().decode('utf-8')


def load_registry():
    with open(os.path.join(ROOT, 'data', 'registry.json')) as f:
        return json.load(f)['gardens']


def garden_path_for(garden_id, gardens):
    for g in gardens:
        if str(g.get('garden_id')) == str(garden_id):
            return os.path.join(ROOT, g['data_file'])
    return None


def engine_promise(record, opp_id):
    """What the opportunity engine says this move is worth, right now."""
    try:
        from reg_opportunities import build_opportunities
    except ImportError:
        return None
    for o in build_opportunities(record)['opportunities']:
        if o['id'] == opp_id:
            return o['points']
    return None


def already_applied(record, opp_id):
    if opp_id == 'fauna_first':
        sightings = (record.get('habitat') or {}).get('fauna_sightings') or []
        return any(s.get('verified') for s in sightings)
    section, field, value = FIELD_MAP[opp_id]
    current = (record.get(section) or {}).get(field)
    if isinstance(value, bool):
        return bool(current)
    return isinstance(current, int) and current >= value


def apply_to_record(record, opp_id):
    if opp_id == 'fauna_first':
        record.setdefault('habitat', {})
        sightings = record['habitat'].get('fauna_sightings') or []
        sightings.append({'verified': True, 'source': 'steward claim'})
        record['habitat']['fauna_sightings'] = sightings
        return 'habitat.fauna_sightings += verified sighting'
    section, field, value = FIELD_MAP[opp_id]
    record.setdefault(section, {})
    if isinstance(value, int) and not isinstance(value, bool):
        value = max(int(record[section].get(field) or 0), value)
    record[section][field] = value
    return '%s.%s = %s' % (section, field, value)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default=CLAIMS_CSV_URL)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    print('Fetching claims...')
    try:
        text = fetch_csv(args.url)
    except Exception as e:
        print('  Could not fetch the Claims CSV: %s' % e)
        print('  Check the tab is still published (File > Share > Publish to web).')
        sys.exit(1)

    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        print('  No rows in the Claims sheet.')
        return

    # match on header names, not positions, so moving columns doesn't break this
    def col(row, *names):
        for n in names:
            for k in row:
                if k and k.strip().lower() == n.lower():
                    return (row[k] or '').strip()
        return ''

    gardens = load_registry()
    confirmed = [r for r in rows if col(r, 'Review Status').lower() in CONFIRMED]
    print('  %d row(s), %d confirmed\n' % (len(rows), len(confirmed)))
    if not confirmed:
        print('Nothing to apply. Mark a claim Review Status = confirmed first.')
        return

    changed, skipped, problems = [], [], []

    for r in confirmed:
        gid    = col(r, 'Garden ID')
        opp    = col(r, 'Opportunity ID')
        gname  = col(r, 'Garden Name')
        claim  = col(r, 'Claim ID')
        label  = '%s / %s' % (gname or gid, opp)

        if opp != 'fauna_first' and opp not in FIELD_MAP:
            problems.append('%s -- unknown opportunity id, not applied' % label)
            continue

        path = garden_path_for(gid, gardens)
        if not path or not os.path.exists(path):
            problems.append('%s -- no garden record for %s' % (label, gid))
            continue

        with open(path) as f:
            record = json.load(f)

        if already_applied(record, opp):
            skipped.append('%s -- already applied' % label)
            continue

        before = score_ecological_registry(record)['total']
        promised = engine_promise(record, opp)

        updated = copy.deepcopy(record)
        what = apply_to_record(updated, opp)
        after = score_ecological_registry(updated)['total']
        delta = after - before

        if promised is not None and delta != promised:
            problems.append(
                '%s -- engine promised +%s but applying gives +%s (field mapping may have drifted)'
                % (label, promised, delta))
            continue

        if not args.dry_run:
            with open(path, 'w') as f:
                json.dump(updated, f, indent=2, ensure_ascii=False)
                f.write('\n')

        changed.append('%-34s %s  (%d -> %d, +%d)%s'
                       % (label, what, before, after, delta,
                          '  [' + claim + ']' if claim else ''))

    for line in changed:
        print('  applied  ' + line)
    for line in skipped:
        print('  skip     ' + line)
    for line in problems:
        print('  PROBLEM  ' + line)

    if args.dry_run:
        print('\nDry run -- nothing written.')
        return

    if changed:
        print('\nRegenerating derived fields...')
        rc = subprocess.call([sys.executable, os.path.join(ROOT, 'scripts', 'sync_registry.py')])
        if rc != 0:
            print('sync_registry.py failed -- review before committing.')
            sys.exit(1)
        print('\n%d claim(s) applied. Review the diff, then:' % len(changed))
        print('  git diff')
        print('  python scripts/test_parity.py')
        print('  git commit -am "Apply confirmed steward claims"')
        print('  git push')
    else:
        print('\nNothing to apply.')

    if problems:
        sys.exit(1)


if __name__ == '__main__':
    main()
