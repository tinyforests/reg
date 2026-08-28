#!/usr/bin/env python3
"""
audit_areas.py — PHASE 1 BLOCKER.

Under Method v1, a wrong area_sqm is a display inaccuracy.
Under Method v2, area feeds the site envelope, the class derivation and EC.
So this has to be clean before a single shadow score means anything.

Reconciles area figures across the live Registry records, flags every value
that cannot be trusted, and emits a field-verification worksheet.

    python3 v2/audit_areas.py --data data/gardens
    python3 v2/audit_areas.py --data data/gardens --csv area-audit.csv

Reports, never writes to a record. sync_registry.py remains the only writer.
"""
import argparse
import csv
import json
import math
import os
import sys

# Known-bad records carried forward from the v1 backlog. These are flagged
# regardless of what the automated checks say.
KNOWN_SUSPECT = ["arundel", "middlesex", "sir garnet", "sir-garnet"]

AREA_KEYS = ["area_sqm", "area_m2", "area", "land_area_sqm", "garden_area_sqm"]


def get_area(rec):
    for k in AREA_KEYS:
        if k in rec and isinstance(rec[k], (int, float)):
            return k, float(rec[k])
    return None, None


def species_count(rec):
    for k in ("species", "plants", "species_list", "planting"):
        v = rec.get(k)
        if isinstance(v, list):
            return len(v)
        if isinstance(v, int):
            return v
    for k in ("species_count", "indigenous_species_count"):
        if isinstance(rec.get(k), int):
            return rec[k]
    return None


def audit(records):
    rows = []
    areas = [a for _, a in (get_area(r) for r in records) if a]
    median = sorted(areas)[len(areas) // 2] if areas else 0

    for rec in records:
        rid = rec.get("registry_id") or rec.get("id") or rec.get("slug") or "?"
        name = str(rec.get("name") or rec.get("address") or rec.get("title") or "")
        key, area = get_area(rec)
        flags = []

        if area is None:
            flags.append("NO_AREA_FIELD")
        else:
            if area <= 0:
                flags.append("NON_POSITIVE")
            if area < 5:
                flags.append("IMPLAUSIBLY_SMALL")
            if area > 5000:
                flags.append("IMPLAUSIBLY_LARGE")
            if median and (area > median * 8 or area < median / 8):
                flags.append("OUTLIER_VS_MEDIAN")
            if float(area).is_integer() and area % 100 == 0 and area >= 100:
                flags.append("ROUND_NUMBER_LIKELY_ESTIMATED")

            sc = species_count(rec)
            if sc and area:
                dens = sc / area
                if dens > 3:
                    flags.append("SPECIES_DENSITY_IMPLAUSIBLE_HIGH")
                if dens < 0.005 and area > 50:
                    flags.append("SPECIES_DENSITY_IMPLAUSIBLE_LOW")

        hay = (rid + " " + name).lower()
        if any(s in hay for s in KNOWN_SUSPECT):
            flags.append("KNOWN_SUSPECT_BACKLOG")

        # Under v2, area drives the envelope. No area = no shadow score.
        if not rec.get("site_envelope"):
            flags.append("NO_SITE_ENVELOPE")

        rows.append({
            "registry_id": rid,
            "name": name[:48],
            "area_field": key or "",
            "area": area if area is not None else "",
            "species": species_count(rec) or "",
            "flags": ";".join(flags),
            "action": "FIELD VERIFY" if flags else "ok",
        })

    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="directory of Registry record JSON files")
    ap.add_argument("--csv", help="write worksheet to this path")
    a = ap.parse_args()

    if not os.path.isdir(a.data):
        sys.exit(f"not a directory: {a.data}")

    records = []
    for f in sorted(os.listdir(a.data)):
        if not f.endswith(".json"):
            continue
        with open(os.path.join(a.data, f)) as fh:
            try:
                d = json.load(fh)
            except json.JSONDecodeError as e:
                print(f"UNPARSEABLE {f}: {e}")
                continue
        records.extend(d if isinstance(d, list) else [d])

    rows = audit(records)
    bad = [r for r in rows if r["flags"]]

    w = max((len(r["name"]) for r in rows), default=10)
    print(f"\nAREA AUDIT — {len(records)} records, {len(bad)} needing attention\n")
    for r in sorted(rows, key=lambda x: (not x["flags"], x["registry_id"])):
        if not r["flags"]:
            continue
        print(f"  {r['registry_id']:<28} {r['name']:<{w}}  {str(r['area']):>8}  {r['flags']}")

    print(f"\n{len(rows) - len(bad)} clean / {len(bad)} flagged")
    print("\nGATE: Phase 1 is not complete while any record carries a flag other")
    print("      than NO_SITE_ENVELOPE. Do not begin shadow calibration.\n")

    if a.csv:
        with open(a.csv, "w", newline="") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)
        print(f"worksheet: {a.csv}\n")

    sys.exit(1 if any(f for r in bad for f in [r["flags"]] if "NO_SITE_ENVELOPE" not in f or ";" in f) else 0)


if __name__ == "__main__":
    main()
