# Data Schema

The Registry stores data in three places: `registry.json` (the master list, used by the registry list page), one JSON per garden under `/data/` (used by profile pages and as the source for `registry.json` snapshots), and `species.json` (master species database).

## Two engines, one shape

The garden JSON carries **both inputs and snapshotted outputs**:

- **Inputs** — read by `reg-score.js` and `badge-engine.js` on profile pages. Fresh score and badges computed at render time.
- **Snapshotted outputs** — `rating`, `upgrade_potential`, `points_available`, `yield`. Stored on the garden JSON and copied into `registry.json`. Used by the registry list page (which does not run the engines). Updated when a garden changes.

**Discipline:** every change to a garden's input fields must regenerate its snapshotted outputs and propagate to `registry.json` in the same commit. Otherwise the list page lies. A build script (or careful manual recalc) is required — see "Registry.json strategy" below.

## Repository structure

```
/index.html                                  Landing page
/registry.html                               Public registry list (reads registry.json snapshots)
/gardens/
  /[name][number]/index.html                 Profile page (reads /data/[name].json, recomputes)
  /[name][number]/field-notes/YYYY-MM-DD.html
/data/
  /registry.json                             Master snapshot file
  /[garden].json                              One per garden
  /species.json                               Master species database
/assets/                                     Images (target — base64 migration in progress)
/docs/                                       Subsystem docs (this folder)
/reg-score.js                                Scoring engine (canonical, ES5)
/badge-engine.js                             Badge engine (canonical, ES5)
/AGENTS.md
/CLAUDE.md
```

## File naming conventions

**Garden directories:** lowercase short name + street number where useful: `arundel08`, `evelina23`, `dewrang17` (note: actual Dewrang directory is `dewrang1a`), `rupert14`, `windella40`, `york12`, `parringroad17`, `montAlbert100`, `middlesex80`, `nicholson10`, `parring11`. Numbering is inconsistent — confirm against `registry.json` `profile_url` before linking.

**Garden JSON files:** lowercase short name, no number. `arundel.json`, `york.json`. One garden = one JSON file at `/data/[short_name].json`. The path is stored in `registry.json` as `data_file`.

**Field note files:** ISO date. `2025-11-28.html`. The displayed date inside uses AU format (`28 Nov 2025`).

## Garden JSON schema

Shape taken from `york.json`. Fields are grouped by purpose.

### Identity (top level)

```jsonc
"garden_id":        "ER-VIC-WHI-YRK-001",   // Format: ER-VIC-{LGA3}-{NAME3}-{NNN}
"garden_name":      "York Street",
"garden_type":      "Ecological Home Garden",   // Free-text descriptor, displayed in hero
"typology":         "Urban Ecological Retrofit", // Strategic typology — see typology values below
"registry_role":    "Cluster Seed",          // Performer | Connector | Cluster Seed | Prototype
"trajectory":       "Rising",                // Rising | Stable | Emerging
"suburb":           "Mont Albert",
"state":            "VIC",
"council":          "Whitehorse City Council",
"ward":             "Elgar",
"lga":              "Whitehorse",
"assessment_date":  "Apr 2026",              // Latest assessment
"baseline_date":    "2025",                  // Registration / baseline year — sometimes a year only
"stewards":         "Gentile and Effy",
"designer":         "Gardener & Son",
"area_sqm":         0,                       // Note: 0 is permitted when area is unmeasured
"target_score":     75,
"description":      "Approx 320 chars compressed prose. No marketing language."
```

**Note on field name drift:** `garden_type` is rendered by the profile template. `typology` is rendered on the registry list page (and used in strategic documents). Some older registry entries use `type` (legacy) instead of `typology`. Some use both. Treat `typology` as canonical and migrate `type` → `typology` over time.

### EVC (nested)

```jsonc
"evc": {
  "name":            "Grassy Woodland",
  "code":            "EVC 175",
  "bioregion":       "Victorian Volcanic Plain",
  "bioregion_code":  "VVP"
}
```

`registry.json` flattens this into top-level fields (`primary_evc: "Grassy Woodland (EVC 175)"`, `bioregion: "Victorian Volcanic Plain"`) — a denormalisation for the list page.

### Pillar inputs (read by engines)

```jsonc
"biodiversity": {
  "indigenous_species_current":  19,
  "indigenous_species_baseline": 0,
  "indigenous_species_target":   19,
  "indigenous_dominant":         true,
  "structural_layers_current":   3,
  "structural_layers_baseline":  0,
  "canopy_cover_pct_current":    5,
  "canopy_cover_pct_baseline":   0,
  "weed_pressure":               "Low",      // Display only — free-text
  "weed_pressure_baseline":      "High",     // Display only — free-text
  "species_list":                [ "Pycnosorus globosus", "Scaevola Mauve Clusters" ],
  "species_proposed":            [ /* planned species, optional */ ]
},

"soil_water": {
  "soil_health_score":       4,              // 0–5 scale
  "soil_health_baseline":    1,
  "soil_health_max":         5,              // Always 5, optional metadata
  "water_function_score":    4,              // 0–5 scale
  "water_function_baseline": 1,
  "water_function_max":      5,
  "has_rainwater_system":    false,
  "has_moisture_basin":      false,
  "has_swale":               true,
  "mulch_type":              "Arborist mulch" // Display only — optional
},

"habitat": {
  "habitat_nodes":          4,
  "habitat_nodes_baseline": 0,
  "has_embedded_logs":      true,
  "has_rock_refuges":       true,
  "has_water_feature":      false,
  "has_nest_boxes":         false,
  "planting_method":        "Ecological planting with imported soil...",  // Free-text
  "fauna_sightings": [
    {
      "species":  "Australian Magpie",
      "verified": true,
      "date":     "2025",
      "notes":    "Observed foraging in garden"
    }
  ]
},

"connectivity": {
  "adjacent_park":                false,
  "park_distance_m":              0,
  "park_name":                    "Mont Albert Reserve",   // Optional, for map popup
  "park_lat":                     -37.814,                 // Optional, for map render
  "park_lng":                     145.106,
  "adjacent_registered_gardens": [
    {
      "id":          "ER-VIC-WHI-EVE-001",
      "name":        "Evelina",
      "distance_m":  340,
      "direction":   "NE",
      "lat":         -37.812,
      "lng":         145.108,
      "verified":    true
    }
  ],
  "corridor_node_confirmed":      false,
  "cluster_name":                 "Whitehorse",     // Flat — used by some renderers
  "cluster_area_ha":              0,                // Flat — READ BY SCORING ENGINE
  "effective_ecological_area_ha": 0,
  "cluster": {                                       // Nested — used by list page
    "name":     "Whitehorse",
    "gardens":  3,
    "area_ha":  0.074,
    "status":   "Forming"
  },
  "lat":                          -37.815,           // Garden coordinates — required for Leaflet map
  "lng":                          145.105
}
```

**Connectivity field duplication is a real schema bug.** `cluster_area_ha` (flat) and `cluster.area_ha` (nested) can disagree — in York's data they do: `0` and `0.074`. The scoring engine reads the flat one and assigns 0 cluster-area points; the list page reads the nested one and shows 0.074ha. Either field can be wrong without the other catching it. Consolidate when the schema is next refactored.

**Map coordinates are optional.** If `connectivity.lat` and `connectivity.lng` are missing, the Leaflet map renders a "No coordinates in data" fallback. York's data is missing these — the map won't render. Add coordinates when populating new gardens.

### Evidence (read by engines)

```jsonc
"evidence": {
  "has_photos":                  true,
  "has_field_notes":             false,
  "has_species_list":            true,
  "has_fauna_record":            true,
  "has_professional_assessment": true,
  "verification_level":          "gardener_and_son_verified",
  "verification_label":          "G&S Verified",     // Snapshotted — engine recomputes via verLabel()
  "assessor":                    "Gardener & Son"    // Display only
}
```

### Narrative

```jsonc
"activity_log": [
  {
    "date":     "2025",
    "title":    "Garden installed -- native planting with habitat rocks",
    "type":     "Installation",                       // Display label
    "category": "installation",                       // Internal taxonomy, lowercase
    "notes":    "18 species planted across groundcover, shrub and small tree layers...",
    "note_url": "/gardens/york12/field-notes/2025-11-28.html"  // Optional link to field note
  }
],

"milestones": [
  { "title": "Garden installed",   "date": "2025",    "complete": true  },
  { "title": "Ecological baseline","date": "Jun 2026","complete": false }
]
```

### Snapshotted outputs (computed, but stored)

These are computed by `reg-score.js` and stored on the garden JSON for the registry list page. **They must be regenerated whenever input fields change.**

```jsonc
"rating": {
  "current":        "Ecological Garden",
  "next":           "Urban Biodiversity Node",       // See bug note below
  "points_to_next": 39
},
"upgrade_potential": 48,                              // 100 - score
"points_available":  48,                              // Duplicate of upgrade_potential
"yield": {
  "eligible":         true,                           // score >= 41
  "status":           "Pending activation",           // "Pending activation" if eligible, "Not yet eligible" if not
  "estimated_annual": 0,                              // Always 0 until yield program activates
  "potential_annual": 250,
  "currency":         "AUD",
  "formula_note":     "Score x area x connectivity x verification. Formula v1.",
  "upgrades": [
    { "action": "Add water feature",            "annual_yield_increase": 35 },
    { "action": "Install habitat logs",         "annual_yield_increase": 25 }
  ]
}
```

**`rating.next` is currently wrong on most entries.** `reg-score.js` has a bug in `nextLevel()` — it returns the highest tier above the score, not the immediate next tier. For York at 52, next is reported as "Urban Biodiversity Node" (91, gap 39) instead of "Registered Ecological Garden" (61, gap 9). Rupert's entry shows the correct next-tier value, suggesting the bug was patched and re-patched inconsistently. **Fix `reg-score.js`, regenerate all rating snapshots together.** See `/docs/scoring-methodology.md`.

**The yield section is data-only.** Yield values are stored, but the profile template does not yet render them. When yield is rolled out to the profile UI, it reads from this block.

## Typology values

From `registry.json` entries, the typology vocabulary in use:

- Urban Ecological Retrofit
- Ecological Forest Garden
- Ecological Cottage Garden
- Connected Habitat Landscape
- Wild Native Meadow
- Multi-Zone Ecological Garden
- Heathy Edge Habitat Garden

This is a curated, editorial list. New typologies should not be invented per-garden — extend the vocabulary deliberately and add a decision-log entry.

## Registry.json schema

`registry.json` is the master snapshot. It is read by the registry list page and other surfaces (council reports, public summaries) without running the engines.

```jsonc
{
  "registry_metadata": {
    "version":         "1.0",
    "schema_version":  "2.0",
    "last_updated":    "Mar 2026",
    "total_gardens":   11,
    "data_custodian":  "Gardener & Son",
    "contact":         "registry@gardenerandson.com.au"
  },
  "statistics": {
    "average_score":         46,        // Averaged over gardens with score > 0
    "total_badges_awarded":  42
  },
  "network": {
    "total_gardens":           7,        // STALE — see below
    "total_area_ha":           1.187,
    "active_clusters":         6,
    "gardens_in_establishment":5,
    "avg_score":               50,       // STALE — disagrees with statistics.average_score
    "total_species":           143,      // STALE — disagrees with species.json metadata
    "total_badges":            30,       // STALE — disagrees with statistics.total_badges_awarded
    "total_estimated_yield_aud": 1150,
    "yield_note":              "Estimated annual yield if sponsor model activated. Formula v1.",
    "yield_status":            "Pre-activation -- sponsor model pending",
    "councils":                { "Boroondara": 6, "Stonnington": 1, "Whitehorse": 3, "Darebin": 1 },
    "total_councils":          4
  },
  "leaderboard": {
    "top_garden":                "Arundel",
    "top_score":                 73,
    "most_badges":               "Arundel",
    "highest_upgrade_potential": "Nicholson",
    "rankings": [
      { "garden": "Arundel", "score": 73 }
    ]
  },
  "gardens": [
    {
      "garden_id":          "ER-VIC-WHI-YRK-001",
      "garden_name":        "York Street",
      "typology":           "Urban Ecological Retrofit",
      "type":               "Ecological Home Garden",     // Legacy field — present on some entries
      "suburb":             "Mont Albert",
      "state":              "VIC",
      "council":            "Whitehorse City Council",
      "ward":               "Elgar",
      "lga":                "Whitehorse",
      "score":              52,
      "rating":             { "current": "...", "next": "...", "points_to_next": 39 },
      "primary_evc":        "Grassy Woodland (EVC 175)",
      "bioregion":          "Victorian Volcanic Plain",
      "status":             "Active / Establishing",
      "verification_level": "gardener_and_son_verified",
      "verification_label": "G&S Verified",
      "last_verified":      "Apr 2026",
      "badge_count":        5,
      "badges":             [ "gs_verified", "indigenous_dominant", ... ],
      "profile_url":        "/gardens/york12/index.html",
      "data_file":          "data/york.json",
      "registry_role":      "Cluster Seed",
      "trajectory":         "Rising",
      "points_available":   48,
      "cluster":            { "name": "Whitehorse", "gardens": 3, "area_ha": 0.074, "status": "Forming" }
    }
  ]
}
```

## Known issues in registry.json

These need a coordinated cleanup pass. Logging here so they are not forgotten.

1. **Two stats blocks disagree.** `statistics.average_score: 46` ≠ `network.avg_score: 50`. `statistics.total_badges_awarded: 42` ≠ `network.total_badges: 30`. `network.total_gardens: 7` but actual count is 11. The `network` block is stale. Either delete it or regenerate it; do not let two sources of truth coexist.

2. **`network.total_species: 143` is stale.** Project state says 166. Confirm against `species.json` metadata.

3. **`type` vs `typology` drift.** Mont Albert has only `type`. Parring Road, Rupert, Windella, York Street have both. Arundel, Nicholson, Parring, Middlesex, Evelina, Dewrang have only `typology`. Pick one; migrate. Recommendation: `typology` is canonical.

4. **`rating` shape inconsistency.** Mont Albert has `rating: "Design Proposal"` as a string. All others have `rating: {current, next, points_to_next}` as an object. The list page must handle both; ideally Mont Albert uses `rating: {current: "Design Proposal", next: null, points_to_next: 0}`.

5. **`rating.next` bug.** Most entries report the maximum-tier as next instead of the immediate-next tier (see `reg-score.js` `nextLevel` bug above). Rupert is correct; everything else needs regeneration after the engine fix.

6. **Some garden entries are missing fields.** Mont Albert lacks `registry_role`, `trajectory`, `points_available`, `cluster`. Each garden should have a complete shape — backfill or document why these are optional.

## Registry.json strategy = Strategy A (snapshot)

The list page reads scores and badges directly from `registry.json` rather than recomputing. This is fast but requires a build script (or careful manual process) that runs after every garden change:

1. Read garden JSON.
2. Run `scoreEcologicalRegistry(record)` and `awardBadges(record)`.
3. Update garden JSON's `rating`, `upgrade_potential`, `points_available`, `yield` snapshot fields.
4. Update the matching entry in `registry.json` (`score`, `rating`, `badges`, `badge_count`, `points_available`, `verification_level`, etc.).
5. Recompute `statistics.average_score`, `statistics.total_badges_awarded`, `network.councils`, etc.
6. Delete or regenerate the stale `network` block.

Until a build script exists, this is manual. Easy to miss a step — flag it as the next infrastructure investment.

## Species.json structure

The master species database. Garden JSONs reference species by `botanical_name` string inside `biodiversity.species_list`. The profile renderer iterates and italicises each name — it does not currently look anything up from `species.json`.

Provisional structure (confirm against the real `species.json`):

```jsonc
{
  "metadata": {
    "total_species":  166,
    "last_updated":   "Apr 2026"
  },
  "species": [
    {
      "botanical_name":  "Wahlenbergia gracilis",
      "common_name":     "Sprawling Bluebell",
      "layer":           "forb",
      "family":          "Campanulaceae",
      "notes":           "indigenous",
      "gardens":         ["arundel", "evelina", "york"]
    }
  ]
}
```

## Encoding

All JSON files are written ASCII-only. When generating via Python, write with `encoding='ascii', errors='replace'`. This avoids encoding issues on static hosting and keeps diffs clean. No smart quotes, no em-dashes inside JSON string values — use ASCII equivalents. (`york.json` already uses `--` instead of em-dashes in prose.)
