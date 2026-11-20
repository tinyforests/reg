# Agent-native ecological evidence layer — implementation brief

Status: proposed architecture, not shipped functionality. 20 Nov 2026.
Owner: Ecological Registry. Applies under SUPER_MIND.md, VISION.md and AGENTS.md.

## Purpose
Make private-land ecological change legible to people, councils and permissioned software agents without confusing predictions with observations. This extends the existing open method / durable ledger distinction; it does not replace the five-pillar scoring method, change any score, or introduce financial claims.

## Principles
1. A garden is a persistent record with a stable ID and dated events; no fabricated baseline.
2. Separate observed, derived, modelled and unknown data at field level. Scores are not proof of biodiversity uplift.
3. Every claim carries evidence provenance, collection method, date, review status and method version.
4. Public access is aggregate/de-identified by default; exact addresses, owner identity, photographs and sensitive species locations are governed by explicit permissions.
5. Human review is required for verification, publication, consequential ecological claims, council reporting and external communications.
6. Agents propose changes through an auditable queue; no direct writes to canonical garden records.
7. Original vegetation context must follow jurisdiction-specific pre-clearing sources (Victoria: nv1750_evcbcs), not extant NV2005.
8. Preserve existing council partnership commitments, designer attribution rules and commercial separation.

## First vertical slice: one real garden, three dates
Pilot on a consented existing garden record. Present baseline, installation and follow-up as distinct dated observations; if a timepoint has no evidence, show 'not recorded'. No retroactive claims. A human reviewer accepts/rejects each new observation. Expose a readable timeline and an exportable evidence bundle. Demonstrate the complete chain before building agent autonomy.

## Proposed data contract (additive, versioned; validate against existing schema)
- garden_id: stable existing registry identifier
- observation_id: immutable UUID
- observed_at: ISO 8601 with timezone, plus recorded_at
- observation_type: structure | soil | water | habitat | connectivity | other
- value, unit, measurement_protocol, sampling_scope
- evidence_refs: references to controlled evidence objects (no private URLs in public exports)
- provenance: observer role, source type, source ID, consent scope
- classification: observed | derived | modelled | unknown
- method_version and calculation_version where applicable
- review: pending | accepted | rejected, reviewer, timestamp, reason
- supersedes_observation_id: corrections append; never silently overwrite
- visibility: private | consented_partner | public_aggregate | public_record

## Agent interfaces (read-only first)
- get_place_context: jurisdiction, source layer/version, EVC confidence and limitations
- get_garden_timeline: permission-filtered dated evidence and gaps
- get_methodology: published versioned scoring definitions
- draft_observation: creates a proposal, never a canonical record
- draft_council_summary: clearly separates counts, recorded measures and modelled claims
Every response includes source, freshness, uncertainty and allowed-use metadata. No unrestricted public search by address.

## Work packages
### P0 — audit and decision gates
Map current schema, privacy model, consent and council commitments. Inventory baseline and repeat observations without assuming coverage. Define what verification actually means today. Write migration and rollback plan. Tests for access controls and provenance required before code changes.

### P1 — evidence ledger
Introduce additive observation/event schema and validators; immutable history and correction events; private evidence storage; review queue; migration for a small consented pilot. Preserve canonical scores and registry.json consistency.

### P2 — longitudinal UI
Garden profile timeline with observed/derived/modelled badges, gaps, evidence dates and reviewer status. Include comparison only when methods and measurements are comparable. No implied uplift from a single score.

### P3 — permissioned read API
Versioned, documented endpoints with scoped credentials, rate limiting, audit logs, aggregation thresholds and tests preventing address/owner/sensitive species disclosure.

### P4 — agent-assisted workflows
Specialists for place context, evidence QA, council summary and follow-up prompts. Human approves all mutations/publication. Benchmark agents against a fixed set of known records and deliberate missing-data cases.

### P5 — institutional validation
Invite independent ecologists and council partners to test repeatability, bias, cost per verification, and meaningfulness of indicators. Only then explore wider certification, policy or incentive claims.

## Definition of done for first slice
One consented garden displays a faithful dated timeline; missing data is explicit; every observation is traceable; proposed edits require human review; private data stays private; existing scoring is unchanged; automated tests cover permission denial, provenance, method versioning and correction history.

## Success metrics
% records with dated baseline; % with repeat observations; reviewer agreement; median review time; evidence completeness; number of verified (not merely scored) longitudinal comparisons; zero unauthorised disclosure incidents. Report denominators and definitions.

## Non-goals
Autonomous ecological certification, automated biodiversity credits, active Yield payouts, universal EVC certainty, rewriting historical scores, replacing ecological expertise, or promising AGI timelines.

## Context
Prompted by Tim Genewein, DeepMind Institute, 'What comes after AGI?' (19 Nov 2026): https://institute.deepmind.com/essays/what-comes-after-agi/ . The essay is a scenario lens, not a dependency or forecast.
