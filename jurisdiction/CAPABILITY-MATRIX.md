# Australian Ecological-Data Capability Matrix

Status vocabulary, as specified:

| Status | Meaning |
|---|---|
| `available` | Endpoint confirmed reachable and public; field mapping known or trivially discoverable |
| `investigate` | Dataset or service is known to exist but access, licence, coverage or fields are unconfirmed |
| `unsupported` | Confirmed that no equivalent exists in this jurisdiction |

Nothing below is guessed. Where a cell says `investigate`, that is the honest state — it means nobody has checked, not that the data is absent. Endpoints marked confirmed were reached on **23 August 2026**.

> Note the distinction between this vocabulary and the runtime `status` enum, which stays at the two values already locked (`ok` | `nodata`). This table describes what REG *can* build; `status` describes what a *single lookup* returned. Conflating them would let "not yet built" masquerade as "no vegetation here".

---

## 1. Original / pre-clearing vegetation

The Registry concept: **ORIGINAL ECOLOGICAL COMMUNITY**.

| Jur | Local system | Status | Service | Notes |
|---|---|---|---|---|
| VIC | Ecological Vegetation Class (EVC) | `available` | `starmaps.biodiversity.vic.gov.au/arcgis/rest/services/star_csdl/MapServer/27` (NV2005_EVCBCS, EPSG:4283, vector) | In production. **Confirm which endpoint findmyevc.com actually calls before merging** — output parity requires the same service. |
| NSW | Plant Community Type (PCT) | `available` | `mapprod3.environment.nsw.gov.au/arcgis/rest/services/VIS/SVTM_NSW_1750_PCT/MapServer` layer 2, EPSG:3308, 5 m raster | Public, no token. Release C2.0.M2.2 (Dec 2025). **Central NSW pre-clearing coverage is a work in progress** — `nodata` will be a real outcome, not a bug. Identify, not query. |
| QLD | Regional Ecosystem (RE) | `available` | `spatial-gis.information.qld.gov.au/arcgis/rest/services/Biota/RegionalEcosystemMapping/MapServer` layer 1 (biodiversity status — preclear), vector | Pre-clear and remnant both served. RE code + land zone + biodiversity status in one layer. |
| TAS | TASVEG | `investigate` | `services.thelist.tas.gov.au/arcgis/rest/services/Public/NaturalEnvironment/MapServer` layers 48–50 | **TASVEG is extant vegetation, not pre-clearing.** Tasmania has no direct pre-1750 equivalent in this service. NVIS pre-1750 MVS is the honest original-community source for TAS until proven otherwise. Check LIST web-service terms before automated use. |
| WA | Pre-European Vegetation (Beard) | `investigate` | `services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Environment/MapServer/17` (DPIRD-006) | 1:250,000, coarse for a suburban block. Finer: Vegetation Complexes SWF 1:50,000 (DBCA-047, layer 33) and Swan Coastal Plain complexes — the latter two are what a Perth garden actually needs. Licence on DBCA-047 is CC **Non-Commercial** — check before use. |
| SA | Pre-European Settlement floristic vegetation | `investigate` | `data.sa.gov.au` dataset `pre-european-vegetation`; NatureMaps viewer | Agricultural region only. No REST endpoint confirmed. |
| ACT | ACT Vegetation Map 2023 / ACT PCT | `investigate` | `services1.arcgis.com/E5n4f1VY84i0xSjy/ArcGIS/rest/services/ACTGOV_Vegetation_Map_2023/FeatureServer`; also `data.actmapi.act.gov.au/arcgis/rest/services/ACT_ENVIRONMENT/vegetation_mapping/MapServer` | CC-BY 4.0, 1:10,000, 64 communities — the finest scale of any jurisdiction. But it maps **native and derived current** vegetation, not pre-clearing. Only 32 ACT PCTs recognised, not all mapped. |
| NT | — | `investigate` | NR Maps (`nrmaps.nt.gov.au`) is a Weave viewer, not ArcGIS REST | **No public REST endpoint found.** Bulk data via FTP (`ftp-dlrm.nt.gov.au`, guest account) or data request. NVIS is the practical NT source. |

## 2. Current / extant vegetation

| Jur | Status | Source |
|---|---|---|
| VIC | `investigate` | NV2005_EXTENT (input to EVCBCS, not currently queried separately) |
| NSW | `available` | SVTM extant — same MapServer pattern as pre-clearing |
| QLD | `available` | RegionalEcosystemMapping layer 2 (remnant) |
| TAS | `available` | TASVEG 4.0 / TASVEG Live, layers 48–50 |
| WA / SA / ACT / NT | `investigate` | — |
| National | `available` | NVIS 7.0 extant MVS, `gis.environment.gov.au/gispubmap/rest/services/ogc_services/NVIS_ext_mvs/MapServer` |

## 3. Habitat / biodiversity significance

**These are not comparable and must never be normalised into one 0–100 metric.**

| Jur | Local measure | Nature of the measure | Status |
|---|---|---|---|
| VIC | DEECA Habitat Value (75 m raster) | Continuous 0–100 modelled score | `investigate` — endpoint not confirmed |
| NSW | Biodiversity Values Map | Binary regulatory trigger under the BC Act | `investigate` |
| QLD | RE Biodiversity Status; Biodiversity Planning Assessments (BAMM) | Ordinal categories (Endangered / Of Concern / No Concern at Present) | `available` (endpoint confirmed) |
| TAS | Threatened Native Vegetation Communities 2020 | Listed-community presence | `investigate` |
| WA / SA / ACT / NT | — | — | `investigate` |

A continuous score, a binary planning trigger and an ordinal conservation category are three different kinds of statement. They can share the heading **Habitat Context**. They cannot share a number.

## 4. Canopy / tree cover

| Jur | Status | Notes |
|---|---|---|
| VIC | `investigate` | Vicmap canopy — endpoint not confirmed |
| NSW | `investigate` | Greater Sydney Tree Canopy to Modified Mesh Block 2022; NSW Urban Vegetation Cover 2016. **Both are mesh-block aggregates, not property-level**, and the 2016 dataset is licence-restricted. |
| QLD / TAS / WA / SA / ACT / NT | `investigate` | — |

Even where canopy exists it is a *neighbourhood* statistic. Attaching a mesh-block canopy percentage to a garden record invites the misreading that it describes the garden.

## 5. Connectivity

`unsupported` in every jurisdiction as a spatial dataset REG can consume today. The Registry's connectivity pillar is computed from its own adjacency data and distance bands, plus an assessor-asserted corridor-node tick. Nothing in the state services replaces that. NSW publishes a General Landscape Connectivity Model — `investigate`, and a candidate for the connectivity gap later, not now.

## 6. National layers — available for every Australian property

| Layer | Status | Service |
|---|---|---|
| IBRA 7.1 bioregions | `available` | `gis.environment.gov.au/gispubmap/rest/services/ogc_services/IBRA7_Regions/MapServer` |
| IBRA 7.1 subregions | `available` | `.../IBRA7_Subregions/MapServer` — 89 regions, 419 subregions |
| NVIS 7.0 pre-1750 MVS | `available` | `.../NVIS_pre_mvs/MapServer` — 100 m raster, 85 subgroups |
| NVIS 7.0 extant MVS | `available` | `.../NVIS_ext_mvs/MapServer` |
| ABS ASGS state boundaries | `available` | `geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer` — the jurisdiction resolver |

Two things to note about NVIS 7.0: the **pre-1750 rasters were unchanged from version 6.0** (only extant was updated for TAS, QLD, NSW and ACT), and the product is modelled from state-supplied data at varying scales and dates. It is a legitimate national floor, not a peer of 1:10,000 state mapping. The record says so via `resolution: 'national'`.

ASGS **Edition 4 (2026)** is now published. Confirm whether `geo.abs.gov.au` exposes an `ASGS2026/STE` service and pin the resolver to it before shipping.

---

## Consolidated

| Layer | VIC | NSW | QLD | TAS | WA | SA | ACT | NT |
|---|---|---|---|---|---|---|---|---|
| Original vegetation | EVC ✅ | PCT ✅ | RE ✅ | TASVEG ⚠ (extant only) | Beard ⚠ | ⚠ | ⚠ (current only) | ⚠ (no REST) |
| Current vegetation | ⚠ | ✅ | ✅ | ✅ | ⚠ | ⚠ | ⚠ | ⚠ |
| Habitat context | ⚠ | ⚠ | ✅ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ |
| Canopy | ⚠ | ⚠ (mesh block) | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ |
| Connectivity | ✗ | ⚠ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| IBRA | ✅ national | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| NVIS | ✅ national | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

✅ `available` ⚠ `investigate` ✗ `unsupported`
