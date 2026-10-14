# Private designer demand — Phase 4 prepared

Compute exact distance bands in `scripts/build_designer_demand.py` using private
lookup/enrolment CSVs, canonical attribution and git-ignored exact coordinates.
The output remains in `data/private/`; optional `--publish` imports only suppressed
aggregates into private backend sheets using the existing admin credential from
the secure environment. No private credential belongs in command arguments.

Required inputs are current raw CSV exports and both documented calibration
clusters in git-ignored `data/private/demand-calibration.json`. Do not substitute
rounded public lookup coordinates or fuzzed garden pins for exact distances.
Unknown or missing locations stay unavailable. Lookup counts are not people or
consented leads. No new gardens or ecological inputs are generated.

The four bands are disjoint: 0–50m, >50–150m, >150–300m and >300–1000m. A lookup
near several gardens is counted once for that practice, by its nearest garden.
An exact normalised address match to an enrolment or a canonical garden’s private
address excludes that row from latent
demand. This is a conservative recorded-match rule, not proof that all remaining
lookups failed to convert. Rows without identifying address text cannot be linked
to an enrolment; disclose that limitation. Tests, November/December 2025 calibration
months, and both studio/dev calibration clusters are excluded.

Band, month, EVC, council and channel groups below five are returned as `<5`.
Private Designer Demand holds designer ID, aggregate JSON and update time. Public
Demand holds only public aggregate JSON and update time. The server validates
field/label allowlists and rejects unsuppressed small counts. Only an authenticated
practice receives its own latent-demand aggregates. Public APIs have no raw-row
operation. Update timestamps describe the dataset, never individual lookups.

The staged public live dashboard reads suppressed aggregates and maps council
polygons instead of lookup points. The old demand page redirects to it. The staged
change deletes the public raw export and makes the old export script write to
`data/private/`. Existing Git history is not rewritten.

## Publication gates

1. Complete Phase 3 Google authorization and verify its release trigger.
2. Provide/obtain current private lookup and enrolment CSVs, then run the private
   calculation with exact garden coordinates and both calibration clusters.
3. Import the real aggregate output; never publish fixture or invented counts.
4. Verify private practice isolation and public suppressed counts on the deployed
   backend before replacing the public dashboard.
5. Restrict the lookup source sheet's former public/link-view access; the public
   dashboard must no longer require raw-sheet access. Verify the old static raw
   export returns 404 after Pages deployment. Historical public exports are a
   separate privacy follow-up; no destructive Git history rewrite is authorised.

Phase 4 is not deployed. Profile-service remains version 38. Current source-sheet
sharing has not been changed. No live aggregate figures have been invented or
imported, and no raw private rows were added to this branch.
