"""
test_opportunities_parity.py
Cross-checks js/reg-opportunities.js against scripts/reg_opportunities.py.

For every garden record it asserts both engines produce the same set of
opportunities with the same points, group, effort, pillar, delivery options
(path + cost, in order) and priority.

Because no real garden carries managed_by yet, the designer_install delivery
path never fires on live data. To keep that branch under test, the suite also
runs a SYNTHETIC fixture: one real record with managed_by.type = 'designer'
injected. Both engines must agree on it, and it must actually surface at least
one designer_install option — proving the gate opens.
"""

import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

from reg_opportunities import build_opportunities  # noqa: E402

# argv: node harness reg-score.js reg-opportunities.js garden.json  -> args land at argv[2..4]
NODE_HARNESS = r"""
const fs = require('fs');
eval(fs.readFileSync(process.argv[2], 'utf8'));           // reg-score.js
global.scoreEcologicalRegistry = scoreEcologicalRegistry;
const O = require(process.argv[3]);                        // reg-opportunities.js
const rec = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const res = O.buildOpportunities(rec);
const map = {};
res.opportunities.forEach(o => {
  map[o.id] = {
    points: o.points, group: o.group, effort: o.effort, pillar: o.pillar,
    priority: o.priority,
    delivery: o.delivery_options.map(d => d.path + ':' + d.cost)
  };
});
process.stdout.write(JSON.stringify(map));
"""

AGGREGATE = {'registry.json', 'gardens.json', 'species.json', 'badge-definitions.json', 'evc-demand.json'}


def js_opportunities(harness, garden_path):
    out = subprocess.check_output(
        ['node', harness,
         os.path.join(ROOT, 'js', 'reg-score.js'),
         os.path.join(ROOT, 'js', 'reg-opportunities.js'),
         garden_path],
        cwd=ROOT)
    return json.loads(out)


def py_opportunities(record):
    res = build_opportunities(record)
    return {o['id']: {
        'points': o['points'], 'group': o['group'], 'effort': o['effort'],
        'pillar': o['pillar'], 'priority': o['priority'],
        'delivery': [d['path'] + ':' + d['cost'] for d in o['delivery_options']],
    } for o in res['opportunities']}


def diff(name, js, py):
    only_js = sorted(set(js) - set(py))
    only_py = sorted(set(py) - set(js))
    changed = {k: (js[k], py[k]) for k in set(js) & set(py) if js[k] != py[k]}
    print('  FAIL  %s' % name)
    if only_js: print('        only in JS:', only_js)
    if only_py: print('        only in PY:', only_py)
    for k, (a, b) in changed.items():
        print('        differs  %s' % k)
        print('          JS:', a)
        print('          PY:', b)


def main():
    harness = os.path.join(ROOT, 'scripts', '_opp_harness.js')
    with open(harness, 'w') as f:
        f.write(NODE_HARNESS)

    gardens = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'data', '*.json'))):
        if os.path.basename(p) in AGGREGATE:
            continue
        try:
            rec = json.load(open(p))
        except Exception:
            continue
        if isinstance(rec, dict) and 'biodiversity' in rec:
            gardens.append(p)

    passed = failed = 0
    print('─' * 62)
    for p in gardens:
        name = os.path.basename(p)
        rec = json.load(open(p))
        js, py = js_opportunities(harness, p), py_opportunities(rec)
        if js == py:
            passed += 1
            print('  ok    %-24s %2d opportunities' % (name, len(py)))
        else:
            failed += 1
            diff(name, js, py)

    # ---- synthetic designer fixture ----
    print('─' * 62)
    src = os.path.join(ROOT, 'data', 'arundel.json')
    rec = json.load(open(src))
    rec['managed_by'] = {'type': 'designer', 'designer_id': 'test-designer'}
    tmp = os.path.join(ROOT, 'data', '_designer_fixture.json')
    with open(tmp, 'w') as f:
        json.dump(rec, f)
    try:
        js, py = js_opportunities(harness, tmp), py_opportunities(rec)
        has_designer = any('designer_install' in ''.join(v['delivery']) for v in py.values())
        if js == py and has_designer:
            passed += 1
            print('  ok    %-24s %2d opportunities (designer_install fired)' % ('designer-fixture', len(py)))
        elif js != py:
            failed += 1
            diff('designer-fixture', js, py)
        else:
            failed += 1
            print('  FAIL  designer-fixture: managed_by=designer but no designer_install surfaced')
    finally:
        os.remove(tmp)

    os.remove(harness)
    print('─' * 62)
    print('%d passed  %d failed' % (passed, failed))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
