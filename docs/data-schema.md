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
  /g-[12 hex characters]/index.html                 Profile page (reads /data/[canonical data_file].json, recomputes)
  /[name][number]/field-notes/YYYY-MM-DD.html
/data/
  /registry.json                             Master snapshot file
  /[garden].json                              One per garden
  /species.json                               Master species database
/assets/                                     Images (target — base64 migration in progress)
/docs/                                       Subsystem docs (this folder)
/js/reg-score.js                                Scoring engine (canonical, ES5)
/js/badge-engine.js                             Badge engine (canonical, ES5)
/AGENTS.md
/CLAUDE.md
```

## File naming conventions

**Garden directories (legacy):** formerly lowercase short name + street number where useful: `arundel08`, `evelina23`, `dewrang17` (note: actual Dewrang directory is `dewrang1a`), `rupert14`, `windella40`, `york12`, `parringroad17`, `montAlbert100`, `middlesex80`, `nicholson10`, `parring11`. Numbering is inconsistent — confirm against `registry.json` `profile_url` before linking.

**Garden JSON files:** lowercase short name, no number. `arundel.json`, `york.json`. One garden = one JSON file at `/data/[short_name].json`. The path is stored in `registry.json` as `data_file`.

**Field note files:** ISO date. `2025-11-28.html`. The displayed date inside uses AU format (`28 Nov 2025`).

## Garden JSON schema

Shape taken from `york.json`. Fields are grouped by purpose.

### Identity (top level)

```jsonc
"garden_id":        "ER-AU-VIC-WHI-YRK-001",   // Format: ER-{COUNTRY}-{SUBDIVISION}-{REGION3}-{NAME3}-{NNN}  e.g. ER-AU-VIC-WHI-YRK-001
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
"designer":         "Gardener & Son",        // Display name of the designer or design practice
"designer_id":      "gardener-and-son",      // Stable slug — survives name changes; links to designer registry
"enroller":         "Gardener & Son",        // Who submitted this record to the registry (distinct from designer and verifier)
"verifier":         null,                    // Who independently confirmed the inputs; null until third-party audit exists
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
      "id":          "ER-AU-VIC-WHI-EVE-001",
      "name":        "Evelina",
      "distance_m":  340,
      "direction":   "NE",
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
  },           // Privacy-safe display coordinates are optional; precise coordinates stay private
}
```

**Connectivity field duplication is a real schema bug.** `cluster_area_ha` (flat) and `cluster.area_ha` (nested) can disagree — in York's data they do: `0` and `0.074`. The scoring engine reads the flat one and assigns 0 cluster-area points; the list page reads the nested one and shows 0.074ha. Either field can be wrong without the other catching it. Consolidate when the schema is next refactored.

**Map coordinates are optional.** If `connectivity.lat` and `connectivity.lng` are missing, the Leaflet map renders a "No coordinates in data" fallback. York's data is missing these — the map won't render. Use reviewed privacy-safe display coordinates when available; unmeasured coordinates remain unknown and precise coordinates belong in private storage.

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

**`rating.next` is currently wrong on most entries.** `reg-score.js` has a bug in `nextLevel()` — it returns the highest tier above the score, not the immediate next tier. For York at 52, next is reported as "Urban Biodiversity Node" (91, gap 39) instead of "Rich Habitat Garden" (61, gap 9). Rupert's entry shows the correct next-tier value, suggesting the bug was patched and re-patched inconsistently. **Fix `reg-score.js`, regenerate all rating snapshots together.** See `/docs/scoring-methodology.md`.

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

The current shape contains metadata and a `gardens` array. The following is a
source-derived example as at 12 Oct 2026; its numbers are an illustration, not a
second source of truth. Aggregate `statistics`, `network` and `leaderboard` blocks
are not maintained: client views derive them from the appropriate record cohort.

```json
{
  "gardens": [
    {
      "garden_id": "ER-AU-VIC-WHI-YRK-001",
      "garden_name": "York Street",
      "typology": "Urban Ecological Retrofit",
      "type": "Ecological Home Garden",
      "suburb": "Mont Albert",
      "state": "VIC",
      "council": "Whitehorse City Council",
      "ward": "Elgar",
      "lga": "Whitehorse",
      "score": 55,
      "rating": {
        "current": "Ecological Garden",
        "next": "Rich Habitat Garden",
        "points_to_next": 6
      },
      "primary_evc": "Plains Grassy Woodland (EVC 55)",
      "bioregion": "Gippsland Plain",
      "status": "Active / Establishing",
      "verification_level": "gardener_and_son_verified",
      "verification_label": "G&S Verified",
      "last_verified": "Apr 2026",
      "badge_count": 5,
      "badges": [
        "indigenous_dominant",
        "habitat_builder",
        "amphibian_active",
        "gs_verified",
        "fauna_record"
      ],
      "profile_url": "/gardens/g-ddaa8ef4d381/index.html",
      "data_file": "data/york.json",
      "registry_role": "Cluster Seed",
      "trajectory": "Rising",
      "points_available": 48,
      "cluster": {
        "name": "Whitehorse",
        "gardens": 3,
        "area_ha": 0.074,
        "status": "Forming"
      },
      "adjacent_garden_ids": [
        "ER-AU-VIC-WHI-VIC-001"
      ],
      "designer": "Gardener & Son",
      "designer_id": "gardener-and-son"
    }
  ]
}
```

## Registry snapshot discipline and remaining issues

`scripts/sync_registry.py` regenerates derived scores/ratings/badges from canonical
inputs and maintains index attribution. Run its check mode under its documented
private-coordinate requirements before applying a data migration. It removes
stored aggregate blocks; public views compute aggregates for the intended cohort.

After a garden change, reconcile canonical derived fields and the matching index
entry together. Preserve private coordinate/address boundaries. The reviewed
designer publication helper creates the canonical record, neutral profile and
index entry as one source change; live confirmation then links private details.

Remaining audits include canonical/index status consistency, optional field
coverage, legacy `type`/`typology` naming and advisory cluster scope. Historical
May figures and earlier rating bugs are not current source assertions; use
[current-state.md](current-state.md), [pending-work.md](pending-work.md) and actual
JSON when checking drift. Yield remains inactive and must not be inferred from an
aggregate or a score update.

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


## Neutral public profile routes

Garden profiles now use `/gardens/g-<12-character SHA-256 prefix>/index.html`, derived from the stable `garden_id`. New profiles use the same rule in `promote_submission.py`. Garden IDs, display names and data-file identities do not change. Existing street-name profile and field-note paths are noindex redirects that preserve the query string and fragment. The canonical profile paths and field-note references are updated in the public registry and garden records.

Precise garden addresses are never stored in these public records. The private Garden Facts address row calls `get_private_garden_details` with a verified garden-scoped steward session or an admin token. `er_admin = 1` is a UI flag only; it cannot authorise that request.

## Designer pilot private/public boundary

Private `Designer Practices` holds identity, contact email, credential hash and
status. Private `Designer Submissions` holds the candidate, address, steward email,
evidence link, consents and review history. These are not public JSON files.

The server derives practice identity from a validated token and forces initial
self-reported/Provisional status. Public canonical records carry `designer`,
`designer_id`, `managed_by: {type: "designer", designer_id: "..."}` and
`source_submission_id`; these are attribution, not credentials or verification.
`sync_registry.py` copies attribution into the public registry index. New designer
JSON files and profiles use neutral IDs. See [designer-pilot.md](designer-pilot.md).

The developer enquiry currently creates no stored project record or new schema.
Proposed lifecycle assessments and policy thresholds require separately reviewed
schema/method work; do not treat page principles as existing engine fields.

## Designer attribution registry — Phase 1

`data/designers.json` contains a `designers` array of stable `designer_id`,
`display_name`, `practice_name`, `url`, `status` (`active` / `invited`) and `joined`.
Unknown URLs and joining dates remain null. Contact emails and credentials stay
in private sheets. `designer_id: null` means no design practice is attributed;
self-enrolment is provenance rather than a practice.

`sync_registry.py` rejects unknown designer IDs and a practice verifying its own
work, except Gardener & Son under Tyson's explicit dogfooding exception. This is
studio verification, not an independent assessment. Scores remain governed by
existing ecological inputs and verification levels; attribution is never scored.

Sync writes `data/designers-derived.json`, keyed under `designers`, with
`garden_count`, `verified_count`, and `mean_verified_score`. Demo gardens are
excluded. Verified means an existing recognised level (`gardener_and_son_verified`,
`site_visit`, `photo_verified`), with neither canonical nor index status Provisional
or Design Proposal. Unrecognised `third_party_verified` is excluded. No verified
gardens means a null mean. Public pages use approximate display coordinates only.

For an attribution-only migration, run `python3 scripts/sync_registry.py
--attribution-only`. This path validates existing scores against the engine,
updates attribution and designer aggregates, and leaves ecological inputs,
ratings, badges, scores and coordinates unchanged. Full ecological sync retains
its existing private-coordinate/seed requirement. `--check` is read-only for both.


## Designer email access — Phase 2

The existing private `Designer Practices` sheet is the contact-email authority.
`Designer Access Tokens` stores token hashes, designer ID, creation, expiry and
a used flag. Links expire after 30 minutes and can be consumed once under a lock.
`Designer Sessions` stores token hashes, designer ID, creation and 180-day expiry.
Practice revocation/rotation expires both outstanding links and sessions. Public
views read public JSON only. Unrecognised emails receive the same success message
as recognised ones; a hashed per-email counter limits requests to three per hour.

## Upgrade routing — Phase 3 (pending deployment)

Private `Routing` rows: request_id, garden_id, opportunity_id, designer_id,
created, status, steward_consent, released_at, steward_email, response_deadline,
accepted_by, updated_at. The server obtains steward email from a valid existing
garden-scoped session and designer attribution from the canonical public record;
neither identity is accepted from request-supplied email/designer fields.
`Routing History` records request ID, timestamp, state, actor and notification
failures. No routing field enters scoring or public JSON.

Offer contact is withheld until original-practice acceptance. Released requests
are visible to G&S/admin with the request-specific consented email. States:
offered → accepted → completed; declined/expired/unassigned → released → accepted.
Completion is Registry-admin-only and does not apply ecological input changes.
The default response window is 14 days. `ROUTING_RESPONSE_MINUTES` is an optional
private script-property test override (minimum one minute); never publish it.
`installRoutingReleaseTrigger` installs one idempotent 15-minute release job;
queue reads also reconcile expired offers under the same lock.

## Designer demand aggregates — Phase 4 (pending)

Private `Designer Demand`: designer_id, aggregate_json, updated_at. Aggregate
keys: available, location_coverage (attributed_gardens / with_private_locations),
bands (four disjoint distance bands), months (YYYY-MM), evcs (code). Every lookup
count is either an integer >=5 or `<5`. No address, point or individual timestamp
is accepted or returned. Private script inputs stay git-ignored.

Private `Public Demand`: aggregate_json, updated_at. Public keys: total, months,
evcs, councils, channels. These are suppressed groups, not lookup rows. The public
site switches to this feed only after actual private calculation and import.
See [designer-demand.md](designer-demand.md) for conversion/exclusion limits and
publication gates. Neither schema contributes to ecological scoring.
