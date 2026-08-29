#!/usr/bin/env python3
"""One command: carry an assess/backend edit all the way to the live profile.

The gap this closes: assess.html "Publish" writes to the Apps Script backend, but
public profiles render from the committed static files. Nothing appears on a
profile until pull -> sync -> commit -> push runs. This script is that pipeline
in a single command.

Usage:
  python scripts/publish.py auburn                # publish one garden (partial name ok)
  python scripts/publish.py AUB dewrang           # publish several
  python scripts/publish.py --all                 # publish every registered garden
  python scripts/publish.py auburn --no-push      # pull+sync+commit, stop before push
  python scripts/publish.py --check               # dry run: report drift, write nothing

What it does:
  1. pull_live_records.py   live backend inputs -> static data files
  2. sync_registry.py       recompute scores, fuzz coords, rebuild registry.json
  3. git commit             STAGES ONLY the files this run touched (the published
                            gardens' data files + registry.json + garden-locations.json)
                            so unrelated working-tree edits are left untouched
  4. git push origin main   deploy to GitHub Pages   (skip with --no-push)

ER_COORD_SEED is read from the environment, or sourced from data/private/env.sh.
"""

import json
import os
import re
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY  = os.path.join(REPO_ROOT, 'data', 'registry.json')
ENV_FILE  = os.path.join(REPO_ROOT, 'data', 'private', 'env.sh')
BRANCH    = 'main'
SITE      = 'https://ecologicalregistry.org'


def die(msg):
    sys.exit('\nERROR: ' + msg + '\n')


def load_seed():
    """Return ER_COORD_SEED from the environment, or parse it out of env.sh."""
    seed = os.environ.get('ER_COORD_SEED', '').strip()
    if seed:
        return seed
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE) as f:
            m = re.search(r'ER_COORD_SEED=([^\s#]+)', f.read())
        if m:
            return m.group(1).strip()
    die("ER_COORD_SEED is not set and not found in data/private/env.sh.\n"
        "Set it with:  export ER_COORD_SEED=<seed>")


def load_gardens():
    with open(REGISTRY) as f:
        return json.load(f).get('gardens', [])


def resolve_ids(terms, gardens):
    """Map user terms (full id, or a case-insensitive substring of id/name) to
    full garden_ids. Fails loudly on a term that matches nothing or is ambiguous."""
    ids = []
    for term in terms:
        t = term.lower()
        hits = [g for g in gardens
                if t in (g.get('garden_id', '') or '').lower()
                or t in (g.get('garden_name', '') or '').lower()]
        if not hits:
            die("no garden matches %r. Known ids: %s"
                % (term, ', '.join(g.get('garden_id', '?') for g in gardens)))
        if len(hits) > 1:
            die("%r is ambiguous — matches: %s"
                % (term, ', '.join('%s (%s)' % (g.get('garden_id'), g.get('garden_name')) for g in hits)))
        ids.append(hits[0]['garden_id'])
    return ids


def run(cmd, env=None):
    """Run a subprocess, streaming output, and return (returncode, captured stdout)."""
    print('\n$ ' + ' '.join(cmd))
    proc = subprocess.Popen(cmd, cwd=REPO_ROOT, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out_lines = []
    for line in proc.stdout:
        sys.stdout.write(line)
        out_lines.append(line)
    proc.wait()
    return proc.returncode, ''.join(out_lines)


def git(*args):
    return subprocess.run(['git'] + list(args), cwd=REPO_ROOT,
                          capture_output=True, text=True)


def main():
    argv     = sys.argv[1:]
    check    = '--check' in argv
    no_push  = '--no-push' in argv
    do_all   = '--all' in argv
    terms    = [a for a in argv if not a.startswith('--')]

    if not terms and not do_all:
        die("specify garden(s) to publish, or --all.\n"
            "  python scripts/publish.py auburn\n"
            "  python scripts/publish.py --all")

    seed    = load_seed()
    env     = dict(os.environ, ER_COORD_SEED=seed)
    gardens = load_gardens()
    ids     = [] if do_all else resolve_ids(terms, gardens)

    # Files this run is allowed to stage — never sweeps up unrelated dirty files.
    by_id   = {g['garden_id']: g.get('data_file', '') for g in gardens}
    url_by_id = {g['garden_id']: g.get('profile_url', '') for g in gardens}
    targets = ['data/registry.json', 'data/garden-locations.json']
    for gid in ids:
        df = (by_id.get(gid) or '').lstrip('/')
        if df:
            targets.append(df)

    # 1. PULL — live backend inputs into the static data files.
    py = sys.executable or 'python3'
    rc, _ = run([py, 'scripts/pull_live_records.py'] + (['--check'] if check else []) + ids, env)
    if rc != 0:
        die('pull_live_records.py failed (exit %d).' % rc)

    if check:
        # A dry run only reports drift; sync/commit/push would write, so stop here.
        print('\nCHECK complete — no files written. Re-run without --check to publish.')
        return

    # 2. SYNC — recompute scores, fuzz coords, rebuild registry.
    rc, _ = run([py, 'scripts/sync_registry.py'], env)
    if rc != 0:
        die('sync_registry.py failed (exit %d).' % rc)

    # 2b. PARITY GATE — never publish a score from a drifted engine. --parity-only
    # ignores unrelated stale stored blocks (sync just rewrote ours).
    rc, _ = run([py, 'scripts/test_parity.py', '--parity-only'], env)
    if rc != 0:
        die('parity check failed — js/reg-score.js and scripts/reg_score.py disagree.\n'
            'Nothing published. Fix the engine drift before publishing.')

    # 3. STAGE only our targets, then check whether anything actually changed.
    if do_all:
        git('add', '--', 'data/')            # publishing everything: whole data dir
    else:
        git('add', '--', *[t for t in targets if os.path.exists(os.path.join(REPO_ROOT, t))])

    staged = git('diff', '--cached', '--name-only').stdout.strip()
    if not staged:
        print('\nNothing changed — the live profiles already match the backend. Done.')
        return
    print('\nStaged:\n  ' + staged.replace('\n', '\n  '))

    label = 'all gardens' if do_all else ', '.join(
        next((g.get('garden_name') for g in gardens if g['garden_id'] == gid), gid) for gid in ids)
    subject = 'Publish %s: sync live scores to static profiles' % label
    r = git('commit', '-m', subject)
    if r.returncode != 0:
        die('git commit failed:\n' + (r.stderr or r.stdout))
    print('\n' + git('log', '--oneline', '-1').stdout.strip())

    # 4. PUSH — deploy to GitHub Pages.
    if no_push:
        print('\n--no-push: committed but not pushed. Push with:  git push origin ' + BRANCH)
        return
    r = git('push', 'origin', BRANCH)
    if r.returncode != 0:
        die('git push failed:\n' + (r.stderr or r.stdout))
    print('\nPushed to origin/%s — GitHub Pages will redeploy in ~1 min.' % BRANCH)
    for gid in ids:
        url = (url_by_id.get(gid) or '').replace('/index.html', '/')
        if url:
            print('  ' + SITE + url)


if __name__ == '__main__':
    main()
