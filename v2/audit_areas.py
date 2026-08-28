#!/usr/bin/env python3
"""
audit_areas.py v2 — PHASE 1 BLOCKER.

Under Method v1 a wrong area is a display inaccuracy.
Under Method v2 area feeds the site envelope, the class derivation and EC.
So this has to be clean before a single shadow score means anything.

v2 changes, after the first run against the live repo:
  - Schema-adaptive. Reads garden_id/garden_name as well as registry_id/name,
    and finds species counts nested inside biodiversity blocks. The previous
    version assumed a record shape this repo does not use, so the identity
    column came back blank, the known-suspect check never fired, and the
    species-density checks silently skipped.
  - Known-suspect matching on id and slug, not just display name. Gardens get
    renamed; ids don't.
  - Confirmed-area sign-off. A large or odd area that has been field-verified
    goes in data/confirmed-areas.json and stops flagging forever, instead of
    being suppressed by loosening a threshold for every record.
  - Flat-directory tolerant. Non-garden files are skipped by shape, not by
    filename guessing.
  - PII scan. The audit already walks every record, so it reports address-like
    fields outside the local-only allowlist rather than leaving them to be
    found by accident.

    python3 v2/audit_areas.py --data data
    python3 v2/audit_areas.py --data data --csv area-audit.csv

Reports, never writes to a record. sync_registry.py stays the only writer.
The CSV can contain address strings — do not commit it.
"""
import argparse
import csv
import json
import os
import sys

# Matched against id/slug first, then name. Ids survive renames; names don't.
KNOWN_SUSPECT_IDS = ["arundel", "middlesex", "sir-garnet", "sirgarnet", "sir_garnet"]
KNOWN_SUSPECT_NAMES = ["arundel", "middlesex", "sir garnet",
                       "habitat meadow", "native buffer"]  # post-rename aliases

ID_KEYS = ["registry_id", "garden_id", "id", "slug"]
NAME_KEYS = ["garden_name", "name", "title", "label"]
AREA_KEYS = ["area_sqm", "garden_area_sqm", "area_m2", "area", "land_area_sqm"]

ADDRESS_KEYS = ["address", "garden_address", "street", "street_address",
                "full_address", "location_address"]
ADDRESS_ALLOWLIST = ["garden_address"]   # already in pull_live_records LOCAL_ONLY

MIN_AREA = 5
MAX_AREA = 5000          # a soft ceiling — confirm real outliers, don't raise it
MAX_DENSITY = 3.0        # species per m2
MIN_DENSITY = 0.005


def first(rec, keys):
    for k in keys:
        v = rec.get(k)
        if v not in (None, "", []):
            return k, v
    return None, None


def get_area(rec):
    for k in AREA_KEYS:
        v = rec.get(k)
        if isinstance(v, (int, float)):
            return k, float(v)
        if isinstance(v, str):
            try:
                return k, float(v.strip().replace("m2", "").replace("m\u00b2", ""))
            except ValueError:
                pass
    return None, None


def species_count(rec):
    """Top-level, or nested one level inside a biodiversity/planting block."""
    def count(v):
        if isinstance(v, list):
            return len(v)
        if isinstance(v, int):
            return v
        return None

    for k in ("species", "plants", "species_list", "planting",
              "species_count", "indigenous_species_count"):
        c = count(rec.get(k))
        if c is not None:
            return c

    for block in ("biodiversity", "biodiversity_structure", "planting",
                  "inputs", "assessment", "scores"):
        b = rec.get(block)
        if isinstance(b, dict):
            for k in ("species", "species_list", "plants", "species_count",
                      "indigenous_species_count", "indigenous_species"):
                c = count(b.get(k))
                if c is not None:
                    return c
    return None


def looks_like_garden(rec):
    """Shape test, not a filename guess."""
    if not isinstance(rec, dict):
        return False
    has_id = any(k in rec for k in ID_KEYS)
    has_area = get_area(rec)[0] is not None
    has_name = any(k in rec for k in NAME_KEYS)
    return has_id and (has_area or has_name)


def pii_findings(rec):
    out = []
    for k, v in rec.items():
        if k in ADDRESS_ALLOWLIST:
            continue
        if k.lower() in ADDRESS_KEYS and isinstance(v, str) and v.strip():
            out.append(k)
    return out


def load_confirmed(path):
    if path and os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    return {}


def audit(records, confirmed):
    rows = []
    areas = [a for _, a in (get_area(r) for r in records) if a]
    median = sorted(areas)[len(areas) // 2] if areas else 0

    for rec in records:
        _, rid = first(rec, ID_KEYS)
        _, name = first(rec, NAME_KEYS)
        rid = str(rid or "?")
        name = str(name or "")
        key, area = get_area(rec)
        sc = species_count(rec)
        flags = []

        ok_area = confirmed.get(rid, {}).get("area_sqm")
        signed_off = ok_area is not None and area is not None and abs(ok_area - area) < 0.5

        if area is None:
            flags.append("NO_AREA_FIELD")
        elif not signed_off:
            if area <= 0:
                flags.append("ZERO_OR_NEGATIVE_AREA")
            elif area < MIN_AREA:
                flags.append("IMPLAUSIBLY_SMALL")
            if area > MAX_AREA:
                flags.append("LARGE_NEEDS_CONFIRMATION")
            if median and area > 0 and (area > median * 8 or area < median / 8):
                flags.append("OUTLIER_VS_MEDIAN")
            if float(area).is_integer() and area >= 100 and area % 100 == 0:
                flags.append("ROUND_NUMBER_LIKELY_ESTIMATED")
            if sc and area > 0:
                d = sc / area
                if d > MAX_DENSITY:
                    flags.append("SPECIES_DENSITY_HIGH")
                if d < MIN_DENSITY and area > 50:
                    flags.append("SPECIES_DENSITY_LOW")

        if any(s in rid.lower() for s in KNOWN_SUSPECT_IDS) or \
           any(s in name.lower() for s in KNOWN_SUSPECT_NAMES):
            if not signed_off:
                flags.append("KNOWN_SUSPECT_BACKLOG")

        if sc is None:
            flags.append("NO_SPECIES_COUNT_FOUND")

        pii = pii_findings(rec)
        if pii:
            flags.append("PII_FIELD:" + "|".join(pii))

        if not rec.get("site_envelope"):
            flags.append("NO_SITE_ENVELOPE")

        rows.append({
            "id": rid,
            "name": name[:44],
            "area_field": key or "",
            "area": area if area is not None else "",
            "species": sc if sc is not None else "",
            "signed_off": "yes" if signed_off else "",
            "flags": ";".join(flags),
        })
    return rows


BLOCKING = {"ZERO_OR_NEGATIVE_AREA", "IMPLAUSIBLY_SMALL", "NO_AREA_FIELD",
            "LARGE_NEEDS_CONFIRMATION", "OUTLIER_VS_MEDIAN",
            "ROUND_NUMBER_LIKELY_ESTIMATED", "SPECIES_DENSITY_HIGH",
            "SPECIES_DENSITY_LOW", "KNOWN_SUSPECT_BACKLOG"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="directory of record JSON files (flat is fine)")
    ap.add_argument("--confirmed", default=None,
                    help="confirmed-areas.json (default <data>/confirmed-areas.json)")
    ap.add_argument("--csv", help="worksheet path — may contain addresses, do not commit")
    a = ap.parse_args()

    if not os.path.isdir(a.data):
        sys.exit("not a directory: " + a.data)

    confirmed = load_confirmed(a.confirmed or os.path.join(a.data, "confirmed-areas.json"))

    records, skipped = [], 0
    for root, _, files in os.walk(a.data):
        for f in sorted(files):
            if not f.endswith(".json") or f == "confirmed-areas.json":
                continue
            try:
                with open(os.path.join(root, f)) as fh:
                    d = json.load(fh)
            except json.JSONDecodeError as e:
                print("UNPARSEABLE {}: {}".format(f, e))
                continue
            for rec in (d if isinstance(d, list) else [d]):
                if looks_like_garden(rec):
                    records.append(rec)
                else:
                    skipped += 1

    rows = audit(records, confirmed)
    flagged = [r for r in rows if r["flags"]]
    blocking = [r for r in rows
                if any(f.split(":")[0] in BLOCKING for f in r["flags"].split(";") if f)]
    pii_rows = [r for r in rows if "PII_FIELD" in r["flags"]]

    w = max((len(r["name"]) for r in rows), default=10)
    print("\nAREA AUDIT v2 — {} garden records ({} non-garden files skipped)\n"
          .format(len(records), skipped))
    for r in sorted(rows, key=lambda x: (not x["flags"], x["id"])):
        show = ";".join(f for f in r["flags"].split(";")
                        if f and f != "NO_SITE_ENVELOPE")
        if not show:
            continue
        print("  {:<24} {:<{w}}  {:>8}  {}".format(
            r["id"], r["name"], str(r["area"]), show, w=w))

    print("\n{} records · {} flagged · {} blocking".format(
        len(rows), len(flagged), len(blocking)))

    if pii_rows:
        print("\nPII — address-like fields outside the local-only allowlist:")
        for r in pii_rows:
            f = [x for x in r["flags"].split(";") if x.startswith("PII_FIELD")][0]
            print("  {:<24} {}".format(r["id"], f.split(":", 1)[1]))
        print("  Add these to pull_live_records.py LOCAL_ONLY and scrub the repo copies.")

    print("\nNO_SITE_ENVELOPE on every record is expected — it is a v2 field that")
    print("does not exist yet. It never blocks.")
    print("\nGATE: Phase 1 is not complete while any BLOCKING flag remains.")
    print("Field-verify, correct through sync_registry.py, and sign off genuine")
    print("outliers in confirmed-areas.json:")
    print('  { "<garden_id>": { "area_sqm": 6070, "verified_by": "TL", "date": "2026-08-28" } }\n')

    if a.csv and rows:
        with open(a.csv, "w", newline="") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)
        print("worksheet: {}  (contains addresses — do not commit)\n".format(a.csv))

    sys.exit(1 if blocking else 0)


if __name__ == "__main__":
    main()
