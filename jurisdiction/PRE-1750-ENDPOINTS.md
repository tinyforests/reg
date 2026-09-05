# Pre-European vegetation — national endpoint audit

For `findmynativeplants.com.au`. Resolver tiering, live endpoints, and where the
species layer actually exists.

Audited 5 Sep 2026. Endpoint URLs confirmed from service directories; **CORS
behaviour is unverified for every one of these** — each needs a single browser
console call before it goes in the resolver.

> Captured in the Registry's `jurisdiction/` docs because it is the concrete
> source list for the per-jurisdiction adapters (NSW/QLD/WA/SA/TAS/NT). The
> canonical rule is in `/docs/decisions-log.md` (2026-09-05): original-vegetation
> lookups use **pre-1750 / pre-clearing** data, never extant. Victoria's answer
> is NV1750_EVCBCS; every other jurisdiction has its own layer below, falling
> through to NVIS 7.0 pre-1750 MVS.

---

## 1. The short version

Genuine state-level **pre-1750 / pre-clearing** mapping exists in five
jurisdictions. Three have a usable species layer attached.

| Jurisdiction | Pre-1750 state layer | Species layer | Tier |
|---|---|---|---|
| VIC | EVC 1750 (DEECA) | EVC benchmarks | **Deep** |
| NSW | SVTM 1750 PCT | BioNet OData | **Deep** |
| QLD | Pre-clear Regional Ecosystems | REDD v13.1 | **Deep** |
| WA | Beard Pre-European (1:250k) | descriptions only | Classification |
| SA | Pre-European floristic (ag region only) | NVIS hierarchy strings | Classification, partial |
| TAS | none — TASVEG is extant | TASVEG unit descriptions (PDF) | NVIS + extant proxy |
| NT | none public | none | NVIS only |
| ACT | none of its own | — | NVIS only |

Everything not covered falls through to NVIS 7.0 pre-1750 MVS, which is
already wired.

**The honest ceiling:** VIC + NSW + QLD is roughly 78% of the Australian
population. Those three can carry a real species list. WA, SA, TAS get a
better-than-national classification but no species list without manual work.
NT and ACT get the national answer only.

---

## 2. Vegetation endpoints

### National fallback — NVIS 7.0 pre-1750 MVS
```
https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/NVIS_pre_mvs/MapServer
```
Layer 0, raster, display field `MVS_NAME`. 85 subgroups. Already implemented.
Note the pre-1750 rasters were unchanged between NVIS v6.0 and v7.0 — only the
extant layers were updated. There is a parallel `NVIS_pre_mvg` service at MVG
level (33 groups) if a coarser answer is ever wanted.

`identify` with `layers=all:0`, `sr=4326`. Returns `NoData` as a literal string
for water and for gaps.

### NSW — SVTM 1750 PCT
```
https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/VIS/SVTM_NSW_1750_PCT/MapServer
```
Four layers: `0` Vegetation Formation, `1` Vegetation Class,
`2` Plant Community Type, `3` PCT with labels. Raster, 5m, SR 3308 (NSW
Lambert) — pass `sr=4326` on identify and let the server project.

This is the single best state layer after Victoria. 1,846 approved PCTs in
master list version C2.0; current map release is C2.0.M2.2 (Dec 2025).

**Caveat that matters:** pre-clearing coverage is complete for eastern NSW and
Far Western NSW. **Central NSW is still in progress.** Points in that band
need to fall through to NVIS rather than return an empty PCT. Worth a coverage
mask rather than trusting the null.

Extant equivalent, if you ever want a "what's left" comparison:
`VIS/SVTM_NSW_Extant_PCT/MapServer`. The whole `VIS` folder is browsable and
holds a lot of regional pre-1750 layers too.

### QLD — Pre-clear Regional Ecosystems
```
https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Biota/VegetationManagement/MapServer/15
```
Layer 15, "Pre-clear regional ecosystems". **Vector polygons, not raster** —
so use `query` with a point geometry and `returnGeometry=false`, which gives
you the RE code directly rather than a pixel value. Cleanest integration of
any state.

Mapped at 1:100,000, with 1:50,000 and some 1:25,000 in populated areas —
finer than Victoria's EVC mapping in parts of SEQ and the Wet Tropics.

Richer alternative service, with pre-clear RE, land zone and Broad Vegetation
Group layers plus related lookup tables:
```
https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Biota/RegionalEcosystemMapping/MapServer
```
RE codes are structured `bioregion.landzone.vegetation` (e.g. `12.3.11`),
which means the code itself carries usable information before any lookup.

### WA — Pre-European Vegetation (DPIRD-006)
```
https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Environment/MapServer/17
```
Beard's mapping, digitised from his 1:250,000 working drawings, published as
Beard et al. 2013. Also exposed at layer 18 of the `Environment_WFS` service
and via a `public-services.slip.wa.gov.au` host.

Statewide and genuinely pre-European, but 1:250k is coarse — for a suburban
Perth block this is a broad vegetation association, not a garden-scale answer.
Still meaningfully better than NVIS MVS.

### SA — Pre-European Vegetation
```
https://location.sa.gov.au/server5/rest/services/Geocortex_Prd102/MapTheme_PreEuropeanVegetationCached/MapServer
```
Two problems. It's a **cached** service, so identify may not be supported —
check for an uncached sibling before committing. And coverage is the
**agricultural region only**, not the whole state, so the pastoral and arid
zones fall through to NVIS regardless.

Where it does exist it's floristic and structured to the NVIS hierarchy, which
means species names are embedded in the vegetation type strings at the finer
levels.

### TAS — no pre-1750 layer
```
https://services.thelist.tas.gov.au/arcgis/rest/services/Public/NaturalEnvironment/MapServer
```
TASVEG 3.0 at layer 0, TASVEG Live at 49, both vector polygons with `VEGCODE`
and `TASVEG_DES`. 150+ mapping units at a nominal 1:25,000 — excellent
mapping, but **extant, not pre-clearing**.

Tasmania retains a high proportion of native vegetation, so TASVEG is a
defensible proxy in remnant areas and useless in cleared ones. My call: use
NVIS pre-1750 for the classification, and surface TASVEG alongside it as
"what's mapped there now" rather than pretending it's the pre-1750 answer.

### NT — nothing public
NR Maps is a Geocortex front end and the underlying data goes out by FTP or
data request, not a public REST endpoint. NVIS only. Given NT population
density this is a very small share of lookups.

### VIC — your existing layer
Already wired in fmevc against DEECA `NV2005_EVCBCS`. The pre-1750 EVC layer
(`NV1750_EVC`) is the one the national tool should call if you ever fold
Victoria into the same resolver rather than handing off.

---

## 3. Species endpoints

This is the harder half, and it doesn't map one-to-one onto the vegetation
endpoints.

### QLD — REDD v13.1 (the easiest win)
Regional Ecosystem Description Database, Version 13.1 (May 2024), Queensland
Herbarium. **CC-BY 4.0**, 1,603 regional ecosystems, downloadable as a single
XLSX from data.qld.gov.au.

This is the standout. It's open-licensed, it's a static file, and it keys
directly on the RE code the pre-clear layer returns. Bundle it, don't call it.
One file gives you species-bearing descriptions for the whole state with no
runtime dependency and no rate limit.

### NSW — BioNet OData
BioNet Web Service API 4.1.0, read-only OData, includes the **Vegetation
Classification** collection: PCT descriptions, position in the classification
hierarchy, vegetation condition benchmarks, TEC associations. Base is the
`biosvcapp/odata` service; there are published data standards per collection.

PCT ID comes straight off layer 2 of the SVTM 1750 service, so the join is
clean. Runtime API rather than a bundle, so it needs caching.

### VIC — EVC benchmarks
Already solved in fmevc. No change.

### WA / SA / TAS — descriptions, not data
- **WA:** the Beard memoir describes each vegetation type in prose. No
  structured per-unit species table. Would need parsing.
- **SA:** species are embedded in NVIS-hierarchy vegetation type strings
  rather than held as a list. Extractable, but it's string work.
- **TAS:** *From Forest to Fjaeldmark* describes each TASVEG unit with species.
  PDF. Same problem.

All three are a manual or one-off-parse job, not an endpoint.

### National fallback — ALA biocache
```
https://biocache.ala.org.au/ws/occurrences/search
```
Takes `lat` / `lon` / `radius`, or `wkt` for a polygon, and facets on
`species_guid`. There are also `/explore/` endpoints built for exactly the
"what lives near here" question.

Worth being clear about what this is: it answers **"what has been recorded
near this point"**, not "what belonged in this vegetation type." Those diverge
badly in cleared and urbanised country, where the records skew to weeds,
garden escapes and whatever a keen local has photographed. It's a fallback and
it needs framing as one — filter hard to indigenous taxa and to herbarium
records, and don't present it in the same voice as a benchmark-derived list.

---

## 4. Proposed resolver tiering

Same schema throughout: `system / code / name / resolution / source / status`.

1. **VIC** → hand off to findmyevc (current behaviour)
2. **NSW** → SVTM 1750 PCT → BioNet species. Fall through to NVIS if the
   point sits in the Central NSW coverage gap
3. **QLD** → pre-clear RE → bundled REDD species
4. **WA** → Beard pre-European. Classification only
5. **SA** → pre-European floristic, if uncached identify works and the point is
   in the ag region. Otherwise NVIS
6. **TAS** → NVIS classification, TASVEG shown as present-day context
7. **NT / ACT / everything else** → NVIS pre-1750 MVS

Add a `resolution` value per tier so the interface can be honest about
precision: `community` (VIC/NSW/QLD), `association` (WA/SA), `subgroup` (NVIS).
The card should read differently at each level rather than presenting a
1:3,000,000 answer with the same confidence as an EVC.

---

## 5. What I'd do next, in order

1. **CORS test all seven endpoints.** Ten minutes, and it determines whether
   this is a client-side tool or needs a proxy worker. Several of these are
   state government servers with no reason to have permissive headers.
2. **Bundle REDD.** It's open-licensed and static. Queensland goes from
   nothing to a full species answer for the cost of one file.
3. **Wire NSW.** Biggest population, best remaining data, clean PCT join.
4. Leave WA, SA, TAS, NT on the national layer and say so plainly in the
   interface.

The gated species list from the prototype still does the work everywhere the
data isn't there yet — and per-MVS demand tells you whether parsing the Beard
memoir is ever worth it.
