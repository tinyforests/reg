"""
canopy_fetch.py
Ecological Registry — Canopy Mapping · source data fetch step

Obtains the two inputs canopy_map.py needs for a property:

  1. PROPERTY BOUNDARY  — fully automated here.
     Vicmap Property parcel polygon via the Victorian open-data GeoServer WFS
     (layer `open-data-platform:parcel_view`). Given a lon/lat we fetch candidate
     parcels in a small bbox and select the one that contains the point.
     Stdlib only — no geospatial libraries required.

  2. CANOPY LAYER  — a documented download, not a live API.
     Vicmap Vegetation - Tree Extent is a raster distributed via DataShare
     (area-select order), so it cannot be queried by bbox. This script prints
     the exact order details; you download the GeoTIFF clip and hand it to
     canopy_map.py --raster.

Turnkey sequence:
  python scripts/canopy_fetch.py --lat -37.684537 --lng 145.193461 --out parcel.geojson
  #  → order + download a Tree Extent GeoTIFF for the parcel area (see printed steps)
  python scripts/canopy_map.py data/bushgarden.json \
    --raster tree_extent.tif --parcel parcel.geojson \
    --source "Vicmap Vegetation - Tree Extent" --source-date <vintage>

Privacy: a parcel boundary is precise property geometry. Keep parcel.geojson out
of the public repo; the profile overlay that consumes it is steward-gated.
"""

import argparse
import json
import math
import sys
import urllib.parse
import urllib.request

WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs"
PARCEL_LAYER = "open-data-platform:parcel_view"
TREE_DENSITY_LAYER = "open-data-platform:tree_density"  # vector canopy (Dense/Medium/Sparse), live via WFS

# Tree Extent (raster) — DataShare order, not a live service.
TREE_EXTENT_MD = "f6800447-ef34-5f66-acaa-77a5f2936546"
TREE_EXTENT_DATASHARE = "https://datashare.maps.vic.gov.au/search?md=" + TREE_EXTENT_MD

R_MERC = 6378137.0  # spherical mercator radius


def _merc(lon, lat):
    x = R_MERC * math.radians(lon)
    y = R_MERC * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def fetch_parcels_bbox(lon, lat, buffer_m):
    """WFS GetFeature over a small EPSG:3857 bbox around the point → GeoJSON (EPSG:4326)."""
    cx, cy = _merc(lon, lat)
    minx, miny, maxx, maxy = cx - buffer_m, cy - buffer_m, cx + buffer_m, cy + buffer_m
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": PARCEL_LAYER, "outputFormat": "application/json",
        "srsName": "EPSG:4326", "count": "100",
        "bbox": "%f,%f,%f,%f,EPSG:3857" % (minx, miny, maxx, maxy),
    }
    url = WFS + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "reg-canopy-fetch/1.0",
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def fetch_tree_density(lon, lat, buffer_m, classes):
    """Live canopy polygons from the Tree Density WFS (no DataShare). Returns
    (FeatureCollection filtered to `classes`, vintage string, total_before_filter)."""
    cx, cy = _merc(lon, lat)
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": TREE_DENSITY_LAYER, "outputFormat": "application/json",
        "srsName": "EPSG:4326", "count": "3000",
        "bbox": "%f,%f,%f,%f,EPSG:3857" % (cx - buffer_m, cy - buffer_m, cx + buffer_m, cy + buffer_m),
    }
    url = WFS + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "reg-canopy-fetch/1.0",
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as r:
        fc = json.loads(r.read().decode())
    all_feats = fc.get("features", [])
    keep = [f for f in all_feats
            if str((f.get("properties") or {}).get("tree_density", "")).lower() in classes]
    begins = [f["properties"].get("source_begin_date") for f in keep if f["properties"].get("source_begin_date")]
    ends = [f["properties"].get("source_end_date") for f in keep if f["properties"].get("source_end_date")]
    vintage = None
    if begins:
        b = min(begins)[:4]
        e = (max(ends)[:4] if ends else b)
        vintage = b if b == e else (b + "-" + e)
    return {"type": "FeatureCollection", "features": keep}, vintage, len(all_feats)


def _rings_contain(rings, lon, lat):
    """Even-odd point-in-polygon for a GeoJSON Polygon coordinate array (rings)."""
    inside = False
    outer = rings[0]
    if not _ring_contains(outer, lon, lat):
        return False
    for hole in rings[1:]:
        if _ring_contains(hole, lon, lat):
            return False  # inside a hole
    return True


def _ring_contains(ring, x, y):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def geom_contains(geom, lon, lat):
    t = geom.get("type")
    if t == "Polygon":
        return _rings_contain(geom["coordinates"], lon, lat)
    if t == "MultiPolygon":
        return any(_rings_contain(poly, lon, lat) for poly in geom["coordinates"])
    return False


def approx_area_m2(geom):
    """Equirectangular shoelace around the geometry centroid — fine for a single parcel."""
    def ring_area(ring, lat0):
        mx = math.cos(math.radians(lat0)) * 111320.0
        my = 110540.0
        a = 0.0
        for i in range(len(ring) - 1):
            x1, y1 = ring[i][0] * mx, ring[i][1] * my
            x2, y2 = ring[i + 1][0] * mx, ring[i + 1][1] * my
            a += x1 * y2 - x2 * y1
        return a / 2.0
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    lat0 = polys[0][0][0][1]
    total = 0.0
    for rings in polys:
        total += abs(ring_area(rings[0], lat0))
        for hole in rings[1:]:
            total -= abs(ring_area(hole, lat0))
    return total


def print_tree_extent_steps(lon, lat):
    print("\n--- Canopy layer: Vicmap Vegetation - Tree Extent (raster) ---")
    print("Tree Extent is a DataShare product, not a live API. To get the clip:")
    print("  1. Open:", TREE_EXTENT_DATASHARE)
    print("  2. Area-select around the parcel (point %.6f, %.6f)." % (lon, lat))
    print("  3. Download GeoTIFF (tree=1 / no-tree=0).")
    print("  4. RECORD THE CAPTURE VINTAGE from the tile metadata — pass it as --source-date.")
    print("Then:")
    print('  python scripts/canopy_map.py <garden.json> --raster <tree_extent.tif> \\')
    print('    --parcel <parcel.geojson> --source "Vicmap Vegetation - Tree Extent" --source-date <year>')
    print("Fallback (vector, coarser): Vicmap Tree Density VectorTileServer")
    print("  https://tiles.arcgis.com/tiles/GB33F62SbDxJjwEL/arcgis/rest/services/"
          "Vicmap_Vegetation_Tree_Density/VectorTileServer")


def main():
    ap = argparse.ArgumentParser(description="Fetch the Vicmap Property parcel for a point.")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lng", type=float, required=True)
    ap.add_argument("--out", default="parcel.geojson", help="output parcel GeoJSON path")
    ap.add_argument("--buffer-m", type=float, default=120.0, help="bbox half-size in metres")
    ap.add_argument("--expected-area-sqm", type=float, default=None,
                    help="warn if the parcel is >2x this (parcel vs garden-extent check)")
    ap.add_argument("--canopy-out", help="also fetch live Tree Density canopy polygons to this GeoJSON (no DataShare)")
    ap.add_argument("--canopy-classes", default="dense,medium", help="density classes to keep (default dense,medium)")
    ap.add_argument("--canopy-buffer-m", type=float, default=300.0, help="canopy bbox half-size in metres")
    ap.add_argument("--no-canopy-steps", action="store_true")
    args = ap.parse_args()

    try:
        fc = fetch_parcels_bbox(args.lng, args.lat, args.buffer_m)
    except Exception as e:
        sys.exit("ERROR: parcel WFS request failed: %s\n  (endpoint: %s)" % (e, WFS))

    feats = fc.get("features", [])
    hit = None
    for f in feats:
        g = f.get("geometry")
        if g and geom_contains(g, args.lng, args.lat):
            hit = f
            break
    if not hit:
        sys.exit("No parcel contained the point (%d candidates in bbox). "
                 "Try a larger --buffer-m or check lon/lat order." % len(feats))

    out = {"type": "FeatureCollection", "features": [hit]}
    with open(args.out, "w") as fh:
        json.dump(out, fh)
    area = approx_area_m2(hit["geometry"])
    print("Parcel found → %s" % args.out)
    print("  candidates in bbox: %d" % len(feats))
    print("  pfi: %s | approx parcel area: %s m²  (authoritative area from canopy_map.py in EPSG:7855)"
          % (hit.get("properties", {}).get("pfi", "?"), format(round(area), ",")))
    if args.expected_area_sqm and area > 2 * args.expected_area_sqm:
        print("  ! CAUTION: this cadastral parcel (%s m²) is much larger than the expected garden"
              % format(round(area), ","))
        print("    extent (%s m²). For a garden inside a large title (bush block adjoining remnant"
              % format(round(args.expected_area_sqm), ","))
        print("    land), decide the canopy boundary deliberately: full parcel (canopy dominated by")
        print("    bushland) vs a supplied garden-extent polygon. Cadastre can't tell them apart.")
    if args.canopy_out:
        classes = set(c.strip().lower() for c in args.canopy_classes.split(","))
        try:
            cfc, vintage, total = fetch_tree_density(args.lng, args.lat, args.canopy_buffer_m, classes)
        except Exception as e:
            sys.exit("ERROR: tree_density WFS request failed: %s" % e)
        with open(args.canopy_out, "w") as fh:
            json.dump(cfc, fh)
        cls = "+".join(sorted(classes))
        print("\nCanopy polygons → %s" % args.canopy_out)
        print("  kept %d of %d features (classes: %s)" % (len(cfc["features"]), total, cls))
        if not cfc["features"]:
            print("  WARN: no matching polygons in the canopy bbox — try a larger --canopy-buffer-m.")
        print("  dataset vintage: %s" % (vintage or "unknown (check attrs)"))
        print("  Next — the vector path (no DataShare):")
        print("    python scripts/canopy_map.py <garden.json> \\")
        print("      --parcel <garden_extent.geojson> --canopy %s --boundary-type garden_extent \\" % args.canopy_out)
        print('      --source "Vicmap Vegetation - Tree Density (%s)" --source-date %s'
              % (cls, vintage or "<year>"))
    elif not args.no_canopy_steps:
        print_tree_extent_steps(args.lng, args.lat)


if __name__ == "__main__":
    main()
