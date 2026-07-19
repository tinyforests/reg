# Pending Work

Known unfinished items. Move items out of this file as they complete (and into the decision log if they involve a meaningful decision).

## High priority

### Self-Enrolment review workflow — Phase A + B done, Phase C next

Today (13 Jul 2026) built the human-review + notification layer for self-enrolment. State:

DONE:
- Phase A: Sheet restructured. 'Sheet1' renamed to 'Submissions' (private, receives writes). New 'Public view' tab added with formulas pulling public-safe columns only (Submitted, Steward name, Suburb, Score, Tier, Status, Submission ID) from Submissions. Suburb is manual entry per review (regex was too brittle for varied AU address formats). Public view published to web as CSV: [the pub?output=csv URL]. Full private data (email, full address) stays in Submissions, never exposed.
- Phase B: Apps Script (Version 6 deployed, same URL ...HR_) now sends two emails per submission via MailApp: notification to hello@lundbech.me, confirmation to the steward. Both working end-to-end after resolving a script.send_mail scope grant (the whole cause of the email failures — fixed by running authorizeMail() from the editor to force the permission dialog, granting the scope for the whole project including the deployed web app). A 'Debug log' tab in the Sheet captures any future MailApp errors. Email bodies use array-join format (paste-resistant). submissionId threaded consistently through sheet row + both emails. appendRow writes all 26 columns individually with review_status defaulting to 'pending'.

NEXT (Phase C — fresh session):
- Add a tab to registry.html: 'Registered' (default, existing verified gardens) and 'Provisional' (new). Provisional tab fetches the Public view CSV and renders self-enrolled gardens with Dry Grass Brass (#B49A63) visual quarantine + 'awaiting review' badge. Shows immediately on submission (status pending), never aggregates into verified registry stats.
- Deletion mechanism: change review_status in the Submissions sheet to remove a provisional garden from the tab.
- Suburb column in Public view is currently blank for existing rows — fill manually during review, or revisit adding a dedicated suburb field to the form.

Apps Script cleanup still outstanding from 4 Jul: archive the stray 'Untitled project' (2:22 PM) with its extra deployments; identify/rename the 25 Oct 2025 Untitled project.

Also outstanding: endpoint hardening (deferred, real traffic doesn't justify yet); sitewide mailto sweep (51 occurrences, 20 files); Formspree legacy inbox check; Separation Creek submission still 'pending' — first candidate for the review workflow once Phase C ships.

### Opportunity engine — three-path model shipped, Python parity done, wired to profiles + assess

js/reg-opportunities.js landed (commit f9b3b29) after review of a Fable 5 design draft. Computes ranked next-step recommendations per garden by cloning the record, applying a candidate change, and re-running scoreEcologicalRegistry() — recommendations can never disagree with the score.

Fixed during landing: pillar scores live at base.scores[p], not base[p] as Fable 5's draft had it — the unfixed version would have made every pillar's weakness-urgency flatten to 1.0, silently disabling the weakness-aware ranking. Caught via test run against real garden data, not review alone.

Also improved: fastest-path-to-next-tier now prefers ecological actions (garden genuinely changes) before falling back to record/verification actions (evidence strengthens, ecology doesn't) — tested against Arundel, Sir Garnet, Evelina, Canterbury G02; in none of the four did the fallback trigger.

DONE:
1. Delivery model redesign — shipped (commit b66e728). Every opportunity now carries a delivery_options array of { path, cost }; applicable moves offer DIY / G&S install / designer_install as parallel choices with separate cost bands. Verification-type moves (corridor-node, assessment, verification upgrade) stay single-path. designer_install options are filtered out at build time unless the garden carries managed_by.type === 'designer'.
2. Python port (reg_opportunities.py) + parity test — DONE (commit 6714648), rebuilt against the fixed three-path JS. test_opportunities_parity.py cross-checks JS vs Python across all 15 gardens on points/group/effort/pillar/delivery/priority, plus a synthetic managed_by=designer fixture that keeps the designer_install branch under test. 16/16 pass.
3. Wiring — DONE for profiles + assess.html (commit 99d0974). Piloted on Arundel, then rolled the identical template change to the other 14 profiles. Profiles lead with ecological moves + a 'Strengthen your record' group; assess.html uses enrolment framing (pts-to-next-tier + ranked moves). Delivery routes shown by LABEL ONLY — no cost on either public surface. designer_install stays dormant until managed_by lands.

STILL TO DO:
4. Designer portal (designer.html) — still NOT built on main and NOT wired. Separate product decision; needs its own scoping conversation before it exists. This is the one surface where cost bands and designer-filtered gardens are meant to appear, so it pairs with the designer-attribution build below.

Small follow-up noticed during wiring: the engine's own renderOpportunities(_, 'steward') helper includes cost in its delivery line, which contradicts the no-cost-on-public decision. The wired profiles/assess do NOT use that helper (they render inline, cost-free), so nothing leaks today — but the helper itself should be reconciled (drop cost from steward mode) before anything else consumes it.

Also from the same Fable 5 review, still pending: Mont Albert score drift (registry.json stores 0, engine computes 11 live) needs reconciling in sync_registry.py — small isolated fix, hasn't been touched yet.

### Designer attribution + portal access model — scoped, not built

Purpose (from Tyson): the designer portal (designer.html, drafted from a Fable 5 review, not yet wired to anything live) isn't just an internal G&S work queue — it's meant to onboard EXTERNAL designers who add their own client gardens to the registry, then keep managing those gardens over time. When a designer's garden shows an opportunity (e.g. steward wants 4 more indigenous plants), it surfaces to the DESIGNER who has that client relationship, not generically to G&S. This is a retention + revenue mechanism for designers, and a growth mechanism for the registry (every external designer who joins adds gardens for free and has an ongoing reason to keep engaging with the platform).

Decided:
1. Access model: unique unguessable link per designer (e.g. designer.html?key=<token>), NOT a shared password and NOT full login/account infrastructure. Reasoning: delivers real per-designer privacy (each only sees their own gardens' opportunities) without building a full auth system before there's evidence designers will use this. Revisit real accounts (login + sessions) if/when designer volume outgrows manual link management.
2. Onboarding: MANUAL for now — Tyson adds each designer himself (mirrors how gardens were added originally), generates their token, shares their link personally. Not self-service yet. Revisit self-registration (mirroring the Self-Enrolment Ramp pattern) if manual onboarding becomes a bottleneck.
3. Data model:
   - New data/designers.json: array of { designer_id, name, contact_email, access_token, added_date }
   - Each garden record gets a managed_by field: { type: 'gs' | 'designer' | 'self', designer_id: <only if type is designer> } — existing 14 G&S gardens get type 'gs', Self-Enrolment Ramp gardens (e.g. Separation Creek) get type 'self', future designer-added gardens get type 'designer' + their designer_id.
4. Designer portal (designer.html) needs rework once this lands: read the ?key= token from the URL, resolve to a designer_id via designers.json, filter the gardens list to only managed_by.designer_id === that designer. Currently the portal shows ALL gardens with no filtering — that's the main change needed, on top of whatever the delivery-model redesign (see separate pending-work entry) requires for opportunity rendering.

NOT YET DONE:
- designers.json doesn't exist
- managed_by field doesn't exist on any garden record
- designer.html has no token-reading or filtering logic
- No process yet for HOW a designer actually adds a new garden to the registry (this is presumably a new form/flow, separate from both the G&S-verified path and the Self-Enrolment Ramp — needs its own scoping)
- No decision yet on what a designer sees/can do beyond viewing opportunities (can they edit garden records? add photos? that's a permissions question not yet addressed)

This sits alongside (and should probably be sequenced together with) the opportunity engine delivery-model redesign (see 'Opportunity engine — landed, unwired, delivery model redesign in progress' entry) — the designer_install delivery path only makes sense once a garden actually has a designer attached to route it to.

#### How a designer adds a garden — scoped

Submission method: MANUAL for now, same process Tyson already uses for G&S gardens. Designer tells Tyson about the garden (email/call), Tyson creates the garden record and attaches managed_by: { type: 'designer', designer_id: <theirs> }. No new form built yet.

Rationale: a designer knows precise data (exact species count, exact layer structure from their own planting plan) rather than a homeowner's guess — reusing the public Self-Enrolment Ramp form as-is would waste that precision by asking imprecise, homeowner-friendly questions. But building a dedicated professional-precision form is real work worth deferring until the manual process has run a few times and reveals what actually needs asking. Natural evolution once patterns emerge: same 12 pillar fields, relabeled for professional precision (e.g. 'exact indigenous species count from your planting plan' instead of 'roughly how many species would you say').

Trust level: designer-added gardens get NO special trust shortcut. They land as 'pending' in the exact same review workflow as any public steward self-enrolment — same Provisional tab, same visual quarantine, same manual review-and-verify step before appearing on the Registered tab. Rationale: fast-tracking designer submissions to verified without review risks a designer (even unintentionally) inflating their own client's score straight onto the public Registered tab alongside G&S-verified gardens — since 'verified' currently means the same thing everywhere, any credibility gap discovered later would damage trust in every verified garden, not just that one. Personal relationship with a manually-onboarded designer can make review FASTER in practice without needing a coded fast-track tier. Revisit a real trusted-designer tier only if/when a specific designer has an established track record (e.g. multiple gardens reviewed clean with no corrections) — earned by evidence, not granted upfront.

Designer account creation: happens BEFORE any garden submission (confirmed earlier in this entry) — matches the manual-onboarding decision; giving a designer their unique link is also the natural moment to explain how garden submission works.

### Sitewide mailto: sweep + modal semantic refresh

Homepage Register CTAs unified on the self-enrolment form 4 Jul 2026 (commit 589a219). Card 2 (Two ways in) reuses the Formspree modal that was originally built for registration — modal fields, copy, and function names are semantically stale (labelled 'register' but now serving 'new ecological garden' enquiries).

Deferred work:
1. Sitewide mailto: sweep — 51 occurrences across 20 files remain. Breakdown:
   - Garden profile pages (12 files, 3 mailto each = 36): same template repeated. Single design decision applied 12 times.
   - Other pages (15 occurrences across workshops.html, guide.html, tend.html, contact-hub.html, brand.html, index.html): case-by-case decisions needed.
2. Modal semantic refresh — rename openRegisterModal to openTalkToUsModal, submitRegisterForm to submitTalkToUsForm; update modal title from 'Register your garden' to 'New ecological garden enquiry'; update field labels and copy to match new intent; consider dropping the 'garden_address' field if it's not relevant to new-build enquiries.
3. Formspree legacy inbox — check the account associated with the endpoint for any pending registration submissions from before tonight's repurpose. Formspree endpoint URL is in the current submitRegisterForm function.

### Self-Enrolment endpoint hardening — rate limiting and auth

Shipped 29 Jun 2026 with the Phase 1.5 wiring commit. The Apps Script /exec endpoint is currently:
- Publicly accessible (Anyone access — required for the public form)
- URL committed to the public GitHub repo (visible to anyone reading the codebase)
- No shared secret, no rate limiting, no CAPTCHA
- No email verification loop before Sheet write

Acceptable at current volume (zero real stewards) but must be addressed before any public promotion push. Priorities in likely order:

1. Rate limiting via Apps Script CacheService — limit submissions per IP per hour to something like 3. Cheap, effective against dumb bots.
2. Shared secret in payload — sent from prototype, checked in doPost. Defends against naive scraping bots. NOT security in a strong sense (secret is in prototype JS which is public), but raises the bar.
3. Email verification loop — steward gets a 'confirm your submission' email with a token; Sheet row status stays 'unconfirmed' until they click. Genuine defence against fake submissions.
4. reCAPTCHA v3 on the form — Google's invisible check. Adds real friction to bot traffic.

Order these into the roadmap when public URL promotion is being planned. Do NOT promote to the homepage / share the URL widely / include in any council or press outreach until at least rate limiting + shared secret are in place.

### Status update 29 Jun 2026

Homepage CTA shipped in the same commit that logged this hardening entry. The guardrail 'do NOT promote to the homepage until hardening is in place' was consciously broken based on the reality that traffic to ecologicalregistry.org is currently near-zero — practical spam risk is minimal, and the momentum of shipping the CTA was judged more valuable than the marginal risk of exposure in a 48-72 hour window before hardening lands.

Consequence: endpoint hardening (at minimum rate limiting + shared secret) is now WEEK-URGENT rather than pre-promotion-blocking. Target: shipped before end of week (by Friday 3 July 2026). If wider promotion is planned earlier

### Self-Enrolment endpoint troubleshooting — mid-recovery state (Sat 4 Jul 2026 evening)

Endpoint hardening was deployed as Version 2 of the Self-Enrolment Endpoint project at 2:17 PM (commit 5d9bac3 shipped the client-side changes: shared_secret in payload). Subsequent curl testing showed:
- GET request returns 'Script function not found: doGet' — meaning deployed Code.gs is missing the doGet handler that used to sanity-check the endpoint
- POST request returns Google Drive 'Page not found' HTML — cause unclear; likely a Google serving-infrastructure inconsistency where Version 2 is 'active' in the Manage Deployments dialog but not actually reachable

During troubleshooting the following also happened:
- An 'Untitled project' accidentally created at 2:22 PM containing three Web App deployments ('endpoint second try' + two unnamed) and one archived 'ecogarden' deployment. Not damaging anything but should be archived for clarity.
- The correct 'Self-Enrolment Endpoint' project (2:17 PM) shows Version 2 as active in Manage Deployments with the expected deployment ID (AKfycbywnSUukaw...HR_), matching what the prototype uses.

Fix path (tomorrow or when fresh):
1. Open the Self-Enrolment Endpoint project
2. View Code.gs — confirm it has BOTH doPost (with hardening) AND doGet (sanity endpoint)
3. If doGet is missing, add:
   function doGet(e) {
     return ContentService
       .createTextOutput(JSON.stringify({ status: 'Self-Enrolment endpoint is live', timestamp: new Date().toISOString() }))
       .setMimeType(ContentService.MimeType.JSON);
   }
4. Save code, then Deploy → Manage deployments → pencil edit on active → Version dropdown → New version (with description 'Restore doGet + verified hardening')
5. Test with curl (both GET and POST), then browser through the actual prototype form
6. After confirmed working: archive 'Untitled project' from 2:22 PM
7. Identify and rename the 25 Oct 2025 'Untitled project' after viewing its Code.gs
8. Add descriptions to every remaining Apps Script project

The homepage CTA at ecologicalregistry.org is live but currently points at a broken endpoint. Traffic is effectively zero so practical impact is minimal, but this MUST be fixed before any outreach that would drive traffic to the form (Boroondara follow-up, Marnie's newsletter, wider promotion).

### G&S shared core library — architectural direction

Identified 25 Jun 2026 during Self-Enrolment Ramp Phase 1.5 design work, surfaced by the realisation that EVC resolution and species list lookup logic is currently duplicated across multiple G&S apps (findyourevc, super-barnacle, registry assess.html, prototype, plantsofplace).

Proposed direction: build a shared core JS module (e.g. g-and-s-core.js, hosted on a CDN or via a known URL) that all G&S apps consume from. Exports canonical implementations of:

- resolveAddressToClassification(address) — currently Victoria-only (Nominatim + Victorian WFS via Turf.js), structured to be expandable to other states' classification systems
- loadPlantList(classification) — returns the plant palette for a given classification (EVC code in Victoria, equivalent elsewhere later)
- scoreGarden(record) — the canonical ecological scoring engine (currently in js/reg-score.js, the registry's authoritative version)
- loadSpeciesDb() — returns the cross-registry species inventory (currently data/species.json)

Benefits:
- One canonical place for methodology — engine drift across apps becomes impossible
- Updating a band threshold, fixing a bug, or adding a feature touches one file
- New G&S apps consume the same logic without re-implementing
- Sets up cleanly for national expansion (next pending-work entry)

Sequencing direction:
- Sketch the API surface and module boundaries first (one fresh session, no code)
- Build the first version exporting just resolveAddressToClassification (the highest-leverage function)
- Refactor findyourevc to consume from the shared library
- Then wire the Self-Enrolment Ramp prototype to consume the same
- Then refactor super-barnacle and assess.html

This work blocks the Phase 1.5 live wiring of the Self-Enrolment Ramp prototype. Phase 1 static prototype shipped via this commit; Phase 1.5 (live wiring) deferred until shared core is in place. This is a deliberate slowdown — the architecture realisation is more valuable than the schedule.

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

### Boroondara council count was stored stale — was 8, real is 9

Discovered 24 Jun 2026 during the registry.html aggregate-stats refactor. The stored `network.councils.Boroondara` field reads 8 but the gardens array contains 9 gardens with `lga: 'Boroondara'`. One garden was missed during a prior manual update of the network block. The live-computed value is now correct on registry.html.

Implication: public messaging that used '8 Boroondara gardens' (Penny Coulson call prep, Marnie email already sent, any council pitch material) was technically understated. Future references should use '9 Boroondara gardens.'

To confirm which garden was missed: run the same lga-filter query against the gardens array; cross-reference against the stored Boroondara count from the git history of registry.json to identify which addition didn't update the network block.

### Full network.{} aggregate audit needed

Triggered by the Boroondara 8→9 discovery (24 Jun 2026). All stored `network.{}` aggregates may be stale because they relied on manual maintenance during garden additions, which is now known to be unreliable.

Fields to audit by computing live from the gardens array:
- `network.total_gardens` (likely correct — 15 matches)
- `network.active_clusters` (stored 6)
- `network.gardens_in_establishment` (stored 7)
- `network.avg_score` (stored 48, live 44 — drift confirmed)
- `network.councils.Boroondara` (stored 8, live 9 — drift confirmed)
- `network.councils.Stonnington` (stored 1)
- `network.councils.Whitehorse` (stored 4)
- `network.councils.Darebin` (stored 1)

Do as a single coordinated audit commit. Either update the stored values once with notes, or remove the vestigial stored fields entirely after registry.html refactor proves stable for one month. Don't piecemeal-fix.

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

### ~~Network block aggregate fields — drift-prone~~ RESOLVED 24 Jun 2026

Resolved 24 Jun 2026. registry.html now computes Average Score and Badges Awarded client-side from the gardens array. Stored `statistics.average_score` and `statistics.total_badges_awarded` fields retained in registry.json as vestigial fallback for one month, then to be removed in a cleanup commit if computed values remain stable.

### Yield block honesty audit — pre-Sir-Garnet gardens

All 13 gardens registered before Sir Garnet (Victoria Crescent, Arundel, Middlesex, Mont Albert, Parring, Parring Stepping Stone, Nicholson, Evelina, Dewrang, York, Flinders, Rupert, Windella — confirm full list when audit runs) carry `yield.eligible: true` with non-zero `potential_annual` figures. Per SUPER_MIND doc the yield layer is sponsor-funded and not active. Sir Garnet uses the honest pattern: `eligible: false`, `status: 'Not yet active — yield layer in roadmap'`, annuals: 0. Update all 13 to match Sir Garnet's pattern in a single coordinated audit commit. Do NOT piecemeal-fix.

Also: Victoria Crescent has several other inconsistent steward-facing targets (`indigenous_species_target: 26` while current is 30; `target_score: 75`) that need review at next assessment, not in the yield audit.

### Tend customers as continuous-evidence layer

Canterbury G02's baseline registration revealed an unexpected pattern: Tend customers' gardens carry stronger baseline Evidence scores than fresh G&S installs, because multi-visit Tend records ARE field notes (+2 Evidence in the current engine). Sir Garnet at installation had no field notes; Canterbury G02 as a Tend customer does. This means the registry's most evidentially-rich gardens may be the long-term Tend customers, not the freshly-installed projects. Worth a decisions-log entry articulating this; worth considering whether Tend's value proposition could be framed partly as 'continuous ecological documentation' alongside the maintenance-quality story.

### Verification level methodology — note for v0.5 / v1.0

Canterbury G02 is the first registry entry to carry verification_level: site_visit (3 Evidence pts) rather than gardener_and_son_verified (4 pts). It also earned the first 'site_visit_badge' in the registry. The verification level field is now demonstrably meaningful — gardens are no longer uniformly top-marked. When v0.5 or v1.0 introduces Accuracy Level as a separate field (per Methodology Rev 1), verification_level needs careful migration: the gradient from photo_verified → site_visit → gardener_and_son_verified → independent_ecologist_verified is the registry's epistemic spine. Worth capturing in docs/methodology-notes.md the credibility argument: a registry willing to score itself lower when honesty requires it is more credible than one uniformly top-marked.

### National expansion — classification-system-agnostic design

Identified 25 Jun 2026. The Ecological Registry is currently structurally Victorian — every classification field uses EVC (Ecological Vegetation Class), a Victorian Government framework. National expansion (NSW, QLD, WA, SA, TAS, NT, ACT) requires the data model and the methodology to be classification-system-agnostic.

Equivalent state classifications:
- NSW: Plant Community Types (PCTs) — managed by NSW DPIE BioNet
- QLD: Regional Ecosystems (REs) — managed by QLD Herbarium
- WA: Vegetation Complexes — Beard's vegetation map
- SA: Floristic Vegetation Communities
- TAS: TasVeg communities
- NT: Threatened Ecological Communities + community-level mapping
- ACT: Ecological Communities

Design direction for the registry:
- The database field 'evc' should be renamed or aliased to 'classification_code' with 'classification_system' tag (e.g. 'EVC-Vic', 'PCT-NSW')
- The 'evcName' field becomes 'classificationName'
- Plant palette files should be partitioned by classification system, not assumed to be EVC
- The resolveAddressToClassification function (see shared library entry) needs to detect state from address/coordinates and route to the appropriate classification API

UI considerations:
- Public-facing language should evolve from "Your garden's EVC is..." to "Your garden's ecological vegetation community is..." (the universal phrase that maps to EVCs in Vic, PCTs in NSW, etc.)
- Tier names ('Habitat Garden', 'Ecological Garden' etc.) are nationally portable as-is
- The acquirer (AfN, GreenCollar, Pollination) values national reach — making this national-ready strengthens the acquisition case meaningfully

Sequencing: this is downstream of the shared library work. National expansion requires the shared library to exist first.

## Out of scope (do not work on without explicit instruction)

- Carbon offsetting methodology — not pursued until biodiversity infrastructure is mature
- Marketplace functionality — Registry is not a marketplace
- Social features — not a social network
- Mobile app — web is sufficient
