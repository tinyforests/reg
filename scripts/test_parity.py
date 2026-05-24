"""
test_parity.py
Parity test harness for the Ecological Registry scoring engine.

Runs every garden JSON through both the Python and JavaScript engines
and asserts identical pillar scores and totals.

Usage:
  python scripts/test_parity.py
  python scripts/test_parity.py --verbose
"""

import json
import os
import subprocess
import sys

REPO_ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR    = os.path.join(REPO_ROOT, 'data')
NODE_BRIDGE = os.path.join(REPO_ROOT, 'scripts', 'score_garden.js')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reg_score import score_ecological_registry

SKIP_FILES = {'registry.json', 'species.json', 'badge-definitions.json', 'gardens.json'}
PILLARS    = ['biodiversity', 'soil_water', 'habitat', 'connectivity', 'evidence']


def score_js(json_path):
    result = subprocess.run(
        ['node', NODE_BRIDGE, json_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def run():
    verbose = '--verbose' in sys.argv

    garden_files = sorted(
        f for f in os.listdir(DATA_DIR)
        if f.endswith('.json') and f not in SKIP_FILES
    )

    passed = failed = 0
    failures = []

    print(f'Parity check: {len(garden_files)} gardens\n')
    print(f'{"Garden":<32} {"JS":>5} {"PY":>5} {"Diff":>5}  {"Result"}')
    print('─' * 62)

    for filename in garden_files:
        json_path = os.path.join(DATA_DIR, filename)

        with open(json_path) as f:
            record = json.load(f)

        name = record.get('garden_name', filename.replace('.json', ''))

        try:
            js = score_js(json_path)
            py = score_ecological_registry(record)

            diff   = py['total'] - js['total']
            ok     = diff == 0
            status = 'PASS' if ok else 'FAIL'

            print(f'{name:<32} {js["total"]:>5} {py["total"]:>5} {diff:>+5}  {status}')

            if verbose and not ok:
                for p in PILLARS:
                    pdiff = py.get(p, 0) - js.get(p, 0)
                    if pdiff != 0:
                        print(f'  {p:<20} JS={js.get(p):>3}  PY={py.get(p):>3}  diff={pdiff:+d}')

            if ok:
                passed += 1
            else:
                failed += 1
                failures.append({'file': filename, 'name': name, 'js': js, 'py': py})

        except Exception as exc:
            print(f'{name:<32} {"ERR":>5} {"ERR":>5} {"?":>5}  ERROR: {exc}')
            failed += 1
            failures.append({'file': filename, 'name': name, 'error': str(exc)})

    print('─' * 62)
    print(f'{passed} passed  {failed} failed\n')

    if failures and not verbose:
        print('Run with --verbose for per-pillar breakdown.\n')

    if failures:
        for f in failures:
            if 'error' not in f and not verbose:
                js, py = f['js'], f['py']
                print(f'{f["name"]}:')
                for p in PILLARS:
                    pdiff = py.get(p, 0) - js.get(p, 0)
                    if pdiff != 0:
                        print(f'  {p:<20} JS={js.get(p):>3}  PY={py.get(p):>3}  diff={pdiff:+d}')
        sys.exit(1)

    sys.exit(0)


if __name__ == '__main__':
    run()
