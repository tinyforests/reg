"""
canopy_map.py
Ecological Registry — Canopy Mapping · single authoritative calculation

Computes EXISTING mapped canopy for a registered property and writes the result
into the garden JSON's `canopy.existing` block. This is the ONE place canopy
metrics are derived — profile pages only display what this script stores
(mirrors the reg-score.js / sync_registry.py "single source of truth" principle).

    Canopy cover % = area(canopy ∩ property) / area(property) × 100

Three canopy states are kept strictly separate and this script only ever touches
EXISTING mapped canopy:
    existing  — remotely mapped from imagery / LiDAR / Vicmap vegetation datasets
    (history) — prior mapped/verified snapshots (never overwritten; appended)
    (projected) — modelled future crowns (a different pipeline entirely)

A physical site visit is NOT field verification of the spatial calculation:
verification_status stays `mapped_estimate`; the August-2026 visit is recorded
only as `field_context`.

--------------------------------------------------------------------------------
INPUTS
  garden.json      the Registry garden record to update
  --parcel FILE    property boundary polygon (GeoJSON, WGS84 lon/lat)
  --canopy FILE    canopy layer for the vector path (GeoJSON polygons, WGS84)
  --raster FILE    canopy layer for the raster path (GeoTIFF, tree=1/notree=0)
  --source TEXT    dataset name, e.g. "Vicmap Vegetation - Tree Extent"
  --source-date    dataset capture/vintage, e.g. "2020" (NEVER assume current)
  --resolution     e.g. "0.2 m raster" | "vector"

MODES
  (default)        compute + write canopy.existing into garden.json
  --dry-run        compute + print, write nothing
  --validate       check the canopy block shape only; needs no geo libraries

Recommended Victorian sources (see docs/canopy-mapping.md):
  Vicmap Vegetation - Tree Extent   raster, 20 cm, statewide tree presence  ← preferred
  Vicmap Vegetation - Tree Density  vector density-class polygons
  Property boundary                 Vicmap Property (cadastral parcel)

Geometry deps (only needed for real computation, not --validate):
  pip install shapely pyproj            # vector path
  pip install shapely pyproj rasterio   # + raster path
CRS: areas are computed in GDA2020 / MGA Zone 55 (EPSG:7855) for Victoria.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

# Victoria sits in MGA Zone 55. Projected metres → correct areas.
PROJECTED_CRS = "EPSG:7855"   # GDA2020 / MGA Zone 55
GEOGRAPHIC_CRS = "EPSG:4326"  # WGS84 lon/lat


def _iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _require(mod):
    try:
        return __import__(mod)
    except ImportError:
        sys.exit(
            "ERROR: '%s' is required for canopy computation but is not installed.\n"
            "       Run in an environment with the geospatial stack:\n"
            "         pip install shapely pyproj rasterio\n"
            "       (or use --validate, which needs no geo libraries)." % mod
        )


# --------------------------------------------------------------------------- #
# Geometry helpers (shapely + pyproj)                                          #
# --------------------------------------------------------------------------- #
def _load_projector():
    pyproj = _require("pyproj")
    return pyproj.Transformer.from_crs(GEOGRAPHIC_CRS, PROJECTED_CRS, always_xy=True)


def _project(geom, transformer):
    from shapely.ops import transform as shp_transform
    return shp_transform(lambda x, y, z=None: transformer.transform(x, y), geom)


def _read_geojson_geometry(path):
    """Union of all polygon geometries in a GeoJSON file (dedupes overlaps)."""
    _require("shapely")
    from shapely.geometry import shape
    from shapely.ops import unary_union
    with open(path) as f:
        gj = json.load(f)
    feats = gj.get("features", [gj]) if gj.get("type") != "Feature" else [gj]
    geoms = []
    for feat in feats:
        g = feat.get("geometry", feat)
        if g and g.get("type") in ("Polygon", "MultiPolygon"):
            geoms.append(shape(g))
    if not geoms:
        sys.exit("ERROR: no polygon geometry found in %s" % path)
    return unary_union(geoms)   # union → overlapping canopy is never double-counted


# --------------------------------------------------------------------------- #
# Vector path — canopy polygons intersected with the parcel                    #
# --------------------------------------------------------------------------- #
def compute_vector(parcel_path, canopy_path):
    transformer = _load_projector()
    parcel = _project(_read_geojson_geometry(parcel_path), transformer)
    canopy = _project(_read_geojson_geometry(canopy_path), transformer)

    parcel_area = parcel.area
    inside = canopy.intersection(parcel)                     # canopy within the boundary
    canopy_area = inside.area
    overhang = canopy.difference(parcel).intersection(parcel.buffer(30)).area  # spills just outside

    return {
        "property_area_sqm": round(parcel_area, 1),
        "canopy_area_sqm": round(canopy_area, 1),
        "canopy_cover_pct": round(canopy_area / parcel_area * 100, 1) if parcel_area else None,
        "canopy_overhang_sqm": round(overhang, 1),
        "source_type": "vector",
    }


# --------------------------------------------------------------------------- #
# Raster path — count tree cells within the parcel (e.g. Vicmap Tree Extent)   #
# --------------------------------------------------------------------------- #
def compute_raster(parcel_path, raster_path):
    rasterio = _require("rasterio")
    from rasterio.mask import mask as rio_mask
    from shapely.geometry import mapping
    import pyproj
    from shapely.ops import transform as shp_transform

    parcel_wgs = _read_geojson_geometry(parcel_path)
    with rasterio.open(raster_path) as src:
        to_raster = pyproj.Transformer.from_crs(GEOGRAPHIC_CRS, src.crs, always_xy=True)
        parcel = shp_transform(lambda x, y, z=None: to_raster.transform(x, y), parcel_wgs)
        out, _ = rio_mask(src, [mapping(parcel)], crop=True, filled=True, nodata=0)
        px_w, px_h = abs(src.res[0]), abs(src.res[1])

    band = out[0]
    tree_cells = int((band == 1).sum())
    cell_area = px_w * px_h
    canopy_area = tree_cells * cell_area
    # parcel area from projected geometry for an exact denominator
    proj = _project(parcel_wgs, _load_projector())
    parcel_area = proj.area

    return {
        "property_area_sqm": round(parcel_area, 1),
        "canopy_area_sqm": round(canopy_area, 1),
        "canopy_cover_pct": round(canopy_area / parcel_area * 100, 1) if parcel_area else None,
        "canopy_overhang_sqm": None,   # overhang needs the vector path
        "source_type": "raster",
        "resolution": "%.2f m raster" % px_w,
    }


# --------------------------------------------------------------------------- #
# Write result into the garden record                                         #
# --------------------------------------------------------------------------- #
EXISTING_KEYS = [
    "property_area_sqm", "canopy_area_sqm", "canopy_cover_pct", "canopy_overhang_sqm",
    "measurement_method", "source", "source_type", "source_date", "resolution",
    "calculated_at", "verification_status", "field_context_date",
    "field_context_note", "adjoins_remnant_vegetation", "notes",
]


def apply_result(record, metrics, source, source_date, resolution):
    canopy = record.setdefault("canopy", {})
    existing = canopy.setdefault("existing", {})

    # If a real prior measurement exists, snapshot it into history before overwriting.
    if existing.get("canopy_cover_pct") is not None:
        canopy.setdefault("history", []).append({
            "date": existing.get("source_date") or existing.get("calculated_at"),
            "canopy_cover_pct": existing.get("canopy_cover_pct"),
            "verification_status": existing.get("verification_status"),
            "source": existing.get("source"),
        })

    existing.update(metrics)
    existing["measurement_method"] = "remote_spatial_mapping"
    existing["source"] = source
    existing["source_date"] = source_date
    if resolution:
        existing["resolution"] = resolution
    existing["calculated_at"] = _iso_now()
    existing["verification_status"] = "mapped_estimate"   # remote mapping is NEVER field-verified here
    return record


def validate(record):
    ex = (record.get("canopy") or {}).get("existing")
    if not isinstance(ex, dict):
        sys.exit("VALIDATE: no canopy.existing block found.")
    missing = [k for k in EXISTING_KEYS if k not in ex]
    print("VALIDATE: canopy.existing present.")
    print("  verification_status:", ex.get("verification_status"))
    print("  field_context_date :", ex.get("field_context_date"))
    print("  missing keys       :", missing or "none")
    if ex.get("verification_status") not in (
        "mapped_estimate", "steward_confirmed", "designer_confirmed", "field_verified"
    ):
        print("  WARNING: unexpected verification_status")
    return not missing


def main():
    ap = argparse.ArgumentParser(description="Compute existing mapped canopy for a Registry property.")
    ap.add_argument("garden", help="path to the garden JSON record")
    ap.add_argument("--parcel", help="property boundary GeoJSON (WGS84)")
    ap.add_argument("--canopy", help="canopy polygons GeoJSON for the vector path")
    ap.add_argument("--raster", help="canopy GeoTIFF for the raster path (tree=1)")
    ap.add_argument("--source", default="Vicmap Vegetation - Tree Extent")
    ap.add_argument("--source-date", dest="source_date", help="dataset vintage, e.g. 2020")
    ap.add_argument("--resolution", help='e.g. "0.2 m raster"')
    ap.add_argument("--dry-run", action="store_true", help="compute + print, write nothing")
    ap.add_argument("--validate", action="store_true", help="check the block shape only (no geo libs)")
    args = ap.parse_args()

    with open(args.garden) as f:
        record = json.load(f)

    if args.validate:
        sys.exit(0 if validate(record) else 1)

    if not args.source_date:
        sys.exit("ERROR: --source-date is required (never present a dataset without its vintage).")

    if args.raster:
        metrics = compute_raster(args.parcel, args.raster)
    elif args.parcel and args.canopy:
        metrics = compute_vector(args.parcel, args.canopy)
    else:
        sys.exit("ERROR: provide --raster, or both --parcel and --canopy.")

    record = apply_result(record, metrics, args.source, args.source_date,
                          args.resolution or metrics.get("resolution"))
    ex = record["canopy"]["existing"]
    print("Canopy (existing, mapped_estimate):")
    print("  %s%% — %s m² of %s m²" % (
        ex["canopy_cover_pct"], ex["canopy_area_sqm"], ex["property_area_sqm"]))
    print("  source: %s (%s) · %s" % (ex["source"], ex["source_date"], ex.get("resolution") or ex["source_type"]))

    if args.dry_run:
        print("(dry-run — garden.json not written)")
        return
    with open(args.garden, "w") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("Written to", args.garden)


if __name__ == "__main__":
    main()
