# REG National Jurisdiction Architecture — Phase 1 drop

Drop into `~/Projects/reg`. Nothing here is wired into the live site yet.

    NATIONAL-ARCHITECTURE.md   deliverables 1-5, 7-10 + the strategic call
    CAPABILITY-MATRIX.md       deliverable 6 — endpoints confirmed 23 Aug 2026
    jurisdiction/              the layer
      resolver.js              coords -> country + state/territory
      schema.js                canonical record + provenance constructors
      arcgis.js                shared query/identify helpers
      index.js                 resolveEcologicalContext() — the entry point
      adapters/vic.js          Victoria (EVC) — output parity with current path
      adapters/au-national.js  IBRA 7.1 + NVIS 7.0 pre-1750 MVS
      adapters/nsw.js          NSW (PCT) — written, disabled, Phase 4
      test/proof.mjs           12 checks, offline
    tools/
      audit-victorian-assumptions.sh   run in the repo root
      capture-fixtures.mjs             capture live payloads

    node jurisdiction/test/proof.mjs
