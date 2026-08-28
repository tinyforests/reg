"""
add_invited_neighbour.py
Ecological Registry — record a confirmed invited-neighbour (referral) link.

Invited neighbours count toward connectivity REGARDLESS of the 500 m adjacency
radius: a steward who brings a neighbour into the Registry is networked with them
however far apart the gardens sit. sync_registry.build_adjacency preserves any
adjacency entry marked source="invited" (union with the geographic 500 m set), and
the scorer counts verified entries — so this link survives every sync.

Creates a MUTUAL link (A lists B, B lists A), in both the static data files and
the live Apps Script records (so the two stay consistent).

    python scripts/add_invited_neighbour.py ER-AU-VIC-SH-ARU-0001 ER-AU-VIC-SH-CAN-0001
    python scripts/add_invited_neighbour.py A B --remove      # undo a link

After running, do: python scripts/sync_registry.py  (dedupes + re-fuzzes + rebuilds
registry.json), then commit. Requires ER_ADMIN_TOKEN for the live-record update.
"""

import argparse
import glob
import json
import os
import sys
import time
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'scripts'))
import pull_live_records as p  # noqa: E402  (ENDPOINT + fetch)


def static_index():
    idx = {}
    for f in glob.glob(os.path.join(REPO, 'data', '*.json')):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if isinstance(d, dict) and d.get('garden_id'):
            idx[d['garden_id']] = f
    return idx


def _name(gid, sidx):
    f = sidx.get(gid)
    if f:
        try:
            return json.load(open(f)).get('garden_name') or gid
        except Exception:
            pass
    return gid


def _entry(nid, name):
    return {"id": nid, "garden_id": nid, "name": name,
            "verified": True, "source": "invited"}


def _apply(adj, nid, name, remove):
    adj = [e for e in adj if (e.get('id') or e.get('garden_id')) != nid]
    if not remove:
        adj.append(_entry(nid, name))
    return adj


def update_static(gid, nid, name, sidx, remove):
    f = sidx.get(gid)
    if not f:
        print("  (no static file for %s — skipped static)" % gid)
        return
    d = json.load(open(f))
    c = d.setdefault('connectivity', {})
    c['adjacent_registered_gardens'] = _apply(
        c.get('adjacent_registered_gardens') or [], nid, name, remove)
    json.dump(d, open(f, 'w'), indent=2, ensure_ascii=False)
    open(f, 'a').write('\n')
    print("  static  %s %s %s" % (gid, '-=' if remove else '+=', nid))


def update_live(gid, nid, name, remove, tok):
    live = p.fetch_live(gid)
    if not live:
        print("  (no live record for %s — skipped live)" % gid)
        return
    c = live.setdefault('connectivity', {})
    c['adjacent_registered_gardens'] = _apply(
        c.get('adjacent_registered_gardens') or [], nid, name, remove)
    body = json.dumps({'submission_type': 'save_garden_record', 'admin_token': tok,
                       'garden_id': gid, 'editor': 'Gardener & Son', 'record': live}).encode()
    req = urllib.request.Request(p.ENDPOINT, data=body,
                                 headers={'Content-Type': 'text/plain;charset=utf-8'})
    ok = json.loads(urllib.request.urlopen(req, timeout=60).read().decode()).get('ok')
    print("  live    %s %s %s  saved=%s" % (gid, '-=' if remove else '+=', nid, ok))
    time.sleep(0.6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("garden_a")
    ap.add_argument("garden_b")
    ap.add_argument("--remove", action="store_true", help="remove the link instead of adding")
    ap.add_argument("--static-only", action="store_true", help="skip the live-record update")
    a = ap.parse_args()

    A, B = a.garden_a, a.garden_b
    if A == B:
        sys.exit("a garden cannot be its own neighbour")
    sidx = static_index()
    nameA, nameB = _name(A, sidx), _name(B, sidx)

    print("%s invited link: %s <-> %s" % ('Removing' if a.remove else 'Adding', A, B))
    update_static(A, B, nameB, sidx, a.remove)
    update_static(B, A, nameA, sidx, a.remove)

    if not a.static_only:
        tok = os.environ.get('ER_ADMIN_TOKEN')
        if not tok:
            print("  (ER_ADMIN_TOKEN not set — static updated, live records NOT. "
                  "Set it and re-run, or use --static-only.)")
        else:
            update_live(A, B, nameB, a.remove, tok)
            update_live(B, A, nameA, a.remove, tok)

    print("\nNext: python scripts/sync_registry.py   (preserves invited links, "
          "re-fuzzes coords, rebuilds registry.json), then commit.")


if __name__ == '__main__':
    main()
