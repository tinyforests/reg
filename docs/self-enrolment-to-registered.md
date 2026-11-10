# Self-enrolment → Registered: pipeline and runbook

How a public self-enrolment becomes a registered garden, the gap that used to
swallow verified submissions, and the guardrails now in place.

## The two lists have two data sources

- **Registered tab** (`registry.html`) reads `data/registry.json` (this repo) and
  skips `status === 'Provisional'`.
- **Provisional tab** reads a live CSV of the **Submissions** sheet (`PROV_CSV`)
  and hides rows whose `review_status` is in `PROV_EXCLUDE`.

A garden is only *registered* once it has an entry in `registry.json` — which
requires a `garden_id`, a `data/<slug>.json`, and a `sync_registry.py` run.

## The gap (what went wrong)

Setting `review_status = verified` in the sheet, on its own, did two things:

1. **Removed the row from the Provisional tab** — `verified` was in
   `PROV_EXCLUDE`.
2. **Did not add it to the Registered tab** — nothing assigns a `garden_id`,
   writes `Records`, or updates `registry.json` automatically.

Result: the row sat verified with an empty `published_garden_id`, invisible on
both lists. The first two self-enrolments (Harry Street; The Refuge) fell into
this gap. Root causes: `verified` was overloaded (it meant both "stop showing as
provisional" and, wrongly, "done"); there was no *verified-but-not-yet-published*
state; and `pull_live_records.py` only refreshes gardens already in the registry,
so it can never discover a new one.

## Guardrails now in place

1. **`scripts/reconcile_submissions.py`** — reads the public Submissions CSV and
   flags any row that is `verified` with no `published_garden_id`, or published
   but missing from `registry.json`. Exits non-zero on a gap. Run it regularly
   (and before a push).
2. **`registry.html` hardened** — `verified` is no longer a blanket exclude. A
   `verified` row is only dropped from the Provisional tab once it has a
   `published_garden_id`; otherwise it stays visible, flagged
   *"Verified — awaiting registration"*. `verifying` rows show
   *"Verification in progress"*.
3. **`scripts/promote_submission.py`** — one command turns a verified submission
   into repo artifacts: maps the ramp answers to canonical fields, assigns a
   `garden_id`, writes private coords + `data/<slug>.json` + a `registry.json`
   entry + profile page, and runs `sync_registry.py`. Honors consent, keeps PII
   out of the repo, and (with `ER_ADMIN_TOKEN`) writes `published_garden_id` back
   to the sheet via the new `set_published_id` action in `Code.gs`.

## Runbook: register a verified self-enrolment

1. Do the site visit. In the sheet, use `review_status = verifying` until the
   garden is actually in `registry.json` (so it never disappears mid-flight).
2. `python scripts/promote_submission.py SUB-... --suburb=<suburb> --check`
   — review the derived inputs and garden_id.
3. Drop `--check` to write the files and sync.
4. **Confirm the `TO CONFIRM` figures** in `data/<slug>.json` against the visit
   (the ramp gives point-bands, not exact counts), and set `council`/`ward`.
   Re-run `python scripts/sync_registry.py`.
5. `python scripts/reconcile_submissions.py` — expect no gaps.
6. Commit `data/` + `gardens/<slug>/` and push.

> `Code.gs` change (`set_published_id`) requires a **manual Apps Script
> redeploy** before the automatic write-back works. Until then, set
> `published_garden_id` on the sheet by hand.

## Caveat: ramp answers are points, not figures

The ramp stores each answer as its **points** contribution, so canonical values
(species count, canopy %, layers, habitat features) are reconstructed as
mid-band / best-effort and marked `TO CONFIRM`. Always confirm against the site
visit before treating the score as final.

## National signup vegetation lookup — 7 Nov 2026

`enrol/index.html` calls `jurisdiction/enrolment.js` using the selected Australian
address's state. Routing mirrors Find My Native Plants: Victoria uses containing
NV1750 EVC polygons; NSW uses SVTM 1750 PCT; Queensland uses pre-clear Regional
Ecosystems; WA uses Beard pre-European associations. SA, TAS, NT and ACT use NVIS
pre-1750 MVS. State gaps or outages fall back to NVIS with an explanation. A total
outage leaves the lookup unknown and does not block signup. No nearest-polygon
EVC guess is used. Mapping is context, not measured garden condition.

Only Victorian results populate legacy `evc_code` / `evc_name`. The full result,
source, resolution and lookup provenance are submitted in `ecological_context`.
`Code.gs` whitelists that object into additive column **AO** (`ecological_context`)
without coordinates. Existing A–AN columns keep their positions. **Redeploy the
Apps Script web app with the updated Code.gs before releasing the signup page**;
the old deployment ignores this new field. No test submissions are needed.
The existing promotion/sync process resolves public ecological context separately
from private coordinates; AO preserves the signup result for review rather than
turning a client-supplied classification into a verified public record. Promotion
now uses the recorded state for geocoding, IDs and records; missing states require
review instead of defaulting to Victoria.

Address edits invalidate in-flight lookups, coordinates and previous species
handoffs. Where no local species palette is available, Deepen links to Find My
Native Plants rather than presenting a generic database sample as local species.

Checks: `node jurisdiction/test/enrolment.mjs`,
`node jurisdiction/test/proof.mjs`, and
`python3 scripts/promote_submission.py --self-test`.

`node scripts/test_enrolment.cjs` also checks stale-response rejection, interstate
EVC isolation, reset behaviour and submission sanitisation. Read-only live checks
on 7 Nov 2026 returned classifications for VIC, NSW, QLD, WA and SA (NVIS).
These confirm endpoint responses, not browser CORS or the deployed signup flow;
check those after the Apps Script update and before release.

## Live deployment — 7 Nov 2026

- Editor: https://script.google.com/home/projects/1x8_qE0lGksbmTK_JaJ_UTHEs-WkZDjcg0VPRaRjDHfW9yluvbKWa6l8y/edit
- Signup deployment: `AKfycbywnSUukawAaCJ0JTSo6bowC0TWqGUPtclsvs6bHWglvzp4qtczulyeeFyKHqTt8HR_`, version **45**.
- Version 45 is the previous signup version 34 plus the additive AO storage,
  sanitiser and read-only health flag `signup_context_schema: "1"`. It does not
  roll unrelated newer editor features into this endpoint. Rollback target: 34.
- The editor source was restored to its current multi-file state with the same
  signup addition. The separate Plant Studio deployment remains on version 44.
- Browser lookup checked from the release preview without submitting a garden.

## Live deployment — 10 Nov 2026

- Signup deployment (same ID and URL) moved from version 45 to version **46**.
- Version 46 is version 45 plus the additive AP `enrol_src` column, the
  `threeneatthings` plant-offer flag in the notification email and the extra
  paragraph in the steward confirmation. Nothing else was rolled in. Rollback
  target: 45.
- The editor source was restored to its multi-file state with the same
  addition. Health check returned live after the update.
- Note: the editor's Code.gs differed slightly from the repository copy before
  this change (editor 104,338 characters, repository 104,951); the same patch
  was applied to each. Reconcile separately.

