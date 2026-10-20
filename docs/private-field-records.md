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
