# Engineering Weekly — Ecological Registry

**Week ending:** 4 September 2026
**Repo:** `reg` (ecologicalregistry.org) · **Prepared for:** CTO

---

## Headline

The Registry's ecological data layer is no longer structurally Victorian. A
national jurisdiction abstraction now sits in front of Victoria's EVC lookup, and
every registered garden carries a resolved **`ecological_context`** — its original
ecological community — sourced from state data where it exists and national data
where it doesn't. This is acquisition-relevant: any Australian address can now
return its original ecological community, with state-level detail where the state
publishes it, without a single garden outside Victoria.

Alongside that, several data-integrity and correctness fixes shipped to
production, and one new garden was registered.

---

## 1. National jurisdiction migration — Victoria behind the abstraction

**What.** Routed Victoria's Ecological Vegetation Class (EVC) lookup through the
`jurisdiction/` layer (previously inert), and taught the sync pipeline to write a
canonical `ecological_context` block onto every garden record alongside the
existing `evc` field. Two migration steps of five; steps 4–5 (moving display to
read the new block, then retiring `evc`) are deliberately deferred.

**Why.** What an acquirer buys is ledger authority, and the ledger was already
national — no EVC value enters the scoring path. The Victorian coupling was in
data plumbing, not the asset. Abstracting it now (a) removes the "Melbourne hobby
project" objection in a diligence room, (b) is the precondition for EVC-relative
benchmarking (one of two gaps an AfN-grade methodology audit named), and (c) makes
adding NSW later a day's work rather than a rebuild.

**How.**
- Confirmed the true production endpoint: findmyevc.com and the assessor tool both
  call the DEECA GeoServer **WFS**, not the ArcGIS service the abstraction assumed.
  Repointed the adapter to match production *exactly* (same service, not an
  equivalent) and rebuilt the parity proof against a live-captured payload.
- The Python sync shells out to a single JS entry point (no duplicated schema),
  resolving each garden from its **private** coordinates server-side. Coordinates
  are never persisted; the resolver returns classifications only, and the sync
  aborts if a coordinate ever appears in the output. **Verified: zero leaks.**
- Enrolment uses a **strict** posture: a point the state layer doesn't cover is
  recorded as state "nodata" and the national pre-1750 layer supplies the honest
  answer — never a nearest-neighbour guess baked into the ledger. Discovery tools
  keep their existing behaviour.

**Notable finding.** All 22 current gardens fall in gaps in Victoria's *extant*
vegetation layer (it doesn't map cleared residential lots), which means the stored
`evc` values were not derived from point lookups and disagree with a live lookup
for two-thirds of records. The new `ecological_context` gives the defensible
national pre-clearing community instead. This matters for step 4 (display) and is
worth a product decision on which value the public profile should show.

**Guardrails held.** No scoring change; the scoring engine is neither imported nor
touched. Parity proof 12/12; scoring parity 26/0. Each step is a separate,
independently revertable commit.

**When.** Steps 2–3 complete and on a review branch, pending a local smoke-test of
the assessor tool before merge. Steps 4–5 (display migration) are a separate,
sequenced piece. NSW adapter is written and disabled — enable when a NSW reason
exists (interstate designer, council conversation, or acquirer ask).

---

## 2. Registry data integrity

**What & why.** Two correctness fixes on the public registry:
- The browse list had drifted from the garden profiles (e.g. a garden shown as
  "Nicholson" on the list but "Urban Meadow" on its own page). The per-garden
  record is now the single source of truth for the display name, reconciled into
  the list on every sync, so the two can no longer diverge.
- Removed personal names from public garden names (steward first names) as a
  privacy/consistency measure.

**How.** Extended the sync to propagate the display name (and map-popup neighbour
labels) from each garden's record; stripped the names at source and re-synced.
Result: list matches every profile, sync idempotent.

**When.** Shipped to production.

---

## 3. New registered garden + partner-record correctness

**What & why.**
- Registered **The Garden Trail** (Surrey Hills) from the design record — 20-plant
  palette, EVC/council/coordinates resolved, an existing-site weed correctly
  excluded, and its network connectivity to two neighbouring gardens recognised
  (which also lifted their scores — the intended cluster effect).
- **Forest Hill** (a Gardens for Wildlife-assessed garden) was relisted and its
  verification relabelled from an ambiguous "Council/G4W" marker to **"Gardens for
  Wildlife Verified"** — naming the actual verifying program, without implying
  Registry or Council verification. Verification level and score unchanged.
- Fixed a **dead public contact email** (`registry@…` → the working inbox) across
  the site.

**When.** All shipped to production.

**Honesty note.** The Garden Trail's ecological scores are provisional G&S
estimates pending an on-site assessment (flagged in the record); its connectivity
is real geography.

---

## 4. Risks & what's next

| Item | Status | Note |
|---|---|---|
| `assess.html` (assessor tool) routed through the abstraction | Needs browser smoke-test | Adds a module import + two national service calls; CORS confirmed clear. Verify EVC auto-fill before merge. |
| Deployed Apps Script `Code.gs` diverged from the repo | **Blocked** | Reconcile the true live version into version control; blocked on an interactive `clasp` re-auth. |
| Display migration (jurisdiction steps 4–5) | Deferred | Move profiles to read `ecological_context`; decide which vegetation value the public profile shows. |
| Provisional scores on newest gardens | Open | Swap estimates for measured assessment data as site visits occur. |
| Precise-coordinate hygiene (council pilot) | Open | Confirm no precise GPS remains in public JSON; presentational vs. actual. |

---

## One-line summary for the exec channel

*Made the Registry's ecological data national-ready (Victoria is now one
implementation, not the definition), with privacy and scoring untouched; fixed
registry name drift and a dead contact email; registered one new garden.*
