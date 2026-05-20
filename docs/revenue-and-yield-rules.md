# Revenue and Yield Rules

This is the most sensitive policy area in the Registry. Misrepresenting yield risks the brand and risks real legal exposure as the program matures.

## The honest revenue sequence (recap)

1. **Steward Review** — paid ecological assessment by G&S. The only current commercial product. This is the active revenue line.
2. **Council pilot** — paid council partnership for measurement and reporting. Triggered when a council reaches credibility density (currently five registered gardens minimum).
3. **Yield at scale** — sponsor-funded annual yield disbursed to stewards. **Not active.** Activated only when councils are active and sponsor pipeline is real.

Do not skip stages in any copy, profile, document, or UI label.

## Yield language — strict rules

These rules govern every public surface that mentions yield.

### Allowed

- "Yield: Pending activation" — when garden score ≥ 41 (Ecological Garden tier or above — eligible)
- "Yield: Not yet eligible" — when garden score < 41
- "Potential yield: $X annually" — clearly labelled as potential, with a `formula_note`
- "Estimated yield: $0" — until the program activates, this is always 0
- Descriptions of the future yield mechanism that use future tense ("will distribute," "is being designed to")

### Not allowed

- "Earning $X annually" (present tense) — not until disbursement begins
- "Stewards are paid" (present tense) — false today
- "Income from your garden" without qualification — implies active payment
- Any UI element that visually resembles a balance, account, or transaction history
- Removing or hiding the eligibility status — every yield section must show status honestly

When in doubt, use future tense and qualify with "when activated."

## Yield calculation

Current formula (v1):

```
yield = score × area_factor × connectivity_factor × verification_factor
```

This is intentionally placeholder. The exact formula will be finalised when the sponsor pipeline is confirmed and the first council pilot is signed. Until then:

- All garden JSONs use `"formula_note": "Score x area x connectivity x verification. Formula v1."`
- `estimated_annual` is always `0` until the program activates
- `potential_annual` is a calculated forecast, not a guarantee, and is labelled as such on every surface

When the formula is updated, add a decision-log entry and propagate the change to every garden JSON in the same commit.

## Yield section on profile pages

**Status: data exists in every garden JSON, but no profile template renders it yet.** The York Street garden JSON carries the full yield block (`eligible`, `status`, `estimated_annual`, `potential_annual`, `currency`, `formula_note`, `upgrades`). The York Street profile template does not display any of it. Other profile templates also do not display yield, per current project knowledge.

This is the correct state for now. The honest revenue sequence says yield is not active. Showing a Signal Green "Pending activation" box on every profile is allowed by the yield language rules, but is a deliberate decision to make — and it has not been made yet. The data is ready; the UI surface is held.

When the yield section is added to the profile template, every profile must carry a yield block in Signal Green (`#7a9e5f`) sourced from `record.yield`. Required elements:

1. **Eligibility status** — read from `record.yield.status`. Either "Pending activation" (`eligible: true`, `score >= 41`) or "Not yet eligible" (`eligible: false`, `score < 41`).
2. **Estimated annual** — `record.yield.estimated_annual` (always `0` until activation).
3. **Potential annual** — `record.yield.potential_annual`, displayed as "$X potential annually when activated."
4. **Formula note** — `record.yield.formula_note`, small text linking to a yield methodology page (future).
5. **Upgrade actions** — `record.yield.upgrades`, ranked by `annual_yield_increase` descending, framed as "Increases potential yield by $X annually."

When implementing:

1. Reference the yield block directly from the garden JSON — do not introduce a separate `computeYield(record)` function unless the formula needs to be recomputed at render time. Today the values are snapshotted.
2. Decide whether yield should be recomputed by an engine (like score) or remain snapshotted (like it is now). Snapshotted is simpler but drifts; computed is more honest. Whichever you pick, document it in `/docs/decisions-log.md`.
3. Add the yield section to the reference profile template, propagate to all 11 profiles in one commit, and add the decision-log entry recording the activation of the yield surface.

The Yield section, when it exists, is a forecast and a roadmap, not a balance.

## Steward-facing language

Stewards should understand exactly where they stand. The truthful framing:

- Today: you pay G&S for the Steward Review. You get a measurement, a Registry profile, and a path.
- Soon: your council may pay G&S for measurement reports. You may receive recognition or rates relief through council programs.
- Eventually: sponsors will pay into a pool that distributes annual yield to stewards based on score, area, connectivity, and verification.

Do not promise timelines. Do not name specific sponsors as committed unless they have signed.

## Council-facing language

Councils get the aggregated data view. The truthful framing:

- The Registry measures private ecological gardens within your LGA.
- We provide aggregated biodiversity, habitat, and connectivity data.
- Council pilot involves a paid partnership for ongoing measurement and reporting.
- This is a data infrastructure relationship, not an advocacy relationship.

## Investor / sponsor-facing language

The Yield layer is the value proposition. The truthful framing:

- Sponsors fund the annual yield pool.
- Yield flows to stewards via the Registry based on a transparent formula.
- Sponsors get verified biodiversity outcomes and aggregated impact reporting.
- This is biodiversity offsetting infrastructure, framed honestly.

Do not present sponsor relationships as carbon offsetting unless we have verified carbon methodology in place (we don't yet).

## What changes when yield activates

When the first sponsor is signed and the first yield disbursement happens, the following must be updated together:

1. Yield language across all garden profiles (eligible gardens move from "Pending activation" to live status)
2. Landing page yield framing changes from future tense to present tense
3. Profile yield sections show real `estimated_annual` values
4. A decision-log entry records the activation date and the founding sponsor
5. Public copy across G&S surfaces is reviewed for accuracy

Until that happens, every word about yield is in future tense.
