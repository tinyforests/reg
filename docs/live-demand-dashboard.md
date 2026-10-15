# Aggregate demand dashboard — Phase 4 prepared

The staged `/live.html` reads only suppressed aggregate counts from the existing
Apps Script backend. No raw lookup address, location or individual timestamp is
sent to the browser. The map shows public council boundaries with aggregate counts;
small groups are `<5`. Tests and documented calibration clusters are always excluded.
The old `/demand.html` redirects to this view; the public raw export is removed.

A visible page polls every 60 seconds with a 20-second timeout. Manual refresh,
visibility return and network reconnection use the same non-overlapping load path.
Failed polls retain the last real aggregate figures and show a failed refresh.
Feed checked advances only on successful reads. Source timestamps describe aggregate
publication; earliest/latest labels are months, not individual lookup timestamps.

Public counts describe lookup activity, not registered gardens, ecological outcomes,
unique people or opted-in sales leads. Individual raw inputs are processed by the
private demand script. No dummy numbers are substituted when the feed is unavailable.

This change is not live until real aggregates are imported and source-sheet public
sharing is restricted. See [designer-demand.md](designer-demand.md) for gates and
conversion matching limits. Profile-service currently remains version 38.
