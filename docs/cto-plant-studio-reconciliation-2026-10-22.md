# CTO report — Plant Studio and brandbook reconciliation

22 Oct 2026 · Gardener & Son / Ecological Registry

## Outcome

Plant Studio is already operating at https://www.gardenerandson.com/plants/studio.html.
Client lists live at /plants/view.html?p=TOKEN. Registry URLs redirect there while
preserving query strings and fragments. Registry retains the Apps Script backend
and public plant library. No further Plant Studio backend deployment was needed.

## Repository reconciliation

- Registry was 13 commits behind fetched main. Preserved all six tracked local
  design edits in a named Git stash and a binary patch before fast-forwarding to
  cbd3542. The old plant frontend is intentionally removed/replaced by redirects.
- Gardener & Son fast-forwarded to fetched main 5db9106. Its current frontend
  already includes Fraunces section typography, Abril hero sizing, monochrome
  plant tags, brass rules, canonical Signal Green and expandable descriptions.
- The client Acknowledgement of Country is present, including its original full
  wording. An earlier case-sensitive inspection incorrectly reported it absent;
  that finding is withdrawn. No acknowledgement changes were made.
- Recovered the three still-applicable Registry CSS edits: Signal Green changes
  from #7a9e5f to #7C9A52 in designer-portal.css, developers.css and registry-pages.css.
  These are the only production-file changes in this reconciliation.
- Superseded Registry plant-page edits remain recoverable; they were not applied
  over newer Gardener & Son features or Registry redirect pages.
- Untracked Registry emails/ and Gardener & Son AGENTS.md were left untouched.

## Backend evidence

The deployment listing supplied by Tyson identifies the existing wired deployment
as version 44, description “Keep project and private journal garden matches together”.
Deployment ID: AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC.

The freshly cloned project HEAD contains Plants.js and FieldRecords.js matching
latest Registry main byte-for-byte. Its Code.js already contains the Plant Studio
and Field Records routes. Main also has a provisional-record quarantine safeguard
absent from cloned HEAD; this pre-existing backend discrepancy remains open.
A project HEAD clone is not a version-44 source export, so it cannot establish the
complete deployed version's source. No clasp push or deploy was performed.

Verified live GET checks on the existing /exec URL:
- plants_view with an invalid 32-character token: {"ok":false,"error":"Not found"}.
- No parameters: status “Self-Enrolment endpoint is live”, enrolment_global_limit 20.

## Validation

- node scripts/test_plant_studio.cjs: passed on current Registry source.
- node scripts/test_field_records.cjs: passed.
- Plants top-level declarations follow PL_ / _pl / handlePlant prefixes and do
  not collide with Code or FieldRecords in the fresh clone.
- JavaScript syntax checks passed for current Gardener & Son studio/view inline
  scripts, plant-library.js, and Registry redirect inline scripts.
- Asserted that all three recovered CSS diffs only replace the Signal Green hex.
- Published plant pages and stylesheet returned HTTP 200; Registry's published
  client page contains the redirect. Brandbook markers confirmed in live source.

## Remaining review and operations

The three Registry colour updates are prepared for normal PR review/publication;
this report does not claim those updates are deployed. A rendered desktop/mobile,
light/dark visual review has not been performed in this reconciliation. Admin
writes and real client projects were not exercised against production.

Separately reconcile the provisional-record safeguard against an exact deployed
version export before any future Apps Script push. Preserve Field Records,
planting areas, project notes safeguards and the existing deployment ID.

Recovery: Registry stash named “Preserve brandbook UI edits before Plant Studio
reconciliation 2026-10-22”; additional patch at
/private/tmp/reg-brandbook-preserved-2026-10-22.patch. Do not blindly apply the
whole stash: it would resurrect the retired Registry frontend.
