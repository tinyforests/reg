# Registry Product Brief — Engineering Layer

This is the engineering-specific brief for the Ecological Registry. Strategic frame, audiences, tone, and the four-stage spine (Culture → Discovery → Registry → Incentives) live in `/SUPER_MIND.md` and `/AI_CONTEXT.md`. Read those first.

This file carries only what the senior documents don't: the parts an engineering agent needs to do the work on this specific repo.

## Where the Registry sits in the system

Per SUPER_MIND.md, the Registry is the third stage in the four-stage spine — the credentialing and measurement layer between Discovery (fmeg, fmevc, fmnp) and Incentives (Yield).

In practice this means:

- The Registry receives inbound traffic from the Discovery sites (fmeg/fmevc/fmnp) via contextual nudges in their search results. Build for that intent: visitors arrive curious, not browsing.
- The Registry is the data source for Yield once activated. Yield reads scores, eligibility, and area from the Registry. The integrity of those values is the integrity of the entire economic layer downstream.
- The Registry's public surface should communicate measurement, not marketing. Per AI_CONTEXT.md: do not make the registry sound like a directory.

## The three operational audiences

The four-stage spine in SUPER_MIND.md describes the *system*. Inside the Registry product, there are three audiences whose needs the build must serve:

**Stewards.** Homeowners with ecological gardens. Their primary surface is the profile page. Their need is recognition, evidence of permanence, and eventually income for ecological work. Profile pages travel with the property. Frame: legacy.

**Councils.** Local government. Their primary surface is the aggregated data — `registry.json`, the council distribution, the cluster maps. Their need is measurable urban biodiversity infrastructure. Frame: data infrastructure, not advocacy.

**Investors and sponsors.** Foundations, corporate sustainability programs, philanthropic. Their primary surface is the Yield framing and aggregated impact. Their need is verified biodiversity outcomes. Frame: biodiversity infrastructure, honestly stated.

Every page in the Registry should be legible to all three without alienating any.

## The honest revenue sequence

1. **Steward Review** — paid ecological assessment delivered by G&S. The only current commercial product. Active revenue.
2. **Council pilot** — paid council partnership for measurement and reporting. Triggered when a council reaches 5+ registered gardens. Boroondara is over threshold; Whitehorse is the relationship-first target.
3. **Yield at scale** — sponsor-funded annual yield distributed to stewards. Activated only when councils are active and sponsor pipeline is real.

Do not skip stages. Do not write copy that implies yield is paying today. See `/docs/revenue-and-yield-rules.md` for the full language rules.

## Operational language rules

The senior documents cover tone. This section covers terminology that has specific technical meaning inside the Registry codebase and data.

- **Stewards, not owners.** This is both a tone rule (per SUPER_MIND.md) and a data rule — the field is `stewards` in every garden JSON, not `owners`.
- **Indigenous, not native.** Indigenous = of this place (EVC-correct). The scoring engine awards `indigenous_dominant` and `species_rich_20` / `species_rich_30` badges on the `indigenous_species_current` count. "Native" is broader (Australian but possibly not local) and is not what the engine measures.
- **Ecological, not "sustainable."** Per AI_CONTEXT.md — "sustainable" is greenwashed. The Registry measures ecological function specifically.
- **AU date format.** `28 Nov 2025`. Field notes use ISO (`2025-11-28`) in filenames but AU in display.

## What the Registry is not

Reinforced from SUPER_MIND.md as engineering invariants:

- Not a directory. Do not build directory-style listing pages or sorting that emphasises browsing over measurement.
- Not a marketplace. Do not build commerce flows into Registry pages. Heirloom is a separate G&S property.
- Not a social network. No comments, no likes, no follower counts.
- Not a plant ID app. Plant ID lives in fmeg/fmevc/fmnp.

If a feature request drifts toward any of these, surface the conflict before building. Refer to SUPER_MIND.md.
