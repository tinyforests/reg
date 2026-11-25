# Verifying a garden: the short path

The aim is one assessment file, two commands and one email. Written after Hortense
(ER-AU-SA-GLA-CHU-001, Nov 2026), whose verification took about 15 back-and-forth
steps across a day. This runbook replaces the "Runbook" section of
`self-enrolment-to-registered.md` for both photo and site-visit verification.

## What went wrong with Hortense, and what fixes it now

| Slowdown | Fix |
|---|---|
| The promotion stopped because `review_status` was still `pending` in the sheet. | The assessment file is the review decision. `--assessment` accepts `pending` or `verified`. |
| The first score was 17 because the species count came from the ramp band and the list was ignored. | `species_list_file` (.xlsx or .csv) is counted directly: names are de-duplicated and "unknown" rows dropped. |
| The score went 17 → 30 → 45 → 50 through repeated hand edits. | All inputs, and which photo supports each one, go in one file and are applied in one pass. |
| The scaffold assumed a G&S site visit, so photo verification needed overrides. | `method: "photo"` sets Photo Verified, a remote assessor, no professional assessment and the right milestone. |
| A sports oval was nearly counted as the nearby park. | Use `park.type: "oval"` or `"sports_ground"`. It is recorded but scores nothing, in both scorers. |
| The private address was saved as "…, Victoria" for an SA garden. | Fixed. The address now uses the garden's own state. |
| The sheet note, field note and email paragraph were written by hand, and the photo count came out wrong. | All three are generated from the same file into `data/private/verification/<garden_id>/`. |
| The field-records backend needed a redeploy just to allowlist the new garden. | It now accepts any garden published in `registry.json`. Deploy once (v50); no more redeploys per garden. |
| The Apps Script editor had drifted from the repo, so the code was merged by hand at each deploy. | Still open. See "Remaining" below. |
| The seed and admin token had to be found mid-task. | `source data/private/env.sh` before starting. It holds `ER_COORD_SEED` and `ER_ADMIN_TOKEN`. |

## Steps

1. **Assess.** Copy `docs/templates/assessment.example.json` to
   `data/private/verification/<SUB-id>.json` and put the steward's files next to it.
   Fill it in while you look at the photos:
   - **Each photo:** `seen` is what you saw, in plain words; it is reused in the email. `supports` lists the inputs that photo justifies.
   - **Anything you only estimated:** put it in `to_confirm`.
   - **Anything you couldn't see:** put it in `not_seen`. The steward can add it later.
   - **The nearest park:** give its `type`. Ovals and sports grounds don't score.
2. **Promote.**
   ```bash
   source data/private/env.sh
   python scripts/promote_submission.py --assessment=data/private/verification/<SUB-id>.json --check
   python scripts/promote_submission.py --assessment=data/private/verification/<SUB-id>.json
   ```
   The `--check` run prints the score and the TO CONFIRM list and writes nothing. The real run writes the record, profile, registry entry, private coordinates and the three private outputs, runs sync, and sets `published_garden_id` in the sheet.
3. **Publish.** Commit, push to `main` and wait for Pages to deploy.
4. **File the private note.**
   ```bash
   python scripts/promote_submission.py --import-note=<garden_id>
   ```
   This imports the field note and then checks that a signed-out visitor sees none of it.
5. **Close the loop.**
   - **Sheet:** paste `sheet-review-note.txt` into the row (review_status, review_notes).
   - **Email:** build the steward email around `email-paragraph.txt` and send it from hello@ecologicalregistry.org.

## Remaining (not automated yet)

- **Apps Script deploys from the repo.** Set up `clasp` once (`scripts/appsscript/.clasp.json` is already git-ignored), pull the live code, commit any differences, and from then on push from the repo. Until then, every deploy means comparing the editor with the repo by hand.
- **Sheet status write-back.** There is only a `set_published_id` handler so far. A `set_review` admin handler would remove the paste in step 5.
- **Photo storage.** The Supabase private bucket is still waiting on a yes. Once it exists, the field note can carry signed photo links instead of "held by the studio".
- **AI first pass.** Draft the assessment file from the photos for a human to correct. The file format above is the contract for that.
