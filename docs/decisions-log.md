# Decisions Log

The long-term institutional memory of the Registry. Every meaningful product, scoring, naming, schema, or design decision gets an entry here.

**Entry order: reverse chronological. Newest at the top.**

## Entry template

```
## YYYY-MM-DD — [decision title]

**Decision:** What was decided, in one or two sentences.

**Reason:** Why this decision was made. What problem it solves, what alternative it replaces, what risk it manages.

**Files affected:** Concrete paths.

**Notes:** Optional — caveats, links, follow-up items.
```

---

## 2026-05-20 — Fix nextLevel() bug; add Victoria Crescent; add Heathy Edge Habitat Garden typology

**Decision:** Three changes in one session. (1) `nextLevel()` in `reg-score.js` now iterates rating tiers in ascending order, returning the immediate next tier instead of the maximum tier above the score. (2) Victoria Crescent (Mont Albert, Whitehorse, score 42) added to the registry as garden #12. (3) "Heathy Edge Habitat Garden" added to the canonical typology vocabulary.

**Reason:** (1) The descending iteration meant a score of 52 reported "Urban Biodiversity Node (gap 39)" instead of "Registered Ecological Garden (gap 9)" — wrong on every profile except Rupert. Snapshots in most garden JSONs and `registry.json` reflect the buggy output and still need regeneration (see pending-work). (2) Victoria Crescent was already in `data/victoria.json` and `registry.json` but absent from the docs. (3) Victoria's typology was not in the curated vocabulary list — adding it per the rule that new typologies require a decision-log entry.

**Files affected:**
- `/js/reg-score.js` (nextLevel fix — reversed levels array order, removed redundant min:0 entry)
- `/docs/current-state.md` (12 gardens, updated Whitehorse count, council distribution, cluster, typology and role distributions)
- `/docs/data-schema.md` (Heathy Edge Habitat Garden added to typology vocabulary)
- `/docs/decisions-log.md` (this entry)

**Notes:** `rating.next` snapshots on all garden JSONs except Rupert and Victoria Crescent still reflect the old buggy output. Fix: run `nextLevelFromScore` against each garden's score and update `rating.next` / `rating.points_to_next` in both the garden JSON and `registry.json`. Logged in `/docs/pending-work.md`. The `estimateBaseline` → `scoreEcologicalRegistry` infinite recursion is also logged in pending-work — pre-existing, not introduced here.

---

## 2026-05-19 — Integrate SUPER_MIND.md and AI_CONTEXT.md as senior documents

**Decision:** SUPER_MIND.md and AI_CONTEXT.md sit at the repo root as senior documents above AGENTS.md. They are universal across all G&S repos (Registry, Village Rewards, fmeg/fmevc/fmnp, Heirloom, future). AGENTS.md becomes the engineering-specific layer beneath them.

**Reason:** The Registry docs answer how the code, data, and schema work. SUPER_MIND.md answers what the work is for — the four-stage spine (Culture → Discovery → Registry → Incentives), the operating Minds, the tone discipline. Without the senior frame, an engineering agent can build the right schema and the wrong product. With it, every change passes through both gates: does this work mechanically (AGENTS.md + docs), and does it serve the system (SUPER_MIND.md + AI_CONTEXT.md).

**Read order established:**

1. `/SUPER_MIND.md` — strategic frame, every session
2. `/AI_CONTEXT.md` — quick-start tone and rules
3. `/AGENTS.md` — repo-specific engineering brief
4. `/docs/[relevant].md` — subsystem detail

**Five practical-rule questions added to AGENTS.md** as the operational gate before any change:

1. Does this strengthen the whole system?
2. Does this still feel true to Gardener & Son?
3. Is it beautiful, useful, ecological, and legible?
4. Is the public language grounded?
5. Are the gardens, objects, registry, discovery, and incentives still connected?

If any answer is no, the agent surfaces the conflict before proceeding.

**Files affected:**
- `/AGENTS.md` (updated — senior-doc references, practical-rule questions, before-editing flow updated)
- `/docs/registry-product-brief.md` (rewritten lean — defers to SUPER_MIND for strategy, retains engineering specifics)
- `/docs/decisions-log.md` (this entry)

**Notes:** SUPER_MIND.md and AI_CONTEXT.md themselves are not in this repo's /docs/ — they belong at the repo root and are shared across all G&S repos. Tyson's draft of these documents is the source. If they ever need to be updated, the update happens at the source and propagates to all G&S repos.

---



**Decision:** Garden JSON schema, registry strategy, current state, and known-bugs registry have been re-synced against the actual `registry.json` and `york.json` files. Three substantial findings, plus several smaller corrections.

**Findings:**

1. **Strategy A is in use.** `registry.json` carries snapshotted scores, ratings, and badges. The list page reads these without running the engines. Garden JSONs ALSO carry computed snapshots (`rating`, `upgrade_potential`, `points_available`, `yield`). The profile renderer ignores these and recomputes from inputs; the list page uses the snapshot. **Implication: a build script (or careful manual recalc) is required after every garden change.** Today this is manual; making it automatic is the highest-leverage infrastructure investment.

2. **`reg-score.js` `nextLevel()` has a real bug.** It returns the maximum tier above the score, not the immediate next tier. For score 52, it returns Urban Biodiversity Node (91, gap 39) instead of Registered Ecological Garden (61, gap 9). Most garden JSONs and `registry.json` entries reflect the buggy output. Rupert's entry is correctly patched, evidence of an earlier inconsistent fix. **Fix the engine, regenerate all `rating.next` and `rating.points_to_next` snapshots.**

3. **Yield data exists, yield UI doesn't.** Every garden JSON carries a full `yield` block. No profile template renders it. The doctrine in `/docs/revenue-and-yield-rules.md` has been updated to reflect this: data is ready, surface is held pending a deliberate decision.

**Smaller corrections:**

- York Street score: 52, not 37 (was a fabricated number in earlier docs).
- Nicholson is in Stonnington, not Boroondara.
- Council distribution verified: Boroondara 6, Whitehorse 3, Stonnington 1, Darebin 1.
- `typology`, `registry_role`, `trajectory`, `yield` ALL exist in the real garden JSON — they were not "missing fields" as the previous reconciliation claimed. They are simply not rendered by the profile template.
- `garden_type` and `typology` coexist as distinct fields. `garden_type` (free-text descriptor) renders on profile hero. `typology` (curated strategic vocabulary) renders on list page.
- `type` is a legacy field still present on some `registry.json` entries (Mont Albert, Parring Road, Rupert, Windella, York Street). Migrate to `typology`.
- Mont Albert's `rating` is a string ("Design Proposal"), not an object — schema inconsistency.
- `registry.json` `network` block is stale: `network.total_gardens: 7` (actual 11), `network.avg_score: 50` (`statistics.average_score` says 46), `network.total_badges: 30` (`statistics.total_badges_awarded` says 42), `network.total_species: 143` (project memory says 166). Two stats blocks should not coexist.
- Cluster shape is duplicated and inconsistent: flat fields (`connectivity.cluster_name`, `connectivity.cluster_area_ha`) AND a nested `connectivity.cluster` object can disagree. In York's data they do (`cluster_area_ha: 0` vs `cluster.area_ha: 0.074`). The scoring engine reads the flat one.
- York's garden JSON is missing `connectivity.lat` and `connectivity.lng`. The Leaflet map will show the "No coordinates in data" fallback.
- Additional fields discovered and documented: `species_proposed`, `mulch_type`, `assessor`, `verification_label` (stored on garden JSON), `category` (on activity log entries), `soil_health_max`, `water_function_max`.
- Typology vocabulary in use: Urban Ecological Retrofit, Ecological Forest Garden, Ecological Cottage Garden, Connected Habitat Landscape, Wild Native Meadow, Multi-Zone Ecological Garden.
- Registry role values in use: Performer, Connector, Cluster Seed, Prototype.

**Files affected:**
- `/docs/data-schema.md` (full rewrite — registry.json strategy, snapshot fields, known issues catalogue)
- `/docs/current-state.md` (full rewrite — verified gardens table, correct council distribution, typology and role distributions)
- `/docs/scoring-methodology.md` (`nextLevel` bug documented)
- `/docs/revenue-and-yield-rules.md` (yield section status corrected: data exists, UI held)
- `/docs/decisions-log.md` (this entry)

**Open follow-ups, in priority order:**
1. Fix `reg-score.js` `nextLevel()` — reverse iteration order, regenerate every `rating.next` snapshot. One commit.
2. Build (or write a one-shot script for) the registry recalc pipeline: garden JSON → engines → garden snapshot → registry.json. Without this, every manual update will drift.
3. Delete or regenerate the stale `network` block in `registry.json`. Pick one stats source.
4. Migrate `type` → `typology` across all `registry.json` entries. Decide which is canonical and remove the other.
5. Normalise Mont Albert's `rating` field to the object shape.
6. Decide cluster scoping rule (LGA-wide vs suburb) and migrate.
7. Resolve the flat vs nested cluster field duplication in `connectivity`.
8. Add `lat`/`lng` to garden JSONs that lack them (York at minimum).
9. Verify species count against `species.json` metadata.
10. Implement the yield section on profile pages (deliberate decision, decision-log entry required).
11. Resolve `site_visit` vs `site_visit_badge` badge ID inconsistency.
12. Remove the dead `#badgeNotification` system from the profile template.
13. `amphibian_active` badge: rename or add species-type filter.

That's a lot. Most are small, but #2 (the build pipeline) and #1 (the `nextLevel` fix) should come first. Without #2, every other fix risks introducing more drift.

---

## 2026-05-19 — Reconcile docs to York Street profile renderer

**Decision:** The garden JSON schema, design system tokens, profile section structure, and yield section status in `/docs/` have been re-synced to match the actual York Street profile template.

**Reason:** The schema previously documented (`score_breakdown`, `score`, `rating`, top-level `cluster`, `primary_evc` string, `yield` object, etc.) does not match what the renderer actually reads. Garden JSONs store inputs only; scores, badges, ratings, recommendations and baseline are all computed at render time. Several palette tokens were missing. The yield section is not present on real profiles.

**Changes:**

1. **Garden JSON shape rewritten.** Real shape is the rich nested structure consumed directly by `reg-score.js` and `badge-engine.js`. No `score_breakdown`, no stored `score`, no stored `rating`. EVC is a nested `evc` object, not a string. Cluster info lives inside `connectivity`, not top-level. Activity log entries carry `{date, title, type, notes, note_url}`, not `{date, event}`. Added `milestones`, `weed_pressure`, `species_list` (under biodiversity), `fauna_sightings` (under habitat with `verified` boolean), full map coordinates (`lat`/`lng`/`park_lat`/`park_lng`), `effective_ecological_area_ha`, and baseline counterparts for every measured field.

2. **Field name rename status documented.** `garden_type` is the live field name. `typology` is referenced in earlier docs but not in the York renderer. Marked as a verification item.

3. **Fields documented in earlier docs but not in real data flagged.** `registry_role`, `trajectory`, top-level `cluster`, `primary_evc`/`bioregion` strings, `yield` block — all noted as absent and held for future decisions.

4. **Palette expanded from 4 to 7 tokens.** Real Tailwind config: `rg`, `rb`, `rs`, `rl`, `rdp`, `rdl`, `signal`. Signal Green is `#7a9e5f` for the Registry (distinct from Village Rewards `#a8c285`).

5. **Canopy is the default mode.** Documented `<html class="dark">` as default state.

6. **Border-radius rule clarified.** `* { border-radius: 0 !important; }` is enforced globally. The only exceptions are Leaflet map markers (circular), which set `border-radius: 50% !important`.

7. **Profile section structure rewritten** to match the seven sections actually rendered: Hero (with embedded score box), Signals, Score Breakdown, Network Position, Species List, Trajectory, Field Record. No separate yield section.

8. **`site_visit` vs `site_visit_badge` bug surfaced.** Standalone `badge-engine.js` uses `site_visit`; inline York profile uses `site_visit_badge`. Recommended rename to `site_visit_badge` everywhere (to distinguish badge ID from verification level value).

9. **Yield section status corrected.** Not yet implemented on profiles. Doctrine kept (every profile *will* carry a yield section); reality recorded (no profile does today).

10. **`registry.json` strategy left open.** Unresolved whether scores in `registry.json` are snapshotted (strategy A, requires build script) or computed live by the list page (strategy B). Flagged as a blocker before the next garden is added.

11. **Dead notification system flagged.** The York template still contains CSS and JS for an older `#badgeNotification` element that is no longer in the body. Slated for removal.

**Files affected:**
- `/docs/data-schema.md` (full rewrite)
- `/docs/design-system.md` (full rewrite)
- `/docs/scoring-methodology.md` (verification badge ID note)
- `/docs/revenue-and-yield-rules.md` (yield section status)
- `/docs/decisions-log.md` (this entry)

**Open follow-ups:**
- Send a real garden JSON to confirm whether `typology`, `registry_role`, `trajectory` exist in the data but are unused, or do not exist at all.
- Send `registry.json` to resolve the snapshot vs live strategy question.
- Decide and implement the `site_visit_badge` rename.
- Decide and implement the yield section (or formally remove it from doctrine).
- Remove the dead `#badgeNotification` system from the profile template.

---

## 2026-05-19 — Reconcile scoring methodology to reg-score.js

**Decision:** Scoring methodology, rating tiers, verification levels, and yield eligibility threshold in `/docs/` have been re-synced to match `reg-score.js` and `badge-engine.js`.

**Reason:** The docs are the read-on-every-session brief for any agent working on the repo. They must match the running code. They didn't.

**Changes:**

1. **Rating tiers** — doc was 5 tiers ("Garden / Habitat / Ecological / Registered / Reference"); code is 6 tiers ("Basic Garden / Habitat Garden / Ecological Garden / Registered Ecological Garden / High Habitat Garden / Urban Biodiversity Node"). Doc updated. "Reference Ecological Garden" appears nowhere in the code and is not in use.
2. **Yield eligibility threshold** — doc said ≥ 40; code uses ≥ 41 (the Ecological Garden tier starts at 41 in `ratingFromScore`). Doc and York Street's gap (37 → 41 = 4 pts, not 3) updated.
3. **Verification levels** — doc listed `self_assessed` and `professional_assessed`; code recognises four values: `gardener_and_son_verified` (+4 pts, `gs_verified` badge), `site_visit` (+3 pts, `site_visit` badge), `photo_verified` (+1 pt), `self_reported` (0 pts). Doc updated.
4. **Point allocations** — previously deferred to code; now mirrored in `/docs/scoring-methodology.md` as a table per pillar.
5. **Badge list** — replaced placeholder six-badge list with the actual fifteen badges defined in `badge-engine.js`.
6. **`amphibian_active` bug surfaced** — fires on any verified fauna, not amphibian-specific. Open issue.

**Files affected:**
- `/docs/scoring-methodology.md`
- `/docs/revenue-and-yield-rules.md`
- `/docs/current-state.md`
- `/docs/decisions-log.md`

**Open follow-ups:**
- Confirm whether the Python implementation referenced in earlier project history still exists, and if so, audit it against `reg-score.js` for parity.
- `amphibian_active` badge fires on any verified fauna, not amphibian-specific. Decide: rename badge, or add species-type filter to the trigger.

---

## 2026-05-19 — Adopt AGENTS.md + /docs/ knowledge system

**Decision:** Replace the single CLAUDE.md operating brief with AGENTS.md as the canonical cross-agent entry point, mirrored by a thin CLAUDE.md, with subsystem detail extracted into `/docs/`.

**Reason:** A single file was carrying agent instructions, product definition, schema, scoring, design, and current state. As the Registry grows this becomes heavy and brittle. Current state needs to drift independently from stable doctrine. Decisions need their own log. Other agents (Cursor, Codex, Aider) follow the AGENTS.md convention.

**Files affected:**
- `/AGENTS.md` (new, canonical)
- `/CLAUDE.md` (new, thin mirror)
- `/docs/registry-product-brief.md`
- `/docs/scoring-methodology.md`
- `/docs/data-schema.md`
- `/docs/design-system.md`
- `/docs/field-notes-method.md`
- `/docs/revenue-and-yield-rules.md`
- `/docs/current-state.md`
- `/docs/pending-work.md`
- `/docs/decisions-log.md` (this file)

**Notes:** Earlier major decisions (scoring rebalance, Canopy/Understory rename, typology field, registry_role/trajectory fields, yield section, demo garden flag) are not retroactively logged. If any are re-litigated, add an entry then.

---

## How to add an entry

1. Append a new section at the top (immediately under "Entry template").
2. Use today's date in ISO format.
3. Keep each entry under ~150 words where possible. Link to docs or commits for detail. Larger reconciliation entries are fine when they span multiple files.
4. Commit the decision log entry in the same commit as the change it documents.

## What deserves an entry

- Schema additions, removals, or renames
- Scoring threshold changes
- Rating tier changes
- Yield formula or eligibility changes
- New badge criteria
- Design system changes (palette, typography, geometry rules)
- Naming changes (e.g. "type" → "typology", "Light/Dark" → "Canopy/Understory")
- Strategic positioning changes (audience framing, revenue sequence)
- Workflow changes (how gardens are added, how field notes are published)

## What does not need an entry

- Routine garden additions (the act of registering a garden is captured in the garden JSON and `registry.json` — not a decision)
- Routine field note publications
- Content edits to copy
- Bug fixes that preserve behaviour
- Minor visual tweaks within the existing design system

When in doubt, log it.
