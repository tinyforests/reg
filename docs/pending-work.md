# Pending Work

Known unfinished items. Move items out of this file as they complete (and into the decision log if they involve a meaningful decision).

## High priority

### Sir Garnet — registered May 2026, GPS and documentation pending

30 Sir Garnet Road, Surrey Hills. Registered May 2026. Score 50, Ecological Garden, tier 3. Front Native Buffer Garden only (rear cottage pollinator garden explicitly excluded). GPS surveyed via Google Maps long-press. Coordinates of adjacent council nature strip (park_lat -37.82133, park_lng 145.09043) approximate — confirm on next site visit. Photo documentation and iNaturalist fauna records are 30-day actions for Richard & Jenny — score will rise when documented.

### Demand nudges — inject Registry prompts into fmeg/fmevc/fmnp search results

Demand dashboard built (`demand.html`, `data/evc-demand.json`). 382 lookups, Nov 2025–Feb 2026. 61% within 2km of a registered garden.

Next phase: contextual nudges injected into search results on the three fmg sites linking a searcher to their nearest registered garden. Requires changes to the fmeg, fmevc, and fmnp repos — not this one.

### fmnp HTTPS — broken

`findmynativeplants.com.au` has a broken HTTPS configuration.

**Fix path:** GitHub Pages + GoDaddy DNS. A records and CNAME configuration. Enforce HTTPS checkbox in GitHub Pages settings.

This is outside the Registry repo but tracked here because it blocks the unified reporting work above.

### Canterbury G02 — registered as baseline 16 Jun 2026, follow-ups pending

G02 / 352–358 Canterbury Road, Surrey Hills. Pre-intervention baseline registered with score 32 (Habitat Garden tier). First non-G&S-install garden in the registry. verification_level: site_visit (will move to gardener_and_son_verified after design intervention is installed; commissioned, expected within 1–3 months).

Follow-ups:
- Confirm Boroondara ward for Canterbury Road at this location (currently 'TBC — confirm with Boroondara council' in record). Likely Junction, Bellevue, or Cotham — not Gardiner (that's north Surrey Hills, Sir Garnet's ward).
- Confirm Surrey Park park_lat/park_lng at next site visit (currently approximate -37.8265, 145.096).
- Confirm mulch_depth_mm and mains_drip_irrigation status at next site visit.

The trajectory recorded from baseline 16 Jun 2026 → post-intervention score will be the registry's first independently-legible before/after evidence for a non-G&S-install garden. Strategic value to the Boroondara council pitch and to AfN-grade methodology.

## Medium priority

### Council pilot — first signed pilot

Target: Whitehorse first (home council). Triggered when Whitehorse reaches five registered gardens. Currently at three (Evelina, Dewrang, York Street).

Boroondara is over threshold (six gardens) but Whitehorse is the relationship-first target.

### Sponsor pipeline outreach

For the Yield layer to activate, three sponsor categories need engagement:

1. Local government (Whitehorse, Boroondara, Stonnington)
2. Corporate sustainability programs
3. Philanthropic foundations

Status: pipeline exists in conceptual form, no active conversations yet.

### Surrey Hills cluster — area_sqm audit required

Stored area_sqm values are inconsistent with steward-measured actuals: Arundel JSON has 180m² (actual ~800m²); Middlesex JSON has 200m² (actual ~11.25m²); Sir Garnet 5.5m². Cluster area_ha currently 0.48–0.49 across files; correct measured total is ~0.082ha (816m²). Needs coordinated correction across `data/arundel.json`, `data/middlesex.json`, `data/sirgarnet.json`, `data/registry.json` in a single audit commit. Do NOT correct piecemeal.

### Define area_sqm and cluster_area_ha canonically

Without a written definition, every new garden re-introduces the ambiguity. Proposed: `area_sqm` = measured planted indigenous garden area only — not the whole front yard or property. `cluster_area_ha` = sum of measured planted areas across cluster members, divided by 10,000. Add to `AGENTS.md` or a dedicated methodology doc before the next area audit commit.

## Low priority / longer term

### assess.html — multiple named fauna sightings

`pollinator_rich` requires 3+ verified fauna sightings. The form currently generates N sighting entries from a count field, but entries 2+ are placeholders ("Additional sighting N") rather than real species names. Extend the fauna section to allow entry of multiple named sightings if accurate pollinator richness data is needed.

### Public registration path

Currently every garden is added via G&S (paid Steward Review). A future public registration path needs:

- Self-assessment form
- Photo upload pipeline
- Verification queue
- Tiering UI (self_assessed / professional_assessed / gardener_and_son_verified)

### YIELD methodology page

The yield formula is currently `"formula_note": "Score x area x connectivity x verification. Formula v1."` This needs a public methodology page explaining the formula transparently before yield activates.

### Decisions log backfill

The decisions log is starting fresh. Earlier major decisions (scoring rebalance, Canopy/Understory rename, typology field addition, registry_role and trajectory fields, yield section addition) deserve retrospective entries if they ever need to be re-litigated.

### Per-species indigenous classification — v1.0 schema upgrade

All 13 (now 14) gardens store `species_list` as flat string arrays. Per-species objects (`{name, indigenous}`) would require a coordinated template upgrade across all garden profile pages — the rendering loop at ~line 611 of the profile template concatenates species directly as strings. Introduce the structured form across all gardens simultaneously with the template upgrade. Do not introduce piecemeal.

### Network block aggregate fields — drift-prone

`network.avg_score`, `network.gardens_in_establishment`, and council counts (e.g. `network.councils.Boroondara`) are manually maintained and drift with each new garden addition. Auto-compute from the gardens array via a build step, or document as known-stale. Each new garden currently requires manual updates to multiple aggregate fields — same drift risk as the Surrey Hills cluster count.

### Yield block honesty audit — pre-Sir-Garnet gardens

All 13 gardens registered before Sir Garnet (Victoria Crescent, Arundel, Middlesex, Mont Albert, Parring, Parring Stepping Stone, Nicholson, Evelina, Dewrang, York, Flinders, Rupert, Windella — confirm full list when audit runs) carry `yield.eligible: true` with non-zero `potential_annual` figures. Per SUPER_MIND doc the yield layer is sponsor-funded and not active. Sir Garnet uses the honest pattern: `eligible: false`, `status: 'Not yet active — yield layer in roadmap'`, annuals: 0. Update all 13 to match Sir Garnet's pattern in a single coordinated audit commit. Do NOT piecemeal-fix.

Also: Victoria Crescent has several other inconsistent steward-facing targets (`indigenous_species_target: 26` while current is 30; `target_score: 75`) that need review at next assessment, not in the yield audit.

### Tend customers as continuous-evidence layer

Canterbury G02's baseline registration revealed an unexpected pattern: Tend customers' gardens carry stronger baseline Evidence scores than fresh G&S installs, because multi-visit Tend records ARE field notes (+2 Evidence in the current engine). Sir Garnet at installation had no field notes; Canterbury G02 as a Tend customer does. This means the registry's most evidentially-rich gardens may be the long-term Tend customers, not the freshly-installed projects. Worth a decisions-log entry articulating this; worth considering whether Tend's value proposition could be framed partly as 'continuous ecological documentation' alongside the maintenance-quality story.

### Verification level methodology — note for v0.5 / v1.0

Canterbury G02 is the first registry entry to carry verification_level: site_visit (3 Evidence pts) rather than gardener_and_son_verified (4 pts). It also earned the first 'site_visit_badge' in the registry. The verification level field is now demonstrably meaningful — gardens are no longer uniformly top-marked. When v0.5 or v1.0 introduces Accuracy Level as a separate field (per Methodology Rev 1), verification_level needs careful migration: the gradient from photo_verified → site_visit → gardener_and_son_verified → independent_ecologist_verified is the registry's epistemic spine. Worth capturing in docs/methodology-notes.md the credibility argument: a registry willing to score itself lower when honesty requires it is more credible than one uniformly top-marked.

## Out of scope (do not work on without explicit instruction)

- Carbon offsetting methodology — not pursued until biodiversity infrastructure is mature
- Marketplace functionality — Registry is not a marketplace
- Social features — not a social network
- Mobile app — web is sufficient
