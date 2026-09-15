"""
reconcile_submissions.py
Safety-net for the self-enrolment -> registered pipeline.

Reads the public Submissions CSV (no admin token needed) and cross-checks it
against data/registry.json to catch the gap where a submission is marked
`verified` in the sheet but was never actually registered — i.e. it has no
`published_garden_id` and/or no entry in registry.json. That is the exact
failure mode that hid the first self-enrolment (Harry Street) from BOTH the
provisional list (which excludes `verified`) and the registered list (which
only shows published gardens).

Flags, by severity:
  GAP   verified + no published_garden_id            -> fell through; will not
                                                        appear on either list.
  GAP   verified + published_garden_id not in
        registry.json                                -> published in sheet but
                                                        never pulled/synced.
  WARN  published_garden_id set but review_status
        is not verified                              -> inconsistent state.
  INFO  pending/verifying older than STALE_DAYS      -> awaiting action.

Exit status is non-zero if any GAP is found, so this can run in CI or as a
pre-push check.

Usage:
  python scripts/reconcile_submissions.py
  python scripts/reconcile_submissions.py --json     # machine-readable
"""

import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(REPO_ROOT, 'data', 'registry.json')

# Published CSV of the Submissions sheet — same source the public registry
# Provisional tab reads (registry.html PROV_CSV).
PROV_CSV = (
    'https://docs.google.com/spreadsheets/d/e/'
    '2PACX-1vS-v90MASzlma0rqxLApLTlMqi1NVHXgfg8AmKy80yXOlogICKA-JGSDxrS_'
    'EqnWSCb_QziixcPJHlW/pub?gid=0&single=true&output=csv'
)

# Column indices (0-based) — mirror scripts/appsscript/Code.gs appendRow order.
COL = {
    'timestamp': 0, 'submission_id': 1, 'steward_name': 2, 'review_status': 23,
    'published_garden_id': 25, 'garden_name': 30, 'garden_suburb': 31,
    'score': 17, 'tier': 18,
}

STALE_DAYS = 14
# review_status values that mean "no longer awaiting registration".
TERMINAL = {'deleted', 'hidden', 'rejected'}


def _fetch_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'reconcile/1.0',
                                               'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return list(csv.reader(io.StringIO(resp.read().decode('utf-8'))))


def _registry_ids():
    with open(REGISTRY) as f:
        reg = json.load(f)
    return {g.get('garden_id') for g in reg.get('gardens', []) if g.get('garden_id')}


def _age_days(ts):
    try:
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        return (datetime.now(timezone.utc) - dt).days
    except Exception:
        return None


def reconcile():
    rows = _fetch_csv(PROV_CSV)
    body = rows[1:] if len(rows) > 1 else []
    reg_ids = _registry_ids()

    gaps, warns, infos = [], [], []

    def cell(row, key):
        i = COL[key]
        return (row[i].strip() if i < len(row) and row[i] else '')

    for row in body:
        sub = cell(row, 'submission_id')
        if not sub:
            continue
        status = cell(row, 'review_status').lower()
        pub = cell(row, 'published_garden_id')
        name = cell(row, 'garden_name') or cell(row, 'garden_suburb') or '(unnamed)'
        label = '%s [%s]' % (name, sub)

        if status == 'verified':
            if not pub:
                gaps.append('%s verified but NO published_garden_id — not on '
                            'either list (fell through the pipeline).' % label)
            elif pub not in reg_ids:
                gaps.append('%s verified, published_garden_id=%s, but NOT in '
                            'registry.json — never pulled/synced.' % (label, pub))
        elif pub and status not in TERMINAL:
            warns.append('%s has published_garden_id=%s but review_status=%r '
                         '(expected verified).' % (label, pub, status or '(blank)'))
        elif status not in TERMINAL and status != 'verified':
            age = _age_days(cell(row, 'timestamp'))
            if age is not None and age >= STALE_DAYS:
                infos.append('%s %r for %d days — awaiting action.'
                             % (label, status or 'pending', age))

    return gaps, warns, infos


def main():
    as_json = '--json' in sys.argv
    gaps, warns, infos = reconcile()

    if as_json:
        print(json.dumps({'gaps': gaps, 'warnings': warns, 'info': infos}, indent=2))
    else:
        def section(title, items, symbol):
            print('\n%s (%d)' % (title, len(items)))
            for it in items:
                print('  %s %s' % (symbol, it))
            if not items:
                print('  none')
        section('GAPS — must fix', gaps, 'x')
        section('WARNINGS', warns, '!')
        section('INFO', infos, '-')
        print('\n%s' % ('FAIL — %d gap(s) found.' % len(gaps) if gaps
                        else 'OK — no pipeline gaps.'))

    return 1 if gaps else 0


if __name__ == '__main__':
    sys.exit(main())
