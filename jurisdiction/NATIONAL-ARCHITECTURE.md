# REG National Jurisdiction Architecture

**Status:** Phase 1 proposal + working proof
**Date:** 23 August 2026
**Scope:** architecture only, no rollout

---

## 0. The finding that changes the shape of this work

The brief assumes the Registry is Victorian and needs to be extracted. It mostly isn't.

The engine audit of 24 July 2026 established that **no EVC value is read anywhere in the scoring path**. Biodiversity scores against fixed absolute species-count thresholds. Connectivity uses distance bands and an assessor-asserted corridor-node tick. Habitat Value and Vicmap canopy are not consumed by any pillar. The Registry ID format `ER-[STATE]-[LOCALITY]-[CODE]-####` is already jurisdiction-parameterised.

So the ledger — the thing being sold in a 12-month exit — is already national. What is Victorian is:

1. the **discovery layer** (findmyevc / findmyecologicalgarden / findmynativeplants), which is Victorian by design and by name;
2. a stored **`evc` field** on garden records, used for display and as an input to `assess.html`;
3. **copy and labels** across profiles and marketing;
4. the **plant-list mapping**, keyed on EVC.

That reframes the work. Phase 1 and Phase 2 are small — a day or two, not a rebuild. The genuinely hard part is Phase 3, and the thing worth arguing about is Phase 4.

---

## 1. Audit of Victorian assumptions

I don't have the repo, so this is (a) what prior sessions established and (b) a script that produces the rest.

Run:

```bash
cd ~/Projects/reg
bash tools/audit-victorian-assumptions.sh
less AUDIT-VIC-ASSUMPTIONS.txt
```

It tiers hits by layer. **Tier 1 is the only blocking tier** — any EVC/NatureKit/Vicmap reference inside `js/reg-score.js` or `scripts/` contradicts the July audit and must be resolved before anything else. Expect none.

Known Victorian coupling from prior work:

| Location | Coupling | Action |
|---|---|---|
| `js/reg-score.js` | none expected — verify | confirm and record |
| `scripts/sync_registry.py` | reads `evc` from input JSON | becomes `ecological_context.original_vegetation` |
| `data/*.json` | `evc` top-level key on ~20 records | migrate, keep old key as alias for one release |
| `assess.html` | EVC as a manual assessment input | relabel to "original ecological community"; value unchanged |
| profile pages | EVC in display copy | jurisdiction-driven label |
| fmeg / fmevc / fmnp | Victorian end-to-end | **separate repos, out of scope for this iteration** |

The garden with `evc: null` (Kate's Forest Hill record, built from the Whitehorse G4W report) is the useful test case: it already exercises the "no local vegetation data, register anyway" path that the fallback hierarchy formalises.

---

## 2. Jurisdiction resolver

`jurisdiction/resolver.js`. Property coordinates in, `{country, jurisdiction}` out. There is no code path by which a visitor IP could enter this function — the signature takes `(lat, lng)` and nothing else.

Resolution order:

1. **explicit override** — manual correction, and how tests pin a jurisdiction
2. **trusted interior box** — offline fast path, only for boxes provably inside one jurisdiction. Ships with Greater Melbourne, which covers every garden currently on the Registry, so the common case costs zero network calls
3. **authoritative polygon** — ABS ASGS State & Territory boundaries
4. **`nodata`** — never guess

Point 3 matters more than it looks. Australian state bounding boxes overlap heavily; Victoria's overlaps NSW's and SA's. A bbox can never be used to *choose* between candidates, only to assert membership of a box wholly inside one state. The resolver is written so that adding a bad interior box is the only way to break it, and each entry carries a note stating the claim being made.

Non-Australian coordinates return `{country: null}` rather than an error. That is the seam where `/sg` attaches.

---

## 3. Adapter interface

```js
{
  id: 'AU-VIC',
  country: 'AU',
  jurisdiction: 'VIC',
  capabilities: { original_vegetation: 'available', habitat_context: 'investigate', ... },
  async getOriginalVegetationContext(location, ctx) -> ContextRecord,
  async getBioregionContext(location, ctx)          -> ContextRecord,
  ...
}
```

Conceptual method names only. `getEVC()` does not exist above the VIC adapter and `getPCT()` will not exist above the NSW one.

`ctx` carries `{ fetchImpl, now, datasetVersions }`. Injecting `fetch` and `now` is what makes the whole layer testable offline and makes provenance timestamps deterministic in CI.

Capability declarations use `available | investigate | unsupported | delegated`. `delegated` means "the national adapter answers this" — Victoria doesn't publish its own bioregion layer for Registry purposes, IBRA does it nationally, and pretending otherwise would duplicate a national dataset behind a state name.

**Missing capabilities never block registration.** The orchestrator in `index.js` skips any capability not marked `available` and moves on.

---

## 4. Canonical schema

Built as a **superset of the resolver schema already locked on 15 August** — `system / code / name / resolution / source / status` — so fmeg, fmevc and fmnp remain drop-in readers and no parallel schema is introduced.

```json
{
  "ecological_context": {
    "schema_version": "1.0.0-draft",
    "resolved_at": "2026-08-23T00:00:00.000Z",
    "jurisdiction": {
      "country": "AU", "jurisdiction": "VIC",
      "resolver_method": "trusted_interior",
      "resolver_source": "Greater Melbourne — wholly within Victoria"
    },
    "original_vegetation": {
      "system": "EVC", "code": "175", "name": "Grassy Woodland",
      "resolution": "state", "source": "DEECA NV2005_EVCBCS", "status": "ok",
      "extra": {
        "bioregional_conservation_status": "Endangered",
        "victorian_bioregion": "Gippsland Plain"
      },
      "provenance": {
        "authority": "Victorian Government (DEECA)",
        "dataset": "NV2005_EVCBCS", "dataset_version": null,
        "service_url": "https://...MapServer/27",
        "lookup_method": "arcgis:query:point-in-polygon",
        "queried_at": "2026-08-23T00:00:00.000Z",
        "jurisdiction": "VIC", "reproducible": true
      }
    },
    "bioregion": { "system": "IBRA", "...": "..." },
    "national_vegetation": { "system": "NVIS MVS", "resolution": "national", "...": "..." }
  }
}
```

Three design decisions worth defending:

**`extra` is where local science lives.** Bioregional Conservation Status is Victorian. Keith vegetation class and formation are NSW. RE land zone is Queensland. None have national analogues, so none get flattened into shared keys. They ride along verbatim under `extra`, and the public record can display them under the local system's own name.

**Status stays at two values.** `ok` and `nodata`, unchanged from the locked decision. A capability that was never queried is **absent from the object entirely**. That gives three distinguishable facts with no new enum:

- key absent → we did not ask
- `status: "nodata"` → we asked, no coverage here
- `status: "ok"` → we asked, here is the answer

**Zero is structurally impossible.** No constructor in `schema.js` can emit `0` as a placeholder, and the proof asserts it across an all-empty response.

When a state lookup returns `nodata` and the national fallback fires, the failed state attempt is preserved as `original_vegetation_state_attempt`. Losing it would erase the evidence that Victorian mapping has a gap at that address — which is exactly the sort of thing a verifier needs to see.

---

## 5. Migration approach — Victoria behind the VIC adapter

Sequence, each step independently revertable:

1. Land `jurisdiction/` with the VIC adapter and `toLegacyEvcResult()`. Nothing calls it yet. Proof runs in CI beside `test_parity.py`.
2. Point the Victorian EVC call site at `toLegacyEvcResult(resolveEcologicalContext(...).original_vegetation)`. Output identical; no record changes.
3. Teach `sync_registry.py` to write `ecological_context` alongside the existing `evc` key. Both present for one release.
4. Move display code to read `ecological_context`. `evc` becomes a computed alias.
5. Drop `evc` once nothing reads it.

**Before step 2, set `EVC_SERVICE` in `adapters/vic.js` to whatever findmyevc.com calls in production today.** The confirmed DEECA endpoint in the file may not be the live one, and output parity means *the same service*, not an equivalent one. Do not improve the endpoint during this refactor.

**Do not run this against records under external review.** Kate's Forest Hill record and anything else mid-review keeps its current JSON untouched until the migration is complete and verified elsewhere.

---

## 6. Privacy — the constraint the brief doesn't name

The 15 August build removed precise coordinates from public JSON. They now live only in `data/private/coords.json`, git-ignored, read by `sync_registry.py` via `ER_COORD_SEED`. Public records carry `display_lat`/`display_lng`, offset ~250 m.

That makes the obvious implementation illegal. **A client-side ecological lookup on a garden profile page would need the precise coordinates the privacy build just removed.** Wiring one would silently undo that work.

So there are two call sites, with different postures:

| Call site | Coordinates | When | Storage |
|---|---|---|---|
| **Registry enrolment** | private, precise | once, inside `sync_registry.py` | resolved classification baked into public JSON; coordinates never leave the private store |
| **Discovery** (fmevc/fmeg) | the visitor's own address | live, client-side | ephemeral + demand log |

`resolveEcologicalContext()` returns classifications only — no coordinates in the return value, by construction. A garden's original ecological community is not a location; it holds across a whole polygon. Publishing it discloses nothing the fuzzed pin doesn't already.

One outstanding item this touches: the still-to-build Apps Script `get_precise_coords` path. If ecological context is resolved at sync time, that endpoint does **not** need to exist for this feature — one less authenticated surface.

---

## 7. NSW as first non-Victorian implementation

**Technically: yes, clearly the right choice.**

- Public ArcGIS REST, no token, confirmed reachable
- Pre-clearing PCT is a distinct published layer — a true original-community source, which TAS and ACT do not have
- 5 m raster, finer than Victoria's EVC modelling
- Version string in the service description (`vC2_0_M2_2`) — real provenance

It is a good architectural test precisely because it is *structurally different* from Victoria: raster identify vs vector query, EPSG:3308 vs 4283, MapServer vs FeatureServer semantics. An abstraction that survives both is real. That is why `adapters/nsw.js` exists in this drop, written and disabled.

Two caveats:

- **Central NSW pre-clearing coverage is a work in progress** per the authority. `nodata` in central NSW is a correct answer, not a defect, and the fallback must be visible in the UI before this goes live.
- The field names in `adapters/nsw.js` are **inferred from the raster attribute table description, not observed.** Run `tools/capture-fixtures.mjs` against a Sydney address and correct them before enabling.

**Strategically: I'd stop after Phase 3.**

You revised the exit horizon to 12 months on 19 August. What an acquirer buys is ledger authority — verified gardens, council citations, an independent verification network. NSW support with zero NSW gardens and no NSW council relationship is a story, not an asset.

But Phase 3 *is* an asset, and a cheap one. Once IBRA and NVIS attach to every Australian property, the sentence changes from "we have a Victorian tool" to "any Australian address returns its original ecological community, with state-level detail where the state publishes it." That kills the "Melbourne hobby project" objection in a due-diligence room without requiring a single garden outside Victoria. Phase 4 doesn't add to that sentence; it only makes it true in more places, and nobody is auditing that.

Recommendation: **Phases 1–3 now. Phase 4 when a NSW reason exists** — an interstate designer enrolling, a NSW council conversation, an acquirer asking. The disabled NSW adapter means that becomes a day's work, not a project.

---

## 8. What is deliberately not being built

**`getHabitatContext()` and `getCanopyContext()`.** No Registry pillar consumes habitat value or canopy today. Building the interfaces now means shipping methods with no callers, and the capability matrix shows most jurisdictions are `investigate` anyway. They are declared in the capability schema — so the gap is *recorded* — and absent from the resolved record. When a consumer exists, the interface is a small addition to an already-proven pattern.

This also protects the harder principle. Victoria's Habitat Value is a continuous 0–100 score. Queensland's RE Biodiversity Status is an ordinal category. NSW's Biodiversity Values Map is a binary regulatory trigger. The pressure to average them into one national number will be strongest at the moment someone wants a national leaderboard. Not building the pipe is a better defence than a comment saying don't.

**Renaming Find My EVC.** Not this iteration, as specified. fmevc ranks in Google and gets the most traffic of the three sites — that ranking is an asset and renaming risks it. The right move is a national sibling under a new name, with fmevc kept as the Victorian entry point. `Find Your Ecological Community` and the line *"Before there was a suburb here, there was an ecological community. Find yours."* both work, but that's a separate decision with SEO consequences.

---

## 9. One tension worth naming

The brief says jurisdictional data must not silently alter the score. Agreed, and the code honours it — nothing in `jurisdiction/` imports or touches `reg-score.js`.

But the AfN methodology audit named **EVC-relative benchmarking** as one of two disqualifying gaps. Closing it means scoring biodiversity against the reference community for that place instead of fixed absolute species counts — which is precisely jurisdictional data entering the scoring path.

Both positions are right. The resolution: this layer is a **precondition** for benchmarking, not a trigger for it. When benchmarking is designed, it will be a versioned method change with its own review, and it will need exactly this abstraction to work outside Victoria — because "score against the reference community" is meaningless nationally unless "reference community" is a concept rather than an EVC.

Worth writing into Method v1.1 as a forward note now, so the sequencing is on the record before anyone builds it.

---

## 10. Proof

```bash
node jurisdiction/test/proof.mjs
```

```
PASS  VIC output is byte-identical through the abstraction
PASS  VIC still queries the same endpoint with the same parameters
PASS  jurisdiction resolved from property coordinates, not a visitor
PASS  local identity keeps Victorian terminology verbatim
PASS  national context attaches alongside, not instead of, local identity
PASS  provenance survives the abstraction
PASS  state gap falls back to national, correctly labelled
PASS  the failed state attempt is preserved, not discarded
PASS  a NSW property registers with national context before NSW is built
PASS  no coverage anywhere records nodata, never zero
PASS  capabilities never queried are absent, not nulled
PASS  a non-Australian property still registers, with no fabricated context

12/12 checks passed
```

The first check is the one that answers the brief: it runs the current Victorian lookup longhand, runs the same lookup through the abstraction, and asserts the two are identical by `deepStrictEqual` **and** by serialised string — not equivalent, identical.

Runs offline against published-shape fixtures so it can sit beside `test_parity.py` as a pre-commit check. **Capture live payloads before treating it as evidence about the live services:**

```bash
node tools/capture-fixtures.mjs -37.8203 145.0867   # a Melbourne garden
node tools/capture-fixtures.mjs -33.8688 151.2093   # Sydney, for NSW fields
```

---

## The question the brief asked

> Can the Ecological Registry accept any Australian garden location, determine its jurisdiction, call the best available local ecological-data system, fall back to national data where necessary, and return that information through one consistent Registry schema?

Yes. It does it in `resolveEcologicalContext()`, and checks 7, 9 and 10 above demonstrate each half of it. Victoria is now one implementation of the system rather than the definition of it — and the honest reason that was achievable in a single drop is that the ledger was never really Victorian to begin with.
