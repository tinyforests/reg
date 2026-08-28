# Method v2 — Hypothesis Register

Every coefficient, threshold, weighting and equivalence in the v2 shadow engine is a **hypothesis**, not a finding. Nothing in this register may be published, quoted to a council, shown to a steward, or cited in a methodology document until its status reads `VALIDATED`.

Status values: `HYPOTHESIS` · `IN TEST` · `VALIDATED` · `REJECTED` · `DEFECT`

Rule: if a number appears in `reg-score-v2.js` or a locale pack and does not appear here, that is a bug. The register is the gate.

---

## Priority 1 — blocking, found in shadow run 001

| ID | Hypothesis | Status | Validation required |
|---|---|---|---|
| **H-010a** | Effective vegetation volume = footprint × occupied height × LAI | **RESOLVED — pending sign-off** | Both currencies are now selectable (`--currency leaf_area\|volume`). Recommendation: **leaf_area**. Height no longer multiplies; it only assigns stratum, and vertical structure is rewarded through S_struct instead. Fixes the double-count and keeps the unit commensurate with Green Plot Ratio. Shadow run 002 attached. Needs ecologist sign-off, then close. |
| ~~H-010a (original)~~ | ~~volume form~~ | superseded | LAI is leaf area *per unit ground area*. Multiplying by height double-counts vertical extent. Shadow run 001 returns an implausible potential for the 500 m² site. Requires a decision on the currency itself: are we measuring **leaf area** (GnPR-compatible, 2D-normalised) or **occupied vegetation volume** (3D, our own unit)? These are not interchangeable and the choice determines whether the Singapore GnPR bridge exists at all. Ecologist input required before any further calibration. |
| **H-070** | EP and the attainment ratio (EC_actual ÷ EC_potential) will broadly agree | **HYPOTHESIS — failing** | Run 002 (leaf_area): gaps of 36 / 22 / 34 / 10 points across the four fixtures — smaller than run 001 but no longer monotonic, so it isn't a simple scaling offset. The non-identity in §4.1 of the proposal is deliberate, but a 47-point divergence is not explainable to a steward. Either the divergence is real and needs explicit public framing, or one of the two models is wrong. Resolve before Phase 2 calibration. |
| **H-071** | EC does not function as a proxy for property size | **IMPROVED — still open** | Run 001 (volume): 148× EC against a 129× area ratio. Run 002 (leaf_area): 67× — sub-linear. Height was compounding with area. Contrary to prediction, the H-010a fix helps here. Any public display of EC is therefore effectively a display of lot size. Reinforces the rule that EC must never be ranked, tiered or leaderboarded. Test whether a sub-linear form is ecologically defensible or whether the linearity is simply true and must be handled in presentation. |

---

## Coefficients

| ID | What | Current value | Status | Validation method |
|---|---|---|---|---|
| H-001 | Pillar caps | 30/20/20/20/10 | HYPOTHESIS | **Placeholder only.** Must be wired to the actual v1 constants in `js/reg-score.js`. No shadow run is meaningful until this is done. |
| H-010 | Growth-form LAI table | tree 3.5 … turf 1.0 | HYPOTHESIS | Literature values for temperate Victorian growth forms, or measured. Current values are shaped by GnPR logic but are not from any published table and are not valid for Victorian species. |
| H-011 | Provenance weighting | 1.0 / 0.6 / 0.2 / −0.5 | HYPOTHESIS | Ordinal direction is defensible. Magnitudes are not. Sensitivity-test: does moving native_nonlocal 0.4↔0.8 reorder any existing record? |
| H-012 | Strata multiplier | 0.7 → 1.3 | HYPOTHESIS | Test against records with known strata counts and field observation quality. |
| H-013 | Persistence factor | container 0.6 → in_ground 1.0 | HYPOTHESIS | Ecologically motivated, but correlates with tenure and therefore wealth. Must be shown to be earned back within ~4 years of records. Applies to EC only. |
| H-014 | Network multiplier bounds | 0.95–1.20, ≥3 members | HYPOTHESIS | Bound chosen to prevent flattery, not derived. Needs a defensible basis in patch-connectivity literature. |
| H-020 | Envelope class thresholds | 15 / 50 / 150 / 600 m² | HYPOTHESIS | Display labels only. Validate against the distribution of real Melbourne lot and courtyard sizes, not intuition. |
| H-030 | Richness target = floor + k·log₂(1 + area·depth) | k = 4.0, floor = 6 | HYPOTHESIS | The log form is a guess. Test against species-area relationships for urban indigenous plantings. The floor of 6 is a stated ecological position and should be defended as such, not derived. |
| H-031 | Upper-stratum retargeting table | 4 vertical bands | HYPOTHESIS | **The most consequential table in the model.** Requires ecologist review. Developer judgement is not adequate here. |
| H-040 | Applicability floor | 0.35, cap ratio 0.7 | HYPOTHESIS | Chosen to prevent small-site drift toward 100. Test: what is the EP distribution of balcony fixtures with and without it? |
| H-041 | Non-waivable set + ceiling 45 | 5 indicators | HYPOTHESIS | The *set* is a policy position and should be argued, not tested. The ceiling value of 45 is a hypothesis. |
| H-050 | Soil ECU per m³ unsealed | 0.8 | HYPOTHESIS | Arbitrary. Needs anchoring against the ECU definition (H-060). |
| H-051 | Water ECU rates | 0.4 / 2.5 / 0.6 | HYPOTHESIS | Arbitrary. The fauna water point value in particular is doing important equity work and should be defensible. |
| H-052 | Habitat feature rates + 0.6 exponent | see locale pack | HYPOTHESIS | Diminishing-returns exponent is a guess. |
| H-060 | **The ECU unit itself** | divisor 8.0 | HYPOTHESIS | ECU is currently unanchored and therefore meaningless in absolute terms. Candidate anchor: 1 ECU = the effective indigenous leaf area of one mature indigenous shrub in good condition. Until anchored, EC may be used for *relative* comparison within a shadow run only. |

---

## Structural hypotheses (not numeric)

| ID | Hypothesis | Status | How we would know it is wrong |
|---|---|---|---|
| H-100 | Function-level indicators with envelope-level thresholds produce fair scores without inflating small sites | IN TEST | Balcony fixtures cluster above 85 regardless of quality, or a genuinely poor balcony scores well. |
| H-101 | EP calibrates within ±5 of v1 for the median existing record | NOT TESTED | Blocked on H-001 and Phase 1 envelope backfill. **This is the Phase 2 gate.** |
| H-102 | Tier anchors (32 / 50 / 91) survive with their existing meaning | NOT TESTED | Blocked on H-101. |
| H-103 | Stewards can understand three numbers | NOT TESTED | Test with 5 existing stewards before any public render. If they can only hold one, EP is the one. |
| H-104 | A locale pack can recalibrate thresholds without ever needing to add or remove an indicator | NOT TESTED | The SG pack (Phase 4) is the test. If SG requires a new indicator, the single-Registry claim fails and we need a different answer. |
| H-105 | EP is defensible as a distinct measure alongside an AfN-legible condition score, without being mistaken for an Econd | NOT TESTED | External review. Assume a reviewer will find this in the first hour. |
| H-106 | Envelope self-declaration can be made gaming-resistant through evidence + versioning | NOT TESTED | Attempt to game a fixture downward and see whether the review trigger catches it. |

---

## Rules of engagement

1. **No number leaves shadow.** Not in a deck, not in a council conversation, not on a profile, not in an email.
2. **No calibration before H-001.** Placeholder pillar caps make every EP figure meaningless.
3. **H-010a before anything else.** The vegetation-volume currency is upstream of EC, EC_potential and LO. Everything downstream is provisional until it is settled.
4. **Defects stay visible.** Do not quietly correct a defect found in a shadow run — log it here first so the reasoning survives.
5. **The register is the methodology document's first draft.** Every row that reaches `VALIDATED` becomes a paragraph with a citation.
