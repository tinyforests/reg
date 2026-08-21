"""
habitat_value.py
Ecological Registry — Habitat Value (DEECA / NatureKit) lookup + provenance

Habitat Value is a statewide 0-100 relative biodiversity ranking (DEECA, served
via NatureKit). It is LANDSCAPE CONTEXT — how strategically important the location
is for biodiversity — NOT a measurement of the garden itself. It never touches the
ecological score.

Source (live ArcGIS raster MapServer, ~75 m resolution, GDA2020 Vicgrid):
  https://biod-gis.mapshare.vic.gov.au/arcgis/rest/services/NatureKit/habitat_value/MapServer
Point `identify` returns the pixel value at a coordinate (0-100), or "NoData".
Verified: CBD/plains = 0 (real low), bushland = high, water = NoData (≠ 0).

Modes:
  --lat L --lng N                 print a lookup + provenance (single point)
  <garden.json> --lat L --lng N   write habitat_context into the record
  --batch                         look up every registered garden (get_all_coords,
                                  admin token) and print an internal distribution
                                  report — writes to NO public record
Stdlib only — the service does the spatial work.

Failure handling (never substitute 0 for missing — missing and zero are different):
  missing coords · service error · outside Victoria · NoData → distinct states.
"""

import argparse
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HV_SERVICE = ("https://biod-gis.mapshare.vic.gov.au/arcgis/rest/services/"
              "NatureKit/habitat_value/MapServer")
SOURCE = "DEECA Habitat Value"
SOURCE_SERVICE = "NatureKit"
RESOLUTION_M = 75
SCALE = "0-100"

# REG provisional banding — NOT an official DEECA classification. DEECA does not
# publish simple public thresholds for Habitat Value; these are cautious Registry
# language only, kept alongside (never replacing) the raw number.
BANDS = [(0, 19, "Low"), (20, 39, "Moderate"), (40, 59, "Significant"),
         (60, 79, "High"), (80, 100, "Very High")]


def _iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "reg-habitat-value/1.0",
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def service_version():
    try:
        di = _get(HV_SERVICE + "?f=json").get("documentInfo", {})
        return di.get("Version")
    except Exception:
        return None


def identify(lng, lat):
    """Return (state, value). state ∈ value|nodata|no_result|error; value is int|None."""
    params = {
        "geometry": json.dumps({"x": lng, "y": lat}),
        "geometryType": "esriGeometryPoint", "sr": "4326", "layers": "all:0",
        "tolerance": "1",
        "mapExtent": "%f,%f,%f,%f" % (lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01),
        "imageDisplay": "400,400,96", "returnGeometry": "false", "f": "json",
    }
    url = HV_SERVICE + "/identify?" + urllib.parse.urlencode(params)
    try:
        d = _get(url)
    except Exception:
        return "error", None
    results = d.get("results", [])
    if not results:
        return "no_result", None      # outside coverage / no cell
    raw = (results[0].get("attributes") or {}).get("Stretch.Pixel Value")
    if raw is None:
        return "no_result", None
    if str(raw).strip().lower() == "nodata":
        return "nodata", None          # e.g. water — NOT zero
    try:
        return "value", int(round(float(raw)))
    except (TypeError, ValueError):
        return "error", None


def band_for(v):
    if v is None:
        return None
    for lo, hi, name in BANDS:
        if lo <= v <= hi:
            return name
    return None


def local_context(lng, lat, radius_m, ring=8):
    """Mean of centre + `ring` points on a circle of radius_m. Averages only real
    (non-NoData) values. Returns (mean|None, samples_used, samples_total)."""
    dlat = radius_m / 111320.0
    dlng = radius_m / (111320.0 * max(math.cos(math.radians(lat)), 1e-6))
    pts = [(lng, lat)]
    for i in range(ring):
        a = 2 * math.pi * i / ring
        pts.append((lng + dlng * math.cos(a), lat + dlat * math.sin(a)))
    vals = []
    for x, y in pts:
        st, v = identify(x, y)
        if st == "value":
            vals.append(v)
    if not vals:
        return None, 0, len(pts)
    return round(sum(vals) / len(vals), 1), len(vals), len(pts)


def lookup(lng, lat, radius_m=250, want_context=True):
    """Full lookup at a coordinate. Never returns 0 for a missing value."""
    state, centroid = identify(lng, lat)
    out = {
        "centroid_state": state,
        "centroid_value": centroid,
        "local_context_mean": None,
        "local_context_radius_m": None,
        "local_context_samples": None,
    }
    if want_context and state in ("value", "nodata"):
        mean, used, total = local_context(lng, lat, radius_m)
        out["local_context_mean"] = mean
        out["local_context_radius_m"] = radius_m
        out["local_context_samples"] = "%d/%d" % (used, total)
    return out


def build_block(lng, lat, radius_m, version, lookup_method="property_centroid+local_context"):
    lk = lookup(lng, lat, radius_m)
    value = lk["centroid_value"]           # public headline = centroid cell value
    block = {
        "habitat_value": {
            "value": value,
            "scale": SCALE,
            "band": band_for(value),
            "band_note": "REG provisional banding — not an official DEECA classification.",
            "lookup_method": lookup_method,
            "source": SOURCE,
            "source_service": SOURCE_SERVICE,
            "source_url": HV_SERVICE,
            "dataset_version": version,
            "dataset_date": None,          # DEECA does not expose a capture date on the service
            "resolution_m": RESOLUTION_M,
            "calculated_at": _iso_now(),
            "state": lk["centroid_state"],  # value|nodata|no_result|error
            # internal detail (not necessarily surfaced publicly)
            "centroid_value": lk["centroid_value"],
            "local_context_mean": lk["local_context_mean"],
            "local_context_radius_m": lk["local_context_radius_m"],
            "local_context_samples": lk["local_context_samples"],
        }
    }
    return block


# --------------------------------------------------------------------------- #
def fetch_all_coords():
    """Best coord per VIC garden: precise from get_all_coords (admin) where available,
    else the record's display (privacy-fuzzed) coord. Each tagged with its source so
    the report is honest about precision. Returns {gid: {lat,lng,src}}."""
    import glob
    import pull_live_records as p  # sibling in scripts/ (sys.path[0] when run as a script)

    merged = {}
    # 1. display coords from static records (approximate — fine for an internal spread)
    for fpath in glob.glob(os.path.join(os.path.dirname(__file__), "..", "data", "*.json")):
        try:
            rec = json.load(open(fpath))
        except Exception:
            continue
        if not isinstance(rec, dict):
            continue
        gid = rec.get("garden_id")
        c = rec.get("connectivity") or {}
        lat = c.get("display_lat", c.get("lat"))
        lng = c.get("display_lng", c.get("lng"))
        if gid and lat is not None and lng is not None and "-VIC-" in gid:
            merged[gid] = {"lat": lat, "lng": lng, "src": "display"}

    # 2. precise from each live record's connectivity.lat/lng (admin/precise field,
    #    distinct from the fuzzed display_lat/lng)
    for gid in list(merged):
        try:
            u = p.ENDPOINT + "?" + urllib.parse.urlencode(
                {"action": "get_garden_record", "garden_id": gid, "_cb": str(int(__import__("time").time() * 1000))})
            rec = (_get(u, timeout=30) or {}).get("data") or {}
            c = rec.get("connectivity") or {}
            if c.get("lat") is not None and c.get("lng") is not None:
                merged[gid] = {"lat": c["lat"], "lng": c["lng"], "src": "precise"}
        except Exception:
            pass

    # 3. overlay the authoritative Garden Coords sheet (most trusted precise)
    tok = os.environ.get("ER_ADMIN_TOKEN")
    if tok:
        try:
            url = p.ENDPOINT + "?" + urllib.parse.urlencode({"action": "get_all_coords", "admin_token": tok})
            d = _get(url, timeout=45)
            for gid, c in (d.get("coords", {}) if d.get("ok") else {}).items():
                if c.get("lat") is not None and c.get("lng") is not None:
                    merged[gid] = {"lat": c["lat"], "lng": c["lng"], "src": "precise"}
        except Exception:
            pass
    return merged


def batch():
    version = service_version()
    coords = fetch_all_coords()
    print("Habitat Value — internal batch (DEECA/NatureKit v%s, %sm, %s)\n" % (version, RESOLUTION_M, SCALE))
    print("  %-26s %-5s %-10s %-7s %-8s %s" % ("garden_id", "HV", "band", "local", "coord", "state"))
    print("  " + "-" * 72)
    rows, values = [], []
    for gid, c in sorted(coords.items()):
        lat, lng, src = c.get("lat"), c.get("lng"), c.get("src")
        if lat is None or lng is None:
            print("  %-26s %-5s %-10s %-7s %-8s %s" % (gid, "-", "-", "-", src or "-", "missing_coords"))
            rows.append((gid, None, "missing_coords", src)); continue
        lk = lookup(lng, lat)
        v, st = lk["centroid_value"], lk["centroid_state"]
        print("  %-26s %-5s %-10s %-7s %-8s %s" % (gid, v if v is not None else "-",
              band_for(v) or "-", lk["local_context_mean"] if lk["local_context_mean"] is not None else "-", src, st))
        rows.append((gid, v, st, src))
        if st == "value":
            values.append(v)

    print("\nDistribution (n=%d with a real value; %d total records):" % (len(values), len(rows)))
    if values:
        s = sorted(values)
        n = len(s)
        median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
        print("  min %d · max %d · mean %.1f · median %s" % (min(s), max(s), sum(s) / n, median))
        # coarse histogram by band
        from collections import Counter
        hist = Counter(band_for(v) for v in values)
        for _, _, name in BANDS:
            print("    %-11s %s" % (name, "#" * hist.get(name, 0) + (" %d" % hist.get(name, 0) if hist.get(name) else " 0")))
    states = {}
    srcs = {}
    for _gid, _v, st, src in rows:
        states[st] = states.get(st, 0) + 1
        srcs[src] = srcs.get(src, 0) + 1
    print("  states:", states, "· coord sources:", srcs)
    print("  NOTE: 'display' coords are privacy-fuzzed — approximate context only; "
          "'precise' rows are property-accurate. Internal review only; not published.")
    return rows


def main():
    ap = argparse.ArgumentParser(description="Habitat Value (DEECA/NatureKit) lookup.")
    ap.add_argument("garden", nargs="?", help="garden JSON to write habitat_context into")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lng", type=float)
    ap.add_argument("--radius-m", type=float, default=250.0, help="local context radius")
    ap.add_argument("--batch", action="store_true", help="internal batch over all gardens (no writes)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.batch:
        batch(); return

    if args.lat is None or args.lng is None:
        sys.exit("ERROR: provide --lat and --lng (or --batch).")

    version = service_version()
    block = build_block(args.lng, args.lat, args.radius_m, version)
    hv = block["habitat_value"]
    print("Habitat Value: %s / 100  (%s)" % (hv["value"] if hv["value"] is not None else "—", hv["band"] or hv["state"]))
    print("  local context (%sm): %s · samples %s" % (hv["local_context_radius_m"],
          hv["local_context_mean"], hv["local_context_samples"]))
    print("  source: %s · %s v%s · %sm · state=%s" % (hv["source"], hv["source_service"],
          hv["dataset_version"], hv["resolution_m"], hv["state"]))

    if not args.garden:
        return
    with open(args.garden) as f:
        record = json.load(f)
    if hv["state"] not in ("value", "nodata"):
        sys.exit("Refusing to write: lookup state is '%s' (never store a guessed value)." % hv["state"])
    record.setdefault("habitat_context", {}).update(block)
    if args.dry_run:
        print("(dry-run — not written)"); return
    with open(args.garden, "w") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("Written to", args.garden)


if __name__ == "__main__":
    main()
