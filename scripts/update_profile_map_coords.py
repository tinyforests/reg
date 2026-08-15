#!/usr/bin/env python3
"""
Switch all garden profile pages from the old client-side _publicCoords()
fuzzing approach to the pre-baked display_lat/display_lng now written
into public data JSON by sync_registry.py.

Changes per profile:
  1. Remove the _publicCoords() function block (invertible, no longer needed)
  2. Replace c.lat / c.lng with c.display_lat / c.display_lng in initCorridorMap
  3. Remove the steward branch that bypassed fuzzing (stewards also see the
     pre-baked fuzzed pin until the Apps Script precise-coords path is built)
  4. Replace g.lat / g.lng with g.display_lat / g.display_lng in adj loop
  5. Soften the privacy copy from the explicit "~250m offset" claim
"""

import os
import re

GARDENS_DIR = os.path.join(os.path.dirname(__file__), '..', 'gardens')
SKIP = {'foresthillk'}

# ── replacements ──────────────────────────────────────────────────────────────

def strip_public_coords_fn(content):
    """Remove the _publicCoords function block (comment + function)."""
    pattern = (
        r'/\* Deterministic ~250m offset[^\n]*\n'
        r'[^\n]*Stewards who have claimed[^\n]*\n'
        r'function _publicCoords\(lat, lng, gardenId\) \{[^}]+\}\n'
    )
    return re.sub(pattern, '', content)


def update_map_init(content):
    """Replace initCorridorMap to use display_lat/display_lng."""

    # 1. c.lat → c.display_lat  / c.lng → c.display_lng  (primary garden)
    content = content.replace(
        'var lat = c.lat;\n  var lng = c.lng;',
        'var lat = c.display_lat;\n  var lng = c.display_lng;'
    )

    # 2. Remove the isSteward map check + _publicCoords call block.
    #    The block spans 4 lines — match with a small regex.
    block = (
        r"  var _isStewardMap = \(typeof isSteward === 'function'\) && isSteward\(record\.garden_id \|\| ''\);\n"
        r"  var displayLat = lat;\n"
        r"  var displayLng = lng;\n"
        r"  if \(!_isStewardMap && lat && lng\) \{\n"
        r"    var _fc = _publicCoords\(lat, lng, record\.garden_id \|\| ''\);\n"
        r"    displayLat = _fc\[0\];\n"
        r"    displayLng = _fc\[1\];\n"
        r"  \}\n"
    )
    replacement = (
        '  // display_lat/display_lng are pre-baked by sync_registry.py — no client-side offset needed.\n'
        '  // TODO: stewards see fuzzed pin for now; fetch precise coords from Apps Script get_precise_coords.\n'
        '  var displayLat = lat;\n'
        '  var displayLng = lng;\n'
    )
    content = re.sub(block, replacement, content)

    # 3. Adjacent registered gardens: g.lat / g.lng → g.display_lat / g.display_lng
    content = content.replace('if (!g.lat || !g.lng) continue;',
                              'if (!g.display_lat || !g.display_lng) continue;')
    content = content.replace('bounds.push([g.lat, g.lng]);',
                              'bounds.push([g.display_lat, g.display_lng]);')
    content = content.replace(
        'var adjMarker = L.marker([g.lat, g.lng], { icon: adjIcon }).addTo(_map);',
        'var adjMarker = L.marker([g.display_lat, g.display_lng], { icon: adjIcon }).addTo(_map);'
    )
    content = content.replace(
        'L.polyline([[displayLat, displayLng], [g.lat, g.lng]], {',
        'L.polyline([[displayLat, displayLng], [g.display_lat, g.display_lng]], {'
    )

    return content


def soften_privacy_copy(content):
    """Replace the precise-offset privacy claim with an accurate statement."""
    return content.replace(
        'Precise garden location — public visitors see an approximate map position (~250m offset)',
        'Garden location — your precise address is not displayed publicly'
    )


def process(path):
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()

    content = original
    content = strip_public_coords_fn(content)
    content = update_map_init(content)
    content = soften_privacy_copy(content)

    if content == original:
        return False, 'no changes detected'

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    return True, 'done'


updated, skipped = [], []
for garden in sorted(os.listdir(GARDENS_DIR)):
    if garden in SKIP:
        continue
    idx = os.path.join(GARDENS_DIR, garden, 'index.html')
    if not os.path.isfile(idx):
        continue
    ok, msg = process(idx)
    (updated if ok else skipped).append(f'{garden}: {msg}')

print(f'Updated ({len(updated)}):')
for s in updated:
    print(' ', s)
if skipped:
    print(f'Skipped ({len(skipped)}):')
    for s in skipped:
        print(' ', s)
