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
