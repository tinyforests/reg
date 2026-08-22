"""
build_updates.py
Ecological Registry — aggregate every garden's recaps & updates into one dated feed.

Reads all garden records (data/*.json), flattens their activity_log entries plus the
canopy/habitat spatial calculations (which carry precise calculated_at timestamps),
sorts newest-first, and writes data/updates.json for updates.html.

    python scripts/build_updates.py

Run it after edits (or as part of sync) to refresh the changelog page.
"""

import glob
import json
import os
import re
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MONTHS = {m: i for i, m in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], start=1)}


def profile_slugs():
    """Map data-file stem -> profile directory, by reading each profile's _staticJson."""
    out = {}
    for idx in glob.glob(os.path.join(REPO, 'gardens', '*', 'index.html')):
        try:
            html = open(idx, encoding='utf-8').read()
        except Exception:
            continue
        m = re.search(r"_staticJson\s*=\s*'/data/([^']+)\.json'", html)
        if m:
            out[m.group(1)] = os.path.basename(os.path.dirname(idx))
    return out


def sort_dt(ts, date_str):
    """Best datetime for sorting: precise ts if present, else 'Mon YYYY' mid-month."""
    if ts:
        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except Exception:
            pass
    if date_str:
        m = re.match(r'([A-Za-z]{3})[a-z]*\s+(\d{4})', str(date_str))
        if m and m.group(1).title() in MONTHS:
            return datetime(int(m.group(2)), MONTHS[m.group(1).title()], 15, tzinfo=timezone.utc)
        m = re.match(r'(\d{4})', str(date_str))
        if m:
            return datetime(int(m.group(1)), 1, 1, tzinfo=timezone.utc)
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


def main():
    slugmap = profile_slugs()
    updates = []
    for f in sorted(glob.glob(os.path.join(REPO, 'data', '*.json'))):
        try:
            rec = json.load(open(f))
        except Exception:
            continue
        if not isinstance(rec, dict) or not rec.get('garden_id'):
            continue
        stem = os.path.basename(f)[:-5]
        base = {
            'garden_id': rec['garden_id'],
            'garden_name': rec.get('garden_name', rec['garden_id']),
            'slug': slugmap.get(stem),
        }

        for e in rec.get('activity_log', []):
            ts = e.get('ts') or e.get('timestamp')
            updates.append(dict(base,
                date=e.get('date', ''), ts=ts, type=e.get('type', 'Update'),
                category=e.get('category', ''), notes=e.get('notes', e.get('title', '')),
                public=e.get('public', True),
                _sort=sort_dt(ts, e.get('date', '')).isoformat()))

        # spatial calculations carry precise timestamps
        cx = (rec.get('canopy') or {}).get('existing') or {}
        if cx.get('calculated_at') and cx.get('canopy_cover_pct') is not None:
            updates.append(dict(base, date=None, ts=cx['calculated_at'], type='Canopy',
                category='spatial', public=True,
                notes='Canopy %s%% mapped (%s) — %s' % (cx['canopy_cover_pct'],
                      cx.get('boundary_type', 'mapped'), cx.get('source', 'spatial')),
                _sort=cx['calculated_at']))
        hv = (rec.get('habitat_context') or {}).get('habitat_value') or {}
        if hv.get('calculated_at') and hv.get('value') is not None:
            updates.append(dict(base, date=None, ts=hv['calculated_at'], type='Habitat Value',
                category='spatial', public=True,
                notes='Habitat Value %s/100 (%s) — %s %s' % (hv['value'], hv.get('band', ''),
                      hv.get('source', 'DEECA'), hv.get('source_service', '')),
                _sort=hv['calculated_at']))

    updates.sort(key=lambda u: u['_sort'], reverse=True)
    out = {
        'generated_at': datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        'count': len(updates),
        'gardens': len({u['garden_id'] for u in updates}),
        'updates': updates,
    }
    dest = os.path.join(REPO, 'data', 'updates.json')
    with open(dest, 'w') as fh:
        json.dump(out, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print('Wrote %s — %d updates across %d gardens.' % (dest, out['count'], out['gardens']))


if __name__ == '__main__':
    main()
