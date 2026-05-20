# Current State

This file moves. Update it whenever the registry state changes meaningfully. **Quote `registry.json` and individual garden JSONs as canonical, not this file.**

**Last updated:** 20 May 2026 (Victoria Crescent added; `registry.json` snapshot dated "May 2026").

## Headline numbers

- **Total registered gardens:** 12 (per `registry_metadata.total_gardens`)
- **Average score:** 46 (per `statistics.average_score`, averaged over gardens with `score > 0`)
- **Total badges awarded:** 46 (per `statistics.total_badges_awarded`)
- **Species in database:** 143 per `registry.json` `network.total_species`. Project memory says 166. The `network` stats block is stale and should be ignored. Verify against `species.json` metadata.
- **Yield status:** Pre-activation. Snapshotted potentials exist in garden JSONs; no disbursement.

## Gardens (from registry.json)

| # | Garden | Suburb | LGA | Score | Rating | Badges | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Arundel | Surrey Hills | Boroondara | 73 | Registered Ecological Garden | 6 | Highest score, longest archive |
| 2 | Nicholson | South Yarra | Stonnington | 29 | Habitat Garden | 2 | Inner-Melbourne urban retrofit |
| 3 | Parring | Balwyn | Boroondara | 50 | Ecological Garden | 6 | |
| 4 | Middlesex | Surrey Hills | Boroondara | 54 | Ecological Garden | 5 | Adjacent to Surrey Hills Reserve |
| 5 | Mont Albert | Canterbury | Boroondara | 0 | Design Proposal | 1 | G&S studio garden, proposal stage |
| 6 | Evelina | Mont Albert North | Whitehorse | 45 | Ecological Garden | 4 | Wild Native Meadow typology |
| 7 | Dewrang | Blackburn | Whitehorse | 50 | Ecological Garden | 6 | Multi-zone, species_rich_30 earned |
| 8 | Parring Road | Balwyn | Boroondara | 11 | Basic Garden | 1 | Design proposal stage |
| 9 | Rupert | Northcote | Darebin | 52 | Ecological Garden | 5 | **Demo garden** — landing-page example |
| 10 | Windella | Kew East | Boroondara | 49 | Ecological Garden | 1 | Establishing |
| 11 | York Street | Mont Albert | Whitehorse | 52 | Ecological Garden | 5 | Cluster Seed, Rising |
| 12 | Victoria Crescent | Mont Albert | Whitehorse | 42 | Ecological Garden | 4 | Heathy Edge Habitat Garden, Cluster Seed, Emerging |

Scores match `registry.json` snapshot. York Street's score was previously misquoted in these docs as 37 — it is 52.

## Council distribution

From `network.councils` in `registry.json`:

| Council / LGA | Gardens |
|---|---|
| Boroondara | 6 |
| Whitehorse | 4 |
| Stonnington | 1 |
| Darebin | 1 |

**Boroondara cluster:** Arundel, Parring, Middlesex, Mont Albert, Parring Road, Windella.
**Whitehorse cluster:** Evelina, Dewrang, York Street, Victoria Crescent.
**Stonnington:** Nicholson.
**Darebin:** Rupert (demo).

**Council pilot trigger:** 5 registered gardens minimum per LGA. **Boroondara is over the threshold at 6.** Whitehorse sits at 4 and is the relationship-first target.

## Suburb-level clusters (from registry.json `cluster` objects)

| Cluster | Gardens | Area (ha) | Status |
|---|---|---|---|
| Boroondara (Windella entry only) | 6 | 0.68 | Forming |
| Surrey Hills | 2 | 0.48 | Forming |
| Whitehorse | 4 | 0.074 | Forming |
| Balwyn | 2 | 0.12 | Forming |
| Northcote | 1 | 0.018 | Emerging |
| Mont Albert North | 1 | 0.0024 | Emerging |
| Blackburn | 1 | 0.025 | Emerging |
| South Yarra | 1 | 0.06 | Emerging |

These cluster objects are inconsistently scoped — some gardens use LGA-wide clusters (e.g. York's cluster is "Whitehorse" with 3 gardens), others use suburb (e.g. Arundel's cluster is "Surrey Hills" with 2 gardens). Decide on a scoping rule (LGA vs suburb) and migrate. Until then, treat the cluster object as advisory, not authoritative.

## Leaderboard (from registry.json)

- **Top score:** Arundel at 73
- **Most badges:** Arundel (6)
- **Highest upgrade potential:** Nicholson (51 points available)

## Typology distribution

- Heathy Edge Habitat Garden (1): Victoria Crescent
- Urban Ecological Retrofit (3): Nicholson, Rupert, York Street
- Ecological Forest Garden (1): Arundel
- Ecological Cottage Garden (2 + 1 legacy): Parring, Windella; Mont Albert uses `type` not `typology`
- Connected Habitat Landscape (2): Middlesex, Parring Road
- Wild Native Meadow (1): Evelina
- Multi-Zone Ecological Garden (1): Dewrang

## Registry role distribution

- Performer: Arundel
- Connector: Parring, Middlesex, Parring Road
- Cluster Seed: Nicholson, Evelina, Dewrang, Windella, York Street, Victoria Crescent
- Prototype: Rupert (demo)
- (none / unset): Mont Albert

## Demo garden

**Rupert** (Northcote, Darebin) has `status: "Demo garden"` in `registry.json` and `registry_role: "Prototype"`. Fictional stewards (Claire & Tom in project memory). Score 52, 5 badges. Do not promote Rupert as a real registered garden in any council, investor, or steward-facing document.

## What to verify before quoting publicly

1. Recount `total_gardens` from `registry.json` `gardens.length`.
2. Recalculate `statistics.average_score` excluding score-0 gardens.
3. Recalculate `statistics.total_badges_awarded` by summing `badge_count` across all entries.
4. Recalculate `network.councils` by grouping `lga`.
5. Confirm Rupert is still flagged as `"Demo garden"`.
6. Confirm species count against `species.json` metadata, not the stale `network.total_species`.
7. **Do not quote `network.avg_score`, `network.total_badges`, `network.total_species`, or `network.total_gardens`.** They are stale.

## Known data hygiene issues

(Move these to `/docs/decisions-log.md` when resolved.)

- `registry.json`'s `network` block is stale and disagrees with the `statistics` block.
- `rating.next` is wrong on most garden entries except Rupert and Victoria Crescent. `nextLevel()` in `reg-score.js` is now fixed (iteration order reversed, 20 May 2026) — remaining snapshots need regeneration.
- `type` / `typology` field name drift across entries.
- Mont Albert has `rating: "Design Proposal"` as a string, not the object shape used by other entries.
- Some clusters scoped by suburb, others by LGA — inconsistent.
- `species.json` species count is unverified against the `166` figure in project memory.
