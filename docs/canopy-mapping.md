# Canopy Mapping

Canopy is a **measured ecological attribute**, stored separately from — and
independent of — the ecological score. It answers one question defensibly:

> **Canopy cover % = area(canopy ∩ property) ÷ property area × 100**

The number, its source dataset, its vintage and its verification state are all
preserved. Canopy is derived by **one** process (`scripts/canopy_map.py`) and
only *displayed* elsewhere — the same single-source-of-truth rule the score and
`registry.json` follow.

## Three states, never conflated

| State | Meaning | Where |
|---|---|---|
| **existing** (this prototype) | Remotely mapped from imagery / LiDAR / Vicmap vegetation | `canopy.existing` |
| **history** | Prior mapped/verified snapshots, appended not overwritten | `canopy.history[]` |
| **projected** | Modelled future mature crowns (a separate pipeline) | `canopy.projected` |

A physical **site visit is not field verification of the spatial calculation.**
The Wattle Glen garden was visited in August 2026, but the canopy figure remains
a `mapped_estimate`; the visit is recorded only as `field_context`.

## Verification states

```
mapped_estimate     remotely mapped, not checked on the ground   ← Sam's prototype
steward_confirmed   steward has confirmed the mapped extent
designer_confirmed  designer has confirmed the mapped extent
field_verified      checked against an onsite inspection
```

## Data sources (Victoria)

Assessed candidates, best first:

| Dataset | Type | Res | Use |
|---|---|---|---|
| **Vicmap Vegetation — Tree Extent** ★ | raster | 20 cm | Statewide tree presence/absence (cell = tree). **Preferred** for cover %. |
| Vicmap Vegetation — Tree Density (Polygon) | vector | — | Density-class polygons; coarser, useful where raster is impractical. |
| Vicmap Vegetation — Tree Urban Point | vector | — | Individual urban tree points; not a footprint. |
| Coordinated Imagery Program (aerial) | raster | ≤10 cm | Visual QA / manual delineation; capture date varies by region. |
| LiDAR-derived canopy height | raster | ~1 m | Height/structure where available; can refine extent. |
| **Vicmap Property** | vector | — | The **property boundary** (cadastral parcel). |

★ Tree Extent is ML-derived from statewide aerial imagery + elevation, CC-licensed,
served via WMS/WFS from data.vic (`discover.data.vic.gov.au`). **Its vintage varies
by capture region and must be read from the dataset metadata per run — never assume
"current".** `--source-date` is required by the pipeline for exactly this reason.

Do **not** infer indigenous/native species composition from imagery. Species stays
a separate evidence layer (`biodiversity.species_list`).

## Workflow

```
property polygon (Vicmap Property)
        +
canopy layer (Vicmap Tree Extent raster, or a vector canopy source)
        ↓  scripts/canopy_map.py  (shapely / pyproj / rasterio)
reproject → GDA2020 MGA Zone 55 (EPSG:7855)
        ↓
raster path:  count tree cells within the parcel × cell area
vector path:  union(canopy) ∩ parcel  (union first → no double-counting)
        ↓
property_area_sqm, canopy_area_sqm, canopy_cover_pct, canopy_overhang_sqm
        ↓
write canopy.existing + source / vintage / calculated_at / verification_status
        ↓
profile displays metrics; overlay (precise geometry) is steward-gated
```

### Running it

```bash
# Raster path (preferred — Vicmap Tree Extent)
python scripts/canopy_map.py data/bushgarden.json \
  --raster tree_extent_clip.tif \
  --parcel wattleglen_parcel.geojson \
  --source "Vicmap Vegetation - Tree Extent" --source-date 2020

# Vector path
python scripts/canopy_map.py data/bushgarden.json \
  --parcel parcel.geojson --canopy canopy.geojson \
  --source "Vicmap Vegetation - Tree Density" --source-date 2020

python scripts/canopy_map.py data/bushgarden.json --validate   # no geo libs needed
```

Deps for real computation: `pip install shapely pyproj rasterio`.

## Schema (`canopy.existing`)

Names follow existing Registry conventions (`area_sqm`, `canopy_cover_pct`). This
is **separate** from the scored `biodiversity.canopy_cover_pct_current` and does
**not** feed the scoring engine in this iteration.

```json
"canopy": {
  "existing": {
    "property_area_sqm": null,
    "canopy_area_sqm": null,
    "canopy_cover_pct": null,
    "canopy_overhang_sqm": null,
    "measurement_method": "remote_spatial_mapping",
    "source": null,
    "source_type": null,
    "source_date": null,
    "resolution": null,
    "calculated_at": null,
    "verification_status": "mapped_estimate",
    "field_context_date": "2026-08",
    "field_context_note": "…visit is field context only, not spatial verification.",
    "adjoins_remnant_vegetation": true,
    "notes": null
  },
  "history": [],
  "projected": null
}
```

Optional `parcel_geojson` / `canopy_geojson` may be attached for the map overlay;
because they are precise property geometry they are **privacy-gated** on the
profile (shown only to a claimed steward), consistent with the precise-map-pin rule.

## Future-proofing (schema-ready, not built)

- **Canopy through time** — `canopy.history[]` snapshots; `canopy_map.py` pushes the
  prior reading into history before overwriting, so change is preserved not lost.
- **Projected canopy** — `canopy.projected` for modelled 10-year / mature crowns,
  kept strictly separate from observed.
- **Designer aggregation** — per-property `existing` + `projected` sum cleanly across
  a designer's registered gardens (recorded / existing m² / projected m² / adjoining
  remnant). Not built; the schema doesn't preclude it.

## Constraints honoured

Privacy first · no species inference from imagery · historical imagery never
presented as current (vintage required) · remote mapping ≠ field verification ·
source + vintage preserved · one authoritative calculation · **independent of the
ecological score**.

## Status — Wattle Glen prototype

Schema, pipeline, docs and profile UI are in place. The canopy **numbers are null
(`mapped_estimate`, pending computation)** — they will be populated by a single
`canopy_map.py` run once the Vicmap Tree Extent clip and the Vicmap Property parcel
polygon for the site are supplied (both require the geospatial stack + network, not
available in the current build environment). No number is fabricated.
