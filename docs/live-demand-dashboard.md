# Live demand dashboard

**Updated 12 Oct 2026.** `/live.html` measures Find My EVC lookup activity. It is not
an inventory of registered gardens, verified ecological outcomes or unique people.

## Sources and refresh

The page reads the configured Google Forms/Sheets lookup log, columns A:G, using
browser-side Sheets API access. This is a public-read source; the browser API key
is public by design and must remain service/referrer restricted. Never expose
private Registry address, submission or steward sheets through this dashboard.

A visible page polls every 60 seconds, with a 20-second request limit, and refreshes
on visibility return or network reconnection. **Refresh now** uses the same load
path. Requests do not overlap. Failed polls retain the last successful figures,
show a failure state and retry; Feed checked advances only on successful refresh.

All metrics, month bars, rankings, channels and map layers render from the same
fresh dataset and selected studio filter. Changing the filter does not count as a
new fetch and does not advance Feed checked.

## Included rows and labels

- Blank timestamps are ignored. Dates are validated; legacy M/D/YYYY timestamps
  are interpreted as Melbourne wall time, and explicit-zone ISO timestamps are accepted.
- Explicit test rows and November–December 2025 calibration months are always excluded.
- Remaining rows need an EVC code or valid coordinates. The studio toggle separately
  excludes the two documented calibration clusters; it does not toggle test rows.
- Lookups shown is the current view, not the whole sheet or a unique visitor count.
- The footer separates timestamped source rows, excluded rows, included rows before
  the studio filter and displayed rows. Shown since / Latest included lookup follow
  the displayed cohort; Feed checked is the read time. Dates display in Melbourne time.
- Missing EVC or council data stays missing. A mapped lookup is not automatically
  a council-attributed lookup. Direct/referral grouping retains the existing source rules.

## Council attribution

The old parser only recognised addresses containing “City/Shire of …”. Newer rows
usually do not carry this text, leaving council reach apparently frozen while
lookup totals changed. The dashboard now groups recorded coordinates locally
against the public Victorian Government VicPlan/Vicmap Admin LGA polygons.
No lookup locations are transmitted to a geocoding/boundary service for this operation.

The checked-in `data/live-victorian-lgas.geojson` snapshot was retrieved 12 Oct 2026
from [the official layer](https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/VicPlan_Other/MapServer/1),
with WGS84 output, six decimal places and 0.00002-degree simplification. Attribution:
State of Victoria. Grouping is approximate and unsuitable for cadastral/statutory
boundary decisions. Multi-polygons and holes are respected. Addresses supply the
legacy fallback when no spatial match exists; unmatched rows are counted unassigned.
A failed boundary load is explicitly reported and retried on later polls.

Council boundaries are a dated reference layer, not minute-by-minute data. Refresh
this snapshot when the source changes, keeping metadata and attribution. Do not
publish lookup rows or precise garden coordinates as part of that update.

## Validation

`node scripts/test_live_refresh.js` exercises updated counts and coverage,
60-second polling, timestamp integrity, failure/recovery, visibility/reconnection,
overlap prevention, timestamp formats and polygon holes/outside coverage.
Browser checks additionally verify the sheet response, all panels, filter behaviour,
manual refresh and a real automatic refresh. Live totals change with the source;
do not hard-code the diagnostic totals in the page.
