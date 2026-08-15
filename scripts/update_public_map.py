"""
Update all public garden profiles:
  - Replace invisible div-icon marker with a 75m indicator circle
  - Lock all zoom interactions (public map shows fixed view only)
  - Remove stale dev comments
"""
import glob, os, sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD_MAP_OPTIONS = (
    '  _map = L.map(\'corridorMap\', {\n'
    '    center: [displayLat, displayLng],\n'
    '    zoom: 14,\n'
    '    zoomControl: true,\n'
    '    scrollWheelZoom: false,\n'
    '    attributionControl: false\n'
    '  });'
)

NEW_MAP_OPTIONS = (
    '  _map = L.map(\'corridorMap\', {\n'
    '    center: [displayLat, displayLng],\n'
    '    zoom: 14,\n'
    '    zoomControl: false,\n'
    '    scrollWheelZoom: false,\n'
    '    touchZoom: false,\n'
    '    doubleClickZoom: false,\n'
    '    boxZoom: false,\n'
    '    keyboard: false,\n'
    '    attributionControl: false\n'
    '  });'
)

OLD_MARKER_BLOCK = (
    '  /* Primary garden marker */\n'
    '  var regIcon = L.divIcon({ className: \'reg-marker\', iconSize: [60,60] });\n'
    '  var primary = L.marker([displayLat, displayLng], { icon: regIcon }).addTo(_map);\n'
    '  primary.bindPopup(\n'
    '    \'<strong>\' + (record.garden_name || \'This garden\') + \'</strong><br>\' +\n'
    '    (record.garden_id || \'\') + \'<br>\' +\n'
    '    \'<span style="color:#7a9e5f">Score: \' + (record._score || \'--\') + \'</span>\'\n'
    '  );'
)

NEW_CIRCLE_BLOCK = (
    '  /* Approximate location circle — no precise pin on public map */\n'
    '  var primaryCircle = L.circle([displayLat, displayLng], {\n'
    '    radius: 75,\n'
    '    color: \'#3d4535\',\n'
    '    fillColor: \'#7a9e5f\',\n'
    '    fillOpacity: 0.15,\n'
    '    weight: 1.5,\n'
    '    opacity: 0.5\n'
    '  }).addTo(_map);'
)

OLD_COMMENTS = (
    '  // display_lat/display_lng are pre-baked by sync_registry.py — no client-side offset needed.\n'
    '  // TODO: stewards see fuzzed pin for now; fetch precise coords from Apps Script get_precise_coords.\n'
)

fixed = skipped = 0
for path in sorted(glob.glob(os.path.join(REPO_ROOT, 'gardens', '*', 'index.html'))):
    garden = os.path.basename(os.path.dirname(path))
    content = open(path).read()

    changed = False

    if OLD_COMMENTS in content:
        content = content.replace(OLD_COMMENTS, '')
        changed = True

    if OLD_MAP_OPTIONS in content:
        content = content.replace(OLD_MAP_OPTIONS, NEW_MAP_OPTIONS)
        changed = True
    else:
        print(f'  WARNING: map options pattern not found in {garden}')

    if OLD_MARKER_BLOCK in content:
        content = content.replace(OLD_MARKER_BLOCK, NEW_CIRCLE_BLOCK)
        changed = True
    else:
        print(f'  WARNING: marker block pattern not found in {garden}')

    if changed:
        open(path, 'w').write(content)
        print(f'  fixed: {garden}')
        fixed += 1
    else:
        print(f'  skip:  {garden}')
        skipped += 1

print(f'\nDone — {fixed} updated, {skipped} skipped.')
