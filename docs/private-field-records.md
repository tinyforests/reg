# Private imported field records

`FieldRecords.gs` stores one JSON record per Notion source ID in **Private Field
Records** in the Registry's existing private spreadsheet. `field_record` POST
operations: `import` (admin, ≤20 entries), `list` (public projection or verified
private access), `link_project` (admin, exact Registry ID), `publish` (garden
steward session only). Never use the legacy unauthenticated StewardNotes route
for private imported content. Display flags and garden IDs confer no access.

The G&S `/plants/import-notion.html` uses the existing Studio session to upload a
local `gs-notion-text-v1` bundle and review the private archive. Bundle and archive
files must stay outside both public repositories. Projects retain the Notion
source/status/narrative in internal notes; client introductions remain empty.
Garden IDs are an allowlist of existing Registry records, not fuzzy suggestions.
Multiple-project journal relations require manual review; no automatic linking.

Images/videos remain in the original export. Only attachment references are
stored privately. Published projections exclude these references, Notion source
IDs/URLs and project relations. Stewards must review the entire note before
choosing Make public. Making private removes it from subsequent public responses.
No outbound email is sent by this importer.

Validation: `node scripts/test_plant_studio.cjs` and
`node scripts/test_field_records.cjs [private-bundle-path]`.
Deploy by pulling live Apps Script first; preserve divergent Code.js and add only
the field_record route. Push FieldRecords.js and updated Plants.js, then update
the existing deployment ID with a new version. Do not create a new deployment.


## Hortense studio evidence record — 25 Nov 2026

`ER-AU-SA-GLA-CHU-001` is now in the source `FR_GARDENS` allowlist.
**The existing field-records Apps Script deployment must be updated before the
record can be imported for this garden.** A repository commit alone does not
update Apps Script. Pull live Apps Script first, preserve unrelated changes,
apply FieldRecords.gs, create a new version and update the existing deployment ID.
Do not create a separate deployment or change the public site for this note.

A private local import bundle was created outside the repository at
`../private-field-records/hortense-photo-verification-2026-11.json` (relative to
the Hortense worktree). It contains one private studio-authored evidence note,
no attached assets, no steward identity/contact/address. It is not in the live
Private Field Records sheet yet. After deploying, import its `entries` using
the existing authenticated admin field_record import operation. Confirm exactly
one record imported (or skipped on retry), visibility private, empty assets,
admin/steward readability and absence from anonymous list responses.

`source_type` is optional: existing records default to `notion` with their source
URL unchanged; `studio` records use a stable 32-hex source ID for idempotency and
a null source_url. Do not invent Notion pages for studio-authored records.
The backend always forces new imports to private, regardless of bundle visibility.
No media storage setup, photo upload or publication is part of this change.
