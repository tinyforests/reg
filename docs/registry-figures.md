# Registry figures

Counts change weekly. Any figure recalled from chat, a deck, a memory note or an
earlier page is assumed stale. Compute it from the ledger.

This exists because it has already gone wrong: a council briefing page was
published carrying nine fabricated garden rows with invented Registry IDs and
scores, alongside counts that had drifted from the ledger by a third.

## Computing a figure

Canonical source is `data/registry.json`. Compute from the `gardens` array.
Do **not** read `registry_metadata` — its `total_gardens` and `last_updated`
lag the array.

```python
import json, collections
d = json.load(open('data/registry.json'))
g = [x for x in d['gardens'] if not x.get('demo')]     # demo gardens never count
print('gardens', len(g))
print('councils', collections.Counter(x.get('council') for x in g))
s = [x['score'] for x in g if isinstance(x.get('score'), (int, float))]
print('mean', round(sum(s) / len(s), 1))
print('badges', sum(x.get('badge_count') or 0 for x in g))
print('verification', collections.Counter(x.get('verification_level') for x in g))
```

Rules that hold regardless of the numbers:

- Exclude `demo: true` from every public total.
- Self-reported and provisional records are never counted as verified, and are
  visually quarantined wherever they appear.
- Per-council counts come from the `council` field, not a stored tally.
- Species totals come from `data/species.json`.
- Practice and designer figures come from `data/designers-derived.json`.
- Pillar maximums are 25 / 20 / 20 / 20 / 15 (Biodiversity, Soil & Water,
  Habitat, Connectivity, Evidence), defined in `js/reg-score.js`. Confirm there
  rather than assuming.

## Rendering a figure

Fetch it. A hardcoded count is correct on the day it is written and wrong
afterwards.

```js
fetch('/data/registry.json', { cache: 'no-store' })
```

Put current values in the markup as static fallback so the page is right if the
fetch fails, then overwrite from the ledger on load. Prose that states a count
("nine of them are already measured") takes a span and is updated from the same
source, or is reworded so it carries no number.

Pages currently wired this way: `designer-invite.html`, `boorondara-dashboard.html`,
`yield.html`. The council deck dashboards under `/decks/` compute from an
embedded per-garden array instead, which also carries area and per-garden
species the ledger does not hold; converting them is a real refactor, not a
sweep.

## Provenance

Tag every figure by how it was obtained, and show the tag to the reader:

- **Measured** — recorded on a garden, auditable to a property.
- **Derived** — arithmetic on measured records, no assumptions added.
- **Modelled** — a projection. Print the assumptions beside it, and make them
  adjustable where the medium allows.

Canopy area, water retention, indigenous share at scale and any per-garden area
are modelled unless the ledger holds a surveyed value. Never present a modelled
figure as measured, and never work backwards from a desired number — the inputs
are the truth, the score is the consequence.

## When a figure moves

Say so plainly, and name the other live artifacts still carrying the old value:
council dashboards, decks, outreach emails, printed signs. A corrected page
beside an uncorrected deck is worse than either alone.
