# Habitat Value

Habitat Value is **landscape ecological context**, not a measure of the garden.
It answers *"how strategically important is this location for biodiversity?"* — a
statewide 0–100 relative ranking (DEECA). It is stored with provenance and **does
not touch the ecological score**.

```
ECOLOGICAL FUNCTION   what exists within the garden + what stewardship created
HABITAT VALUE         how important the surrounding location is for biodiversity
```
A garden must not score higher on function just because it sits in high-value habitat.

## Source — confirmed queryable (Aug 2026)

DEECA Habitat Value via NatureKit, live ArcGIS raster MapServer:
```
https://biod-gis.mapshare.vic.gov.au/arcgis/rest/services/NatureKit/habitat_value/MapServer
```
| Property | Value |
|---|---|
| Layers | 1 — `Habitat Value` (Raster Layer) |
| Capabilities | Map, Query, Data |
| CRS | GDA2020 Vicgrid (wkid 7899) |
| Version | **3.1.0** (from `documentInfo`) |
| Resolution | ~**75 m** |
| Query | `/identify` point lookup → pixel value (`Stretch.Pixel Value`) |
| Licence | Victorian Government open data (CC BY) |

**Scale verified** with contrasting points — values span 0–100 (not a 0–255 stretch),
and water returns **`NoData`, not 0**:

| Point | HV |
|---|---|
| Melbourne CBD | 0 |
| Werribee plains | 0 |
| Wattle Glen | 97 |
| Alpine (Bogong) | 87 |
| Port Phillip Bay | NoData |

The service is stable and fast (~0.1–0.3 s/identify). **Architecture decision:
query the service directly** — it's live, authoritative, versioned, and the 75 m
raster is impractical to cache statewide for our handful of points. (Re-cache later
only if volume demands it.)

## Lookup method

At 75 m, a raster cell is far larger than a suburban property — so we must not imply
metre-level precision. We record two things (Option A + a light Option C):

- **`centroid_value`** — Habitat Value at the property centroid (the headline).
- **`local_context_mean`** — mean of the centre + 8 points on a 250 m ring
  (real values only; NoData excluded).

Option B (property intersection) collapses to the centroid for sub-cell properties,
so it adds nothing here. The raw method is stored (`lookup_method`) either way.

`scripts/habitat_value.py` is the single lookup/authority (stdlib only — the service
does the spatial work):
```bash
python scripts/habitat_value.py --lat -37.684537 --lng 145.193461      # print
python scripts/habitat_value.py data/bushgarden.json --lat .. --lng .. # write block
ER_ADMIN_TOKEN=… python scripts/habitat_value.py --batch               # internal report
```

## Schema (`habitat_context.habitat_value`)

Numeric value + full provenance; banding kept alongside, never replacing, the number.
```json
{ "habitat_context": { "habitat_value": {
  "value": 97, "scale": "0-100", "band": "Very High",
  "band_note": "REG provisional banding — not an official DEECA classification.",
  "lookup_method": "property_centroid+local_context",
  "source": "DEECA Habitat Value", "source_service": "NatureKit",
  "source_url": "…/NatureKit/habitat_value/MapServer",
  "dataset_version": "3.1.0", "dataset_date": null, "resolution_m": 75,
  "calculated_at": "…", "state": "value",
  "centroid_value": 97, "local_context_mean": 78.4, "local_context_radius_m": 250 } } }
```
Provenance answers: where the number came from, which dataset/version, how the
property was queried, and it's reproducible by re-running the lookup.

## Categories — provisional only

DEECA does **not** publish simple public thresholds for Habitat Value. The Registry
keeps the **raw number** and applies cautious language only:

```
0–19 Low · 20–39 Moderate · 40–59 Significant · 60–79 High · 80–100 Very High
```
This banding is **REG-internal, not an official classification** (`band_note` records
that). If DEECA publishes an authoritative interpretation, adopt it.

## Distribution — internal batch (19 VIC gardens, v3.1.0)

| Stat | Value |
|---|---|
| n (real value) | 19 (all returned `value`; 0 NoData/errors) |
| min / max | 0 / 97 |
| mean / median | 12.1 / 0 |
| Low 0–19 | 14 · Moderate 4 · Significant 0 · High 0 · **Very High 1** |

**Finding:** Wattle Glen (97) is a lone outlier; the rest sit in **Low** context
(median 0). The Registry's gardens are overwhelmingly inner-Melbourne suburban —
they create ecological function in landscapes the state model rates *low* strategic
value. This validates keeping Habitat Value separate from ecological function.

**Anomalies / limitations:**
- Only **3 of 19 gardens are geocoded** (Auburn 0, Arundel 24, Wattle Glen 97) — via
  the Garden Coords sheet / a published live record. The other **16 have no precise
  coord anywhere** (no published record, not geocoded), so the batch falls back to the
  **display (privacy-fuzzed) coord** — approximate context only. The lookup already
  prefers precise (Garden Coords sheet → live `connectivity.lat/lng` → display); the
  gate is data capture, not the query. **Action for property-grade values: geocode the
  remaining gardens** (assess.html coord capture); they then auto-upgrade to precise.
- 75 m cells: centroid can differ from the local mean (Wattle Glen 97 vs 78.4) — the
  point is a peak cell; the neighbourhood is lower. Both are stored.
- Very low values cluster at exactly 0 (cleared urban) — real, not missing.

## Failure handling

Distinct states, **never 0 for missing**: `value` · `nodata` (e.g. water) ·
`no_result` (outside coverage) · `error` (service/parse). Missing coords are skipped.
The writer refuses to store anything but `value`/`nodata`.

## Relationship to other spatial layers

Distinct source measurements, some may later inform scoring: **Pre-1750 EVC** (what
belongs here) · **Habitat Value** (landscape importance) · **Canopy** (current cover)
· **Connectivity** (nearby habitat) · **Garden evidence** (what's been created).

## Scoring

**No scoring change this iteration.** Habitat Value *may* eventually contribute a small
number of Connectivity points or a separate strategic-value indicator — but only with
evidence. Nothing is hard-coded. Verified: score unchanged (Wattle Glen still 83).

## Open question answered

> Can REG automatically and defensibly identify the biodiversity significance of the
> landscape context around every registered Victorian garden?

**Yes** — the NatureKit service is live, queryable, versioned, returns real 0–100
values with correct NoData handling, and the batch ran clean across the registry.
The main caveat is coord precision (use precise coords for property-grade results).
