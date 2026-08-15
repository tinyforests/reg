"""
Generate data/private/admin_map.html — a self-contained local admin map.
Open the output file directly in a browser (no server needed).

Shows all gardens from data/private/coords.json as precise pins on a
satellite map. Popup shows name, ID, suburb, and address (if stored
in coords.json under an "address" key).

To add an address to a garden, edit data/private/coords.json:
  "ER-AU-VIC-SH-ARU-0001": {
    "lat": -37.831,
    "lng": 145.094,
    "address": "12 Example St, Surrey Hills VIC 3127"
  }
"""
import json, glob, os, sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIVATE_DIR = os.path.join(REPO_ROOT, 'data', 'private')
COORDS_FILE = os.path.join(PRIVATE_DIR, 'coords.json')
OUTPUT = os.path.join(PRIVATE_DIR, 'admin_map.html')

if not os.path.exists(COORDS_FILE):
    sys.exit('ERROR: data/private/coords.json not found.')

coords = json.load(open(COORDS_FILE))

# Build garden lookup from data/*.json files
skip = {'registry.json', 'species.json', 'evc-demand.json', 'badge-definitions.json'}
garden_meta = {}
for path in glob.glob(os.path.join(REPO_ROOT, 'data', '*.json')):
    fname = os.path.basename(path)
    if fname in skip:
        continue
    try:
        d = json.load(open(path))
        gid = d.get('garden_id', '')
        if gid:
            garden_meta[gid] = {
                'garden_name': d.get('garden_name', gid),
                'suburb':      d.get('suburb', ''),
                'score':       d.get('_score', '--'),
            }
    except Exception:
        pass

# Merge into a list for embedding
gardens = []
for gid, c in sorted(coords.items()):
    meta = garden_meta.get(gid, {})
    gardens.append({
        'garden_id':   gid,
        'garden_name': meta.get('garden_name', gid),
        'suburb':      meta.get('suburb', ''),
        'score':       meta.get('score', '--'),
        'address':     c.get('address', ''),
        'lat':         c['lat'],
        'lng':         c['lng'],
    })

gardens_json = json.dumps(gardens, indent=2)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ER Admin Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: "IBM Plex Sans", sans-serif; background: #1a1a1a; color: #fff0dc; height: 100vh; display: flex; flex-direction: column; }}
  #header {{ padding: .75rem 1.25rem; background: #3d4535; font-size: .85rem; display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }}
  #header strong {{ font-size: 1rem; }}
  #header span {{ opacity: .6; font-size: .75rem; }}
  #map {{ flex: 1; }}
  .leaflet-popup-content-wrapper {{ background: #2a2e22; color: #fff0dc; border: 1px solid #7a9e5f; border-radius: 0; }}
  .leaflet-popup-tip {{ background: #2a2e22; }}
  .popup-name {{ font-size: .95rem; font-weight: 600; margin-bottom: .35rem; color: #fff0dc; }}
  .popup-id {{ font-size: .7rem; font-family: "IBM Plex Mono", monospace; color: #7a9e5f; margin-bottom: .35rem; }}
  .popup-row {{ font-size: .78rem; margin-bottom: .2rem; opacity: .8; }}
  .popup-address {{ font-size: .8rem; margin-top: .4rem; padding-top: .4rem; border-top: 1px solid rgba(122,158,95,.3); }}
  .popup-address.missing {{ opacity: .4; font-style: italic; }}
  .admin-pin {{ width: 14px; height: 14px; background: #7a9e5f; border: 2px solid #fff0dc; border-radius: 50%; }}
</style>
</head>
<body>
<div id="header">
  <strong>Ecological Registry — Admin Map</strong>
  <span>Precise locations · {len(gardens)} gardens · Do not share</span>
</div>
<div id="map"></div>
<script>
var GARDENS = {gardens_json};

var map = L.map('map', {{
  zoom: 13,
  zoomControl: true,
  scrollWheelZoom: true,
  attributionControl: true
}});

// Satellite tiles (Esri World Imagery)
L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}',
  {{ maxZoom: 20, attribution: 'Tiles &copy; Esri' }}
).addTo(map);

// Labels overlay
L.tileLayer(
  'https://{{s}}.basemaps.cartocdn.com/dark_only_labels/{{z}}/{{x}}/{{y}}{{r}}.png',
  {{ maxZoom: 20, subdomains: 'abcd', opacity: 0.8 }}
).addTo(map);

var pinIcon = L.divIcon({{ className: '', html: '<div class="admin-pin"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }});

var bounds = [];
GARDENS.forEach(function(g) {{
  var marker = L.marker([g.lat, g.lng], {{ icon: pinIcon }}).addTo(map);
  var addr = g.address
    ? '<div class="popup-address">' + g.address + '</div>'
    : '<div class="popup-address missing">No address stored — add to coords.json</div>';
  marker.bindPopup(
    '<div class="popup-name">' + g.garden_name + '</div>' +
    '<div class="popup-id">' + g.garden_id + '</div>' +
    (g.suburb ? '<div class="popup-row">' + g.suburb + '</div>' : '') +
    '<div class="popup-row">Score: ' + g.score + '</div>' +
    '<div class="popup-row" style="font-family:monospace;font-size:.7rem;opacity:.5">' + g.lat.toFixed(6) + ', ' + g.lng.toFixed(6) + '</div>' +
    addr
  );
  bounds.push([g.lat, g.lng]);
}});

if (bounds.length) map.fitBounds(bounds, {{ padding: [40, 40] }});
</script>
</body>
</html>"""

os.makedirs(PRIVATE_DIR, exist_ok=True)
open(OUTPUT, 'w').write(html)
print(f'Written: {OUTPUT}')
print(f'Gardens: {len(gardens)}')
missing_addr = [g['garden_id'] for g in gardens if not g['address']]
if missing_addr:
    print(f'Missing address ({len(missing_addr)}): {", ".join(missing_addr)}')
