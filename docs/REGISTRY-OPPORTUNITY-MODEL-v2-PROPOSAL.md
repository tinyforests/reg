# The Registry Beyond "Gardens"
## Proposed architecture v2 — Opportunity-relative scoring

Product development response to the strategy brief. Conceptual proposal only. No production scoring changes proposed at this stage.

Status: draft for review · Method v1.0 remains canonical and unchanged until Phase 3.

---

## 0. The headline

The brief asks for two numbers. We propose **three**, because the third is the one worth owning commercially.

| | Question it answers | Bounded? | Audience |
|---|---|---|---|
| **Ecological Performance (EP)** | How well is this place using the opportunity it has? | 0–100 | Steward, public, badges, tiers |
| **Ecological Contribution (EC)** | What is this place actually contributing to the living system? | Unbounded, in ECU | Council, corridor, aggregate reporting |
| **Latent Opportunity (LO)** | What could happen here next? | Unbounded, in ECU | Designer routing, council prioritisation, YIELD |

`LO = EC_potential − EC_actual`

The brief already contains this insight — "what exists → what was possible → what could happen next" — but treats the third as a derived observation. It should be a first-class stored quantity. LO is the number that makes an under-planted 1,000 m² property *interesting* rather than *penalised*, and it is the direct input to upgrade routing, the designer dashboard's latent-demand panel, and any council licence we eventually price.

**Second headline: this is not a departure from AfN alignment, it is convergence with it.** AfN accounts are condition (Econd, 0–100, relative to a reference) multiplied by extent. Our split is the same shape. EP is a condition score. EC is condition × extent, generalised to three dimensions so it works on a balcony. Framed correctly, this closes rather than widens the methodology gap — with one serious caveat in §8.1 that has to be handled explicitly and not glossed.

---

## 1. Revised conceptual scoring architecture

The move is not "different scoring systems for different site types." It is:

> **Function-level indicators. Envelope-level thresholds.**

Indicators are defined by the *ecological function* they represent, not by the *garden feature* that usually delivers it. The site envelope then sets the threshold at which that function is considered delivered.

Worked contrast — the canopy example from the brief:

| Approach | Result on a 6 m² balcony |
|---|---|
| Current (feature-level indicator: "canopy tree present") | 0 points. Unfair. |
| Naive fix (waive the indicator) | Weight vanishes, denominator shrinks, balconies drift toward 100. Meaningless. |
| **Proposed (function-level: "upper vegetation stratum present, structurally complex, indigenous")** | Threshold retargets to the tallest stratum the envelope permits — a 2 m shrub in the largest permissible container, or a climber on a trellis. Scored, achievable, honest. |

Only genuinely impossible functions get zero weight — in-ground soil biota on a concrete slab, for example. Everything else is *retargeted*, not waived. This distinction is the whole difference between a context-aware model and an excuse-generating one.

### Mechanics

Each indicator gains two envelope-derived properties:

- `applicability` — *a* ∈ [0,1], almost always 1 or 0 once functions are properly defined
- `achievable_max` — the envelope-calibrated threshold for full marks

Pillar score = `cap × (Σ earned) / (Σ aᵢ · maxᵢ)`

No fake points are ever awarded. Redistribution happens in the denominator, which is the only honest place for it.

### Four guards against "several pots = 100"

1. **Non-waivable core.** These have *a* = 1 on every site with no exception: indigenous species proportion, no synthetic pesticide/herbicide, water available to fauna (a shallow dish qualifies on a balcony), evidence/documentation, management continuity. Failing any one imposes a hard EP ceiling.
2. **Applicability floor.** If Σ*a* across a pillar drops below ~0.35, that pillar is capped below nominal and the profile carries a visible "constrained envelope" note. A three-indicator denominator can never produce a clean 100.
3. **Absolute minimum thresholds.** Envelope-scaled species richness is floored — below roughly 6 indigenous species you are not habitat, regardless of how small the site is. Scaling adjusts the target; it never removes the floor.
4. **Tier + class always paired.** Public renders read "Ecological Garden · Balcony class · EP 85 · EC 3.1". Never a single leaderboard in which an 85 balcony sits above a 55 large garden.

### What this fixes for free

Envelope-scaled thresholds replace the current **fixed absolute species-count thresholds** — one of the four open AfN gaps (alongside evidence separation, reference benchmarking, and independent verification). We should note this in Method v2 explicitly rather than let it pass as a side effect.

---

## 2. Site / opportunity classification

**Recommendation: do not classify. Measure, then derive the label.**

The eight classes in the brief are good *language* and bad *logic*. Adopt them as derived display labels, computed by `sync_registry.py` from a measured envelope — never chosen by a steward, never entered by hand, never load-bearing in the score.

### The Site Envelope object

Inputs are evidence-bearing and versioned, like every other Registry input.

**Physical**
- `growing_area_m2` — planted substrate area. **Not title area.**
- `title_area_m2` — context only, never enters any formula
- `substrate_class` — in_ground · raised_deep (≥600 mm) · raised_shallow (300–600) · container (<300) · epiphytic/hydroponic
- `soil_volume_m3` — derived
- `vertical_envelope_m` — unobstructed height available to vegetation. This, not area, is what actually determines canopy feasibility.
- `structural_load_limit` — none · engineered_limit_kgm2 · unknown
- `solar_hours_band`, `aspect`, `wind_exposure`

**Access and tenure**
- `tenure` — owner · renter · strata/owners-corp · institutional
- `permission_scope[]` — can_excavate · can_plant_trees · can_alter_hardscape · can_harvest_water · can_install_waterbody
- `water_access` — mains · tank · none

**Context**
- `reference_community_ref` — EVC in Vic, PCT in NSW, RE in Qld, local equivalent elsewhere
- `urban_matrix_class` — surrounding habitat value, from open data
- `network_ids[]` — building / street / corridor membership

Class is then a thin derivation over `substrate_class`, `growing_area_m2`, `vertical_envelope_m` and dwelling count. Thresholds are locale-pack data, not code. Because the envelope is continuous underneath, two sites in the same displayed class can still carry very different achievable maxima — which is exactly what the brief asked for.

---

## 3. What happens to the five pillars

All five survive with their names and caps intact. This matters for continuity with every document, poster, deck and council conversation already in circulation.

| Pillar | Change |
|---|---|
| Biodiversity structure | Thresholds become envelope-scaled. Fixed absolute species counts retire. Strata expressed as functions, not features. |
| Soil & water | Splits cleanly into substrate function (can be genuinely 0 on a slab) and water function (never 0 — a fauna water point is available to every site). Rooting volume replaces area as the primary term. |
| Habitat complexity | Feature list generalises: "log" becomes "decaying woody material", "rock pile" becomes "thermal/refuge structure". Scale-appropriate versions exist on a balcony. |
| Connectivity | **Substantive change — see §4.3.** Currently a manually asserted tick worth +5, set only on the demo garden. Becomes computed from network membership and adjacency. |
| Evidence | Unchanged in substance, but separates cleanly from ecological condition in the record, which closes a second AfN gap. |

Caps stay where they are. Tier anchors (Habitat Garden ~32, Ecological Garden ~50, Urban Biodiversity Node 91–100) are treated as **calibration constraints** on v2 — see §9.

---

## 4. Separating Performance from Contribution

### 4.1 A deliberate non-identity

It is tempting to define `EP = EC_actual / EC_potential × 100`. **Don't.** EP legitimately includes practice indicators with no volumetric expression — chemical-free management, evidence quality, management continuity, steward observation records. Forcing algebraic identity would either corrupt EC with practice terms or strip EP of everything that isn't biomass.

Instead: EP and EC are computed independently but **share the envelope model**, so `EC_potential` and therefore LO remain coherent with EP. State this openly in the method document; a reviewer will ask.

### 4.2 The Contribution formula

Base currency is ecologically-weighted vegetation volume plus function terms. Deliberately built to be legible against Singapore's Green Plot Ratio, which is defined as the area-weighted average Leaf Area Index of a site and is a real regulatory instrument there under LUSH — with per-species LAI values published by NParks. That gives us a genuine international bridge rather than an invented unit.

```
EC = [ V_eff · Q_indig · S_struct  +  F_soil  +  F_water  +  H_habitat ] · P_persist · C_network
```

- **V_eff** — Σ over plant records of (footprint or canopy area × occupied height × growth-form LAI class). Vertical greenery counts on a balcony; trees dominate on a landed property. Same formula, different geometry.
- **Q_indig** — indigenous 1.0 · native non-local 0.6 · exotic non-invasive 0.2 · environmental weed negative
- **S_struct** — strata diversity multiplier, 0.7–1.3
- **F_soil** — unsealed area × depth × organic matter. Genuinely 0 on a slab. That is honest, and it lands in EC where it belongs, not in EP.
- **F_water** — waterbody volume and edge, or a fauna water point (small, non-zero)
- **H_habitat** — discrete features with diminishing returns
- **P_persist** — persistence factor, 0.6–1.0, earned upward by longitudinal survival records. This is the anti-token-planting term.
- **C_network** — bounded 0.95–1.20

Growth-form LAI classes (tree, palm, shrub, groundcover, climber, turf) rather than per-species precision — six values, defensible, and cheap to calibrate per locale. Singapore can use NParks' published values directly; Victoria needs a bounded piece of work to produce an equivalent table.

### 4.3 Networks as first-class objects

New entity, and the real Singapore unlock:

`network` — types: `building` (vertical stack) · `street` · `corridor` · `cluster` · `precinct`

Each network holds its own aggregate EC, its own **coverage %** (registered units ÷ total units), and its own adjacency computation. A balcony's `C_network` derives from its building's aggregate — it is not self-asserted. Ten balconies in one tower become one Vertical Cluster record with a story no individual balcony can tell.

This also **corrects an existing defect**: the corridor-node +5 is currently a manual assessor tick, present only on Rupert (the demo garden), whose own data contradicts it — zero adjacent registered gardens, adjacent_park false. Replacing the tick with a computed value should be logged as a correction to v1 regardless of whether v2 proceeds.

Bound the effect hard: `C_network` requires ≥3 verified members and can never exceed +20%. Ten balconies are more than one balcony; they are not a woodland.

---

## 5. Schema changes

**New on each place record**
```
site_envelope: { … as §2 … }          # nullable during migration
envelope_class: derived                # never hand-entered
ecological_performance: derived        # 0–100
ecological_contribution: derived        # ECU
ecological_potential: derived           # ECU
latent_opportunity: derived             # ECU
method_version: "2.0"
locale: "AU-VIC" | "SG" | …
locale_version: "…"
score_v1: preserved                     # historical, never recomputed
```

**New collections**
```
/data/networks/*.json                   # building, street, corridor objects
/data/locales/AU-VIC.json               # thresholds, LAI table, species authority
/data/locales/SG.json
```

**Engine**
- `js/reg-score.js` — canonical, gains envelope resolution and the EC/LO computation
- Python parity implementation follows; `test_parity.py` extended to cover EP, EC and LO across all four example envelopes. Parity remains a pre-commit gate.
- `sync_registry.py` remains the inputs-are-truth enforcer and regenerates every derived field above, including `envelope_class`.

**Blocking dependency:** `area_sqm` is currently wrong on Arundel, Middlesex and Sir Garnet (known, logged, unresolved). Under v1 that is a display inaccuracy. Under v2 area feeds the envelope, the class derivation and EC. **The Surrey Hills area audit becomes a hard prerequisite for Phase 1, not a background task.**

---

## 6. Four worked examples

Illustrative figures to show the shape of the model. Not engine output.

| | 6 m² Melb balcony | 35 m² Melb courtyard | 500 m² Melb suburban | 1,000 m² SG landed |
|---|---|---|---|---|
| Growing area | 2.4 m² containers | 22 m² in-ground | 310 m² in-ground | 640 m² in-ground |
| Vertical envelope | 2.6 m | 7 m | unlimited | unlimited |
| Tenure | renter, strata | owner | owner | owner |
| Locale pack | AU-VIC | AU-VIC | AU-VIC | SG |
| **EP** | **82** (constrained) | **71** | **55** | **48** |
| **EC** | **3.1** | **22** | **180** | **340** |
| **LO** | **1.4** | **14** | **230** | **410** |
| Public label | Ecological Garden · Balcony | Ecological Garden · Courtyard | Ecological Garden · Standard residential | Habitat Garden · Landed |

Read across the bottom two rows. The balcony is performing beautifully and contributing modestly, and that reads as success rather than failure. The 500 m² property is the most interesting record on the Registry — it already contributes 58× the balcony *and* it is sitting on more unrealised opportunity than everything above it combined. That is a design commission, a council priority and a YIELD candidate, and none of it is visible under v1.

The Singapore property scores lowest on EP despite the highest EC — plausible for a conventionally landscaped tropical garden with high green volume and low indigenous fraction. If that pattern holds in real records it is a genuine finding, and it is exactly the finding a Singapore partner would want to act on.

---

## 7. Localisation without fragmentation

**Fixed globally, versioned as Method v2.x — a locale pack cannot touch any of it:**
the five pillars · the function-level indicator ontology · the site envelope model · the EC formula shape · verification tiers · evidence rules · the EP/EC/LO definitions.

**Supplied by the locale pack — data files, never code:**
reference community authority (EVC / PCT / RE / SG vegetation type) · indigenous species authority · growth-form LAI table · threshold calibrations · connectivity data sources · climate and water expectations · built-form and tenure norms · class derivation thresholds.

> **The one constraint that keeps this a single Registry: a locale pack may recalibrate thresholds. It may never add, remove or reweight a pillar or an indicator.**

Localisation chain: `Country → State/region → reference community → site envelope → assessment`.

Governance: a locale pack goes live only with a named local ecologist reviewer and a published calibration rationale. Records pin both `method_version` and `locale_version`, so a locale recalibration never silently rewrites a historical score.

---

## 8. Risks and failure modes

### 8.1 Reference-frame collision with AfN — the serious one

EP's reference is *what this envelope could achieve*. AfN's Econd reference is *reference-state ecological condition*. A balcony assessed properly against an AfN reference state scores very low, and correctly so. If we ever describe EP as an Econd, a competent reviewer at Accounting for Nature will find that in the first hour and it damages everything else.

**Resolution:** EC carries an AfN-legible condition-against-reference sub-score. EP is published as a distinct, clearly-defined stewardship measure and never claimed as an Econd. The method document must state this in its own section rather than bury it.

### 8.2 Envelope gaming — the biggest attack surface

Declaring constraints shrinks the denominator and raises EP. This is the fraud path.

Mitigations: envelope fields are evidence-bearing (slab photo, strata rules, load certificate); envelope revisions are versioned and logged; **any downward envelope revision that increases EP triggers review before publication**; verified records require assessor-confirmed envelopes.

### 8.3 Wealth proxies smuggled in through the side door

Soil depth, waterbodies, structural engineering and verification cost all correlate with money. Mitigations: title area never enters any formula; verification fee never gates EP (the free self-assessment path stays); envelope factors chosen for tenure-neutrality; EC never becomes a tier, badge or rank.

### 8.4 The renter penalty

`P_persist` is ecologically real and correlates with wealth. Mitigation: it applies to **EC only, never EP**, and it is earned upward by actual longitudinal survival rather than assumed from tenure. A renter with four years of records reaches 1.0.

### 8.5 Council dashboards become affluence maps

Councils will rank suburbs by EC, and that ranking will track lot size and income. Mitigation: dashboards default to **EP and coverage %**, with EC secondary and always paired with LO. The LO layer inverts the map — the highest-opportunity suburbs are often the lowest-performing ones.

### 8.6 Others

- **Balcony inflation** — handled by the four guards in §1.
- **Institutional greenwashing** — 200 planters at a corporate campus. Institutional envelopes require verification and a public evidence pack; self-reported institutional records stay provisional.
- **Volume estimation error** — banded growth-form inputs, not species-precision; measured heights only on verified records.
- **Network flattery** — bounded at +20%, ≥3 verified members required.
- **Silent rescoring** — version pinning on every record.

---

## 9. Migration path

Nothing destructive. Every existing record survives with its current score intact.

**Phase 0 — Freeze and pin.** Stamp `method_version: "1.0"` and `locale: "AU-VIC"` on all existing records; `sync_registry.py` enforces; `test_parity.py` extended. Existing scores are now permanently attributable to a named method version. *No visible change.*

**Phase 1 — Envelope backfill.** Complete the Surrey Hills `area_sqm` audit first (§5). Add `site_envelope` as nullable and backfill from area, photos and field notes. Flag records where envelope cannot be inferred without a visit. *No visible change.*

**Phase 2 — Shadow scoring.** Engine v2 computes EP/EC/LO alongside v1. Nothing publishes. Compare distributions.
**Calibration objective: the median existing record's EP lands within ±5 of its v1 score, and the tier anchors at 32 / 50 / 91 still mean what they mean.** Steward-facing score shock is the fastest way to lose the stewards we have.

**Gate — do not pass Phase 2 unless** calibration holds *and* at least three non-standard sites (one balcony, one courtyard, one institutional) have been physically verified and behave sensibly.

**Phase 3 — Publish.** EP becomes the headline score. `score_v1` is retained on the record and shown as history on the profile — this is a trajectory story, not an erasure. EC and LO ship council- and designer-facing first, steward-facing second.

**Phase 4 — Extend.** SG locale pack, network objects, balcony/apartment registration flow.

### Product surfaces touched

- **Registration flow** — envelope questions come *first*, before species, and are mostly pick-a-picture. This doubles as the fix for the self-enrolment ramp's biggest drop-off risk.
- **Profile** — three numbers; tier and class always paired; LO shown as a band, never an exact shaming figure.
- **Maps** — balconies pin to a *building*, not an address. A ten-balcony stack is inherently location-fuzzed, which is a privacy dividend on top of the existing offset scheme.
- **Badges** — performance badges universal; contribution badges banded within class only.
- **Council dashboard** — coverage %, median EP, aggregate EC, and the LO map. The LO map is the strongest candidate for the licensed product, and it is the most direct answer available to the open question of what a council dashboard is worth.
- **Designer dashboard** — LO within corridor bands is a sharper version of the latent-demand panel already prototyped.
- **Field observations and longitudinal records** — unchanged in form; now feed `P_persist`.

Public language stays as it is. Nothing is renamed. The architecture stops assuming a suburban garden; the words can catch up later.

---

## 10. For the Henning Larsen conversation

One thing worth carrying into that meeting, if the timing works: **Green Plot Ratio is already the Singapore version of the Contribution axis.** It quantifies greenery three-dimensionally via Leaf Area Index, it is embedded in URA's LUSH programme as a real planning requirement, and NParks publishes per-species LAI values. If EC is built LAI-compatible, a Singapore project's contribution figure translates into a metric their planning system already recognises — and what the Registry adds on top is the two things GnPR does not measure: **indigenous fraction** and **what happened after handover**.

The Singapore Index on Cities' Biodiversity is the matching instrument at city scale — a CBD-adopted self-assessment tool for local governments, authored by NParks. Aggregate Registry data at precinct level is a plausible feed into several of its native-biodiversity indicators. Worth asking Leonard directly whether that framing lands with the people he works with, rather than asserting it.

---

*Prepared as a conceptual proposal. Production scoring remains Method v1.0. The inputs are the truth; the score is the consequence.*
