#!/usr/bin/env python3
"""
apply_privacy.py
Apply privacy-first changes to all garden profile pages:
  - Remove steward names from public render; show when steward-claimed device
  - Fuzz map coordinates for public view; precise for stewards
  - Add steward privacy panel HTML
"""

import os
import re

GARDENS_DIR = os.path.join(os.path.dirname(__file__), '..', 'gardens')

# -- Replacement strings --

STEWARD_LABEL_OLD = '>Stewards<'
STEWARD_LABEL_NEW = '>Steward<'

# Standard heroStewards line (19 profiles)
STEWARD_JS_OLD = "txt('heroStewards', R.stewards + ' - Registered ' + R.baseline_date);"
# foresthillk variant
STEWARD_JS_OLD_FHK = "txt('heroStewards', R.stewards + ' — ' + R.suburb + ' · Whitehorse');"

STEWARD_JS_NEW = """\
  if (_isSt) {
    txt('heroStewards', R.stewards || '—');
  } else {
    var _hs = document.getElementById('heroStewards');
    if (_hs) _hs.innerHTML = '<span style="opacity:.4">—</span>';
  }"""

# Add _isSt variable after the fauna line that appears in all profiles
FAUNA_LINE = "  var fauna = h.fauna_sightings || [];"
IST_INSERT = """\
  var fauna = h.fauna_sightings || [];
  var _isSt = (typeof isSteward === 'function') && isSteward(R.garden_id);"""

# publicCoords function to insert before the MAP section
MAP_COMMENT = "/* ---- MAP ---- */"
PUBLIC_COORDS_BLOCK = """\
/* Deterministic ~250m offset so the public map pin does not reveal the exact property.
   Stewards who have claimed this profile see the precise coordinates. */
function _publicCoords(lat, lng, gardenId) {
  var h = 0;
  for (var i = 0; i < gardenId.length; i++) {
    h = (h * 31 + gardenId.charCodeAt(i)) & 0xFFFFFF;
  }
  var dlat = ((h & 0xFF) / 255 - 0.5) * 0.005;
  var dlng = ((h >> 8 & 0xFF) / 255 - 0.5) * 0.006;
  return [lat + dlat, lng + dlng];
}

/* ---- MAP ---- */"""

# Inside initCorridorMap, after "var lng = c.lng;" add display coord logic
MAP_LNG_LINE = "  var lng = c.lng;"
MAP_DISPLAY_INSERT = """\
  var lng = c.lng;

  var _isStewardMap = (typeof isSteward === 'function') && isSteward(record.garden_id || '');
  var displayLat = lat;
  var displayLng = lng;
  if (!_isStewardMap && lat && lng) {
    var _fc = _publicCoords(lat, lng, record.garden_id || '');
    displayLat = _fc[0];
    displayLng = _fc[1];
  }"""

# Targeted lat/lng replacements inside initCorridorMap
MAP_CENTER_OLD = "    center: [lat, lng],"
MAP_CENTER_NEW = "    center: [displayLat, displayLng],"

MAP_BOUNDS_OLD = "  var bounds = [[lat, lng]];"
MAP_BOUNDS_NEW = "  var bounds = [[displayLat, displayLng]];"

MAP_PRIMARY_OLD = "  var primary = L.marker([lat, lng], { icon: regIcon }).addTo(_map);"
MAP_PRIMARY_NEW = "  var primary = L.marker([displayLat, displayLng], { icon: regIcon }).addTo(_map);"

MAP_PARK_POLY_OLD = "    L.polyline([[lat, lng], [c.park_lat, c.park_lng]], {"
MAP_PARK_POLY_NEW = "    L.polyline([[displayLat, displayLng], [c.park_lat, c.park_lng]], {"

MAP_ADJ_POLY_OLD = "    L.polyline([[lat, lng], [g.lat, g.lng]], {"
MAP_ADJ_POLY_NEW = "    L.polyline([[displayLat, displayLng], [g.lat, g.lng]], {"

# After initCorridorMap(R) call, show privacy panel for stewards
INIT_MAP_CALL = "  initCorridorMap(R);"
INIT_MAP_WITH_PANEL = """\
  initCorridorMap(R);

  if (_isSt) {
    var _pp = document.getElementById('stewardPrivacyPanel');
    if (_pp) _pp.style.display = 'block';
  }"""

# Privacy panel HTML to insert before </main>
PRIVACY_PANEL_HTML = """\

  <!-- Steward-only privacy panel — hidden publicly; revealed via JS when this device is claimed -->
  <section id="stewardPrivacyPanel" style="display:none" class="stagger">
    <div class="border border-rl dark:border-rdl bg-white dark:bg-rdp p-6 md:p-8">
      <div class="section-label mb-1">This device is linked to this garden</div>
      <h2 class="font-serif text-3xl mb-5">Your Privacy</h2>
      <div class="grid md:grid-cols-2 gap-8 text-sm">
        <div>
          <div class="section-label mb-3">Visible only to you on this device</div>
          <ul class="space-y-2 opacity-75">
            <li>Your name</li>
            <li>Precise garden location — public visitors see an approximate map position (~250m offset)</li>
          </ul>
        </div>
        <div>
          <div class="section-label mb-3">Visible to everyone</div>
          <ul class="space-y-2 opacity-75">
            <li>Garden name and ecological data</li>
            <li>Suburb and state</li>
            <li>Score, badges, and species list</li>
            <li>Field notes and activity log</li>
          </ul>
        </div>
      </div>
      <div class="mt-6 pt-5 border-t border-rl dark:border-rdl text-xs opacity-50">
        To change what's public, contact Gardener &amp; Son.
      </div>
    </div>
  </section>

</main>"""

MAIN_CLOSE = "</main>"


def apply(content):
    changed = []

    # 1. Label fix
    if STEWARD_LABEL_OLD in content:
        content = content.replace(STEWARD_LABEL_OLD, STEWARD_LABEL_NEW, 1)
        changed.append('label')

    # 2. Add _isSt variable after fauna line
    if FAUNA_LINE in content and '_isSt' not in content:
        content = content.replace(FAUNA_LINE, IST_INSERT, 1)
        changed.append('_isSt')

    # 3. heroStewards JS — standard variant
    if STEWARD_JS_OLD in content:
        content = content.replace(STEWARD_JS_OLD, STEWARD_JS_NEW, 1)
        changed.append('heroStewards-std')

    # 3b. heroStewards JS — foresthillk variant
    if STEWARD_JS_OLD_FHK in content:
        content = content.replace(STEWARD_JS_OLD_FHK, STEWARD_JS_NEW, 1)
        changed.append('heroStewards-fhk')

    # 4. publicCoords function
    if MAP_COMMENT in content and '_publicCoords' not in content:
        content = content.replace(MAP_COMMENT, PUBLIC_COORDS_BLOCK, 1)
        changed.append('publicCoords')

    # 5. displayLat/displayLng inside initCorridorMap
    if MAP_LNG_LINE in content and 'displayLat' not in content:
        content = content.replace(MAP_LNG_LINE, MAP_DISPLAY_INSERT, 1)
        changed.append('displayCoords')

    # 6. Map center
    if MAP_CENTER_OLD in content:
        content = content.replace(MAP_CENTER_OLD, MAP_CENTER_NEW)
        changed.append('mapCenter')

    # 7. Bounds
    if MAP_BOUNDS_OLD in content:
        content = content.replace(MAP_BOUNDS_OLD, MAP_BOUNDS_NEW)
        changed.append('mapBounds')

    # 8. Primary marker
    if MAP_PRIMARY_OLD in content:
        content = content.replace(MAP_PRIMARY_OLD, MAP_PRIMARY_NEW)
        changed.append('primaryMarker')

    # 9. Park polyline
    if MAP_PARK_POLY_OLD in content:
        content = content.replace(MAP_PARK_POLY_OLD, MAP_PARK_POLY_NEW)
        changed.append('parkPoly')

    # 10. Adjacent polylines
    if MAP_ADJ_POLY_OLD in content:
        content = content.replace(MAP_ADJ_POLY_OLD, MAP_ADJ_POLY_NEW)
        changed.append('adjPoly')

    # 11. Show privacy panel after initCorridorMap
    if INIT_MAP_CALL in content and 'stewardPrivacyPanel' not in content:
        content = content.replace(INIT_MAP_CALL, INIT_MAP_WITH_PANEL, 1)
        changed.append('panelShow')

    # 12. Privacy panel HTML before </main>
    # Check specifically for the section tag, not just the id (which was already added by panelShow JS)
    if MAIN_CLOSE in content and '<section id="stewardPrivacyPanel"' not in content:
        idx = content.rfind(MAIN_CLOSE)
        content = content[:idx] + PRIVACY_PANEL_HTML + content[idx + len(MAIN_CLOSE):]
        changed.append('panelHTML')

    return content, changed


def main():
    profiles = []
    for name in sorted(os.listdir(GARDENS_DIR)):
        path = os.path.join(GARDENS_DIR, name, 'index.html')
        if os.path.isfile(path):
            profiles.append((name, path))

    for name, path in profiles:
        with open(path, 'r', encoding='utf-8') as f:
            original = f.read()

        updated, changes = apply(original)

        if changes:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(updated)
            print(f'  {name}: {", ".join(changes)}')
        else:
            print(f'  {name}: no changes needed')


if __name__ == '__main__':
    main()
