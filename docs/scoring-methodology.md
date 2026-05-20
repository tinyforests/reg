# Scoring Methodology

## The scoring engine

Total: **100 points across 5 pillars.** Computed by `reg-score.js` via `scoreEcologicalRegistry(record)`.

| Pillar | Max | What it measures |
|---|---|---|
| Biodiversity Structure | 25 | Indigenous species count, indigenous dominance, structural layers, canopy cover |
| Soil & Water Function | 20 | Soil health score, water function score, rainwater system, moisture basin, swale |
| Habitat Complexity | 20 | Habitat nodes, embedded logs, rock refuges, water feature, nest boxes, verified fauna sightings |
| Connectivity | 20 | Adjacency to parks (by distance), adjacent registered gardens, corridor node, cluster area |
| Evidence & Verification | 15 | Photos, field notes, species list, fauna record, professional assessment, verification level |

The engine returns:

```js
{
  total:             /* 0–100 */,
  scores:            { biodiversity, soil_water, habitat, connectivity, evidence },
  categories:        [/* label, score, max, notes for each pillar */],
  rating:            /* string from ratingFromScore */,
  nextLevel:         { name, target, gap, progress, benefits },
  recommendations:   [/* up to 5, sorted by points descending */],
  verificationLabel: /* display string */,
  baselineScore:     /* hypothetical score if all flags off, used for "before/after" */
}
```

## Pillar point allocations

Mirrored from `reg-score.js`. **If this section and the code drift, the code wins, and this section is re-synced.**

### Biodiversity Structure (25 pts)

| Component | Source field | Points |
|---|---|---|
| Indigenous species count | `biodiversity.indigenous_species_current` | 1–5 sp: 2 / 6–11: 4 / 12–19: 6 / 20–29: 8 / 30+: 10 |
| Indigenous dominant | `biodiversity.indigenous_dominant` | +4 if true |
| Structural layers | `biodiversity.structural_layers_current` | 2: 1 / 3: 3 / 4: 5 / 5+: 6 |
| Canopy cover (%) | `biodiversity.canopy_cover_pct_current` | 5–14%: 1 / 15–29%: 2 / 30–49%: 4 / 50%+: 5 |

Maximum: 10 + 4 + 6 + 5 = 25.

### Soil & Water Function (20 pts)

| Component | Source field | Points |
|---|---|---|
| Soil health | `soil_water.soil_health_score` (0–5 scale) | `round((soil/5) × 8)` — max 8 |
| Water function | `soil_water.water_function_score` (0–5 scale) | `round((water/5) × 7)` — max 7 |
| Rainwater system | `soil_water.has_rainwater_system` | +2 |
| Moisture basin | `soil_water.has_moisture_basin` | +2 |
| Swale | `soil_water.has_swale` | +1 |

Maximum: 8 + 7 + 2 + 2 + 1 = 20.

### Habitat Complexity (20 pts)

| Component | Source field | Points |
|---|---|---|
| Habitat nodes count | `habitat.habitat_nodes` | 1–2: 2 / 3–4: 4 / 5+: 6 |
| Embedded logs | `habitat.has_embedded_logs` | +3 |
| Rock refuges | `habitat.has_rock_refuges` | +2 |
| Water feature | `habitat.has_water_feature` | +3 |
| Nest boxes | `habitat.has_nest_boxes` | +2 |
| Verified fauna sightings | `habitat.fauna_sightings[].verified` | 1–2: 3 / 3+: 4 |

Maximum: 6 + 3 + 2 + 3 + 2 + 4 = 20.

### Connectivity (20 pts)

| Component | Source field | Points |
|---|---|---|
| Adjacent park | `connectivity.adjacent_park` + `park_distance_m` | ≤50m: 6 / ≤150m: 4 / ≤300m: 2 |
| Adjacent registered gardens (verified) | `connectivity.adjacent_registered_gardens[].verified` | 1: 3 / 2: 4 / 3+: 6 |
| Corridor node confirmed | `connectivity.corridor_node_confirmed` | +5 |
| Cluster area | `connectivity.cluster_area_ha` | ≥1ha: 1 / ≥2ha: 3 |

Maximum: 6 + 6 + 5 + 3 = 20.

### Evidence & Verification (15 pts)

| Component | Source field | Points |
|---|---|---|
| Photos | `evidence.has_photos` | +2 |
| Field notes | `evidence.has_field_notes` | +2 |
| Species list | `evidence.has_species_list` | +2 |
| Fauna record | `evidence.has_fauna_record` | +2 |
| Professional assessment | `evidence.has_professional_assessment` | +3 |
| Verification level | `evidence.verification_level` | `gardener_and_son_verified`: 4 / `site_visit`: 3 / `photo_verified`: 1 / `self_reported` or unset: 0 |

Maximum: 2 + 2 + 2 + 2 + 3 + 4 = 15.

## Rating tiers

Per `reg-score.js` (`ratingFromScore`), six tiers:

| Score | Rating |
|---|---|
| 0–20 | Basic Garden |
| 21–40 | Habitat Garden |
| 41–60 | Ecological Garden |
| 61–80 | Registered Ecological Garden |
| 81–90 | High Habitat Garden |
| 91–100 | Urban Biodiversity Node |

**Yield eligibility threshold: score ≥ 41 (Ecological Garden and above).** See `/docs/revenue-and-yield-rules.md`.

The scoring engine also returns a `nextLevel` object on every score result — name of the next tier, the gap in points, percent progress to that tier, and a benefits string — for use on profile pages and steward documents.

**Known bug: `nextLevel()` returns the maximum tier above the score, not the immediate next tier.** The function in `reg-score.js` iterates the levels array in descending order (91, 81, 61, 41, 21) and returns the first match, which is always the highest tier above the score. For a score of 52, the actual next tier is Registered Ecological Garden (61, gap 9), but the function returns Urban Biodiversity Node (91, gap 39). Most garden JSONs and `registry.json` entries reflect this buggy output (Rupert's entry is correctly patched and shows the immediate next tier — evidence of inconsistent fix attempts). To fix: reverse the iteration order so the loop returns the first tier strictly above the score. Then regenerate every garden's `rating.next` and `rating.points_to_next` snapshot.

## Implementation alignment (JS ↔ Python)

The scoring engine exists in JavaScript (`reg-score.js`, client-side, runs in the browser on profile pages). Per earlier project history, a Python implementation also exists for build scripts. **It has not been audited against this doc.** Next time a scoring change is made, run both implementations on the same garden record and assert equality before committing.

When changing scoring:

1. Update the JavaScript implementation.
2. Update the Python implementation. They must produce identical scores for identical inputs.
3. Update the **Pillar point allocations** section above to match.
4. Recalculate every garden's score and rating (and `score_breakdown` if it's stored — see open question in `/docs/data-schema.md`).
5. Recalculate `registry.json` statistics.
6. Add a decision-log entry in `/docs/decisions-log.md`.
7. Commit all changes in one commit.

A drift between JS and Python is a critical bug. Surface it before any other work continues.

## Verification levels

Per `reg-score.js` (`verificationLabelFromLevel`) and `badge-engine.js`, four `evidence.verification_level` values are recognised:

| Level | Display label | Score pts | Badge awarded |
|---|---|---|---|
| `gardener_and_son_verified` | G&S Verified | +4 | `gs_verified` |
| `site_visit` | Site Visit | +3 | `site_visit` |
| `photo_verified` | Photo Verified | +1 | (none) |
| `self_reported` | Self Reported | 0 | (none) |
| (anything else / unset) | Unverified | 0 | (none) |

`gardener_and_son_verified` is the highest tier and is required for full yield activation when the program goes live.

## Badge system

Badges are earned, not assigned. Each garden's `badges` array contains only the IDs of badges actually achieved. Badge criteria live in `badge-engine.js` — this doc mirrors that file. If they drift, the code wins, and this doc is re-synced.

Badges are returned in three categorised arrays plus a combined `all_badges`:

```js
{
  all_badges:          [...],
  score_badges:        [...],   // type: "score"        — Habitat & Function
  verification_badges: [...],   // type: "verification" — Verification
  evidence_badges:     [...]    // type: "evidence"     — Evidence
}
```

### Habitat & Function (score badges)

| Badge ID | Trigger | Read from |
|---|---|---|
| `indigenous_dominant` | `biodiversity.indigenous_dominant === true` | manual flag |
| `species_rich_20` | `biodiversity.indigenous_species_current >= 20` | count |
| `species_rich_30` | `biodiversity.indigenous_species_current >= 30` | count |
| `full_canopy` | `biodiversity.canopy_cover_pct_current >= 30` | percent |
| `five_layers` | `biodiversity.structural_layers_current >= 5` | count |
| `habitat_builder` | `habitat.habitat_nodes >= 3` | count |
| `amphibian_active` | at least 1 verified fauna sighting (see note) | derived |
| `pollinator_rich` | at least 3 verified fauna sightings | derived |
| `water_wise` | `soil_water.has_rainwater_system && soil_water.has_moisture_basin` | both booleans |
| `corridor_node` | `connectivity.corridor_node_confirmed === true` | manual flag |
| `network_connected` | 2+ adjacent verified registered gardens | derived |

### Verification

| Badge ID | Trigger |
|---|---|
| `gs_verified` | `evidence.verification_level === "gardener_and_son_verified"` |
| `site_visit` *or* `site_visit_badge` | `evidence.verification_level === "site_visit"` — see note below |

**Site Visit badge ID inconsistency.** The standalone `badge-engine.js` uses the ID `site_visit`. The inline badge engine in the York Street profile uses `site_visit_badge`. This is a real bug — pick one and migrate.

Recommendation: rename to `site_visit_badge` everywhere. The reason is that `site_visit` is already used as a `verification_level` value, and reusing the same string for the badge ID and the level it represents is exactly how confusing data bugs start. The badge has a `_badge` suffix that distinguishes it from the level. Log the rename in `/docs/decisions-log.md` when done.

### Evidence

| Badge ID | Trigger |
|---|---|
| `fauna_record` | at least 1 verified fauna sighting |
| `full_record` | photos + field notes + species list + fauna record all true |

### Known issues to fix

Two issues in the current badge engine to flag and address:

1. **`amphibian_active` is mis-triggered.** The badge description says "Verified amphibian sighting recorded in the garden" but the trigger is `verifiedFauna.length >= 1` with no check that the fauna is an amphibian. Today this fires on any verified fauna sighting — identical trigger to `fauna_record`. Either the trigger needs a species-type filter, or the badge should be renamed (e.g. `first_fauna`). Log the chosen fix in `/docs/decisions-log.md`.

2. **`corridor_node` relies on a manual boolean.** `connectivity.corridor_node_confirmed` is set by hand. The intent (per project history) is that this requires functional ecological connectivity, not just adjacency. The badge engine cannot enforce that — the discipline lives in how the boolean is set. See the section below.

### Corridor Node — earned, not assumed

The badge engine reads `connectivity.corridor_node_confirmed`. Do not set this to `true` based on adjacency alone. The defensible thresholds:

- Plants at least 12 months established
- Canopy or shrub layer closing — overhead cover present
- At least 15 indigenous species confirmed in the ground
- Ideally a documented fauna sighting

A freshly planted garden — even one with great design and great neighbours — does not earn this badge until function exists. Patience is the rule.

### Data shape the badge engine expects

`badge-engine.js` reads from a `record` object with this nested shape (distinct from the garden JSON profile schema — see open question in `/docs/data-schema.md`):

```jsonc
{
  "biodiversity": {
    "indigenous_dominant":         true,
    "indigenous_species_current":  29,
    "canopy_cover_pct_current":    15,
    "structural_layers_current":   4
  },
  "habitat": {
    "habitat_nodes":   3,
    "fauna_sightings": [ { "verified": true, /* ... */ } ]
  },
  "connectivity": {
    "corridor_node_confirmed":     false,
    "adjacent_registered_gardens": [ { "verified": true } ]
  },
  "evidence": {
    "verification_level":   "gardener_and_son_verified",
    "has_photos":           true,
    "has_field_notes":      true,
    "has_species_list":     true,
    "has_fauna_record":     true
  },
  "soil_water": {
    "has_rainwater_system": true,
    "has_moisture_basin":   true
  }
}
```

## Cluster scoring

The `cluster` object on each garden tracks the local network. A cluster is a geographic grouping (usually by suburb or LGA) where multiple registered gardens reinforce each other ecologically.

```jsonc
"cluster": {
  "name":     "Whitehorse",
  "gardens":  3,
  "area_ha":  0.018,
  "status":   "Emerging"   // Emerging | Active | Established
}
```

Cluster status thresholds are advisory — the meaningful number is `gardens`. Three or more gardens in one LGA is the credibility floor for a council pitch.

## Registry roles and trajectory

Two qualitative fields on every garden:

- **`registry_role`**: `Performer` | `Connector` | `Cluster Seed` | `Prototype`
- **`trajectory`**: `Rising` | `Stable` | `Emerging`

These are assigned editorially, not algorithmically. They give the registry a narrative layer beyond the score and are used in council and investor documents.
