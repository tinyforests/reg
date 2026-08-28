# Method v2 — shadow build

Nothing in this directory is canonical. `js/reg-score.js` (Method v1.0) remains the only engine that produces a published score. This package computes EP / EC / LO alongside it and publishes nothing.

```
v2/
  HYPOTHESES.md                  the gate — every number, its status, how to validate it
  reg-score-v2.js                shadow engine (pure, no writes)
  run_shadow.js                  runner + comparison report
  audit_areas.py                 Phase 1 blocker — area reconciliation
  locales/AU-VIC.json            all coefficients live here, none in code
  schema/site-envelope.schema.json
  fixtures/examples.json         the four brief examples
```

## Order of work

**Step 1 — fix the source data. Nothing else starts until this is clean.**

```bash
cd ~/Projects/reg
python3 v2/audit_areas.py --data data/gardens --csv area-audit.csv
```

Exits non-zero while any record carries a flag other than `NO_SITE_ENVELOPE`. Arundel, Middlesex and Sir Garnet are hardcoded as known-suspect and will flag regardless. Field-verify, correct through the normal input path, re-run until clean.

**Step 2 — pin v1 so it can never drift.**

```bash
# add to every record via the normal writer, not by hand
#   method_version: "1.0"
#   locale: "AU-VIC"
python3 scripts/sync_registry.py
python3 tests/test_parity.py          # parity must not change (23/0 at time of writing)
```

**Step 3 — wire the real pillar caps (H-001).**

The caps in `locales/AU-VIC.json` are placeholders. Replace them with the actual constants from `js/reg-score.js`. Until this is done, every EP figure produced here is meaningless.

**Step 4 — run the shadow.**

```bash
node v2/run_shadow.js                                  # the four fixtures
node v2/run_shadow.js --data data/gardens --json shadow-001.json
```

Requires `site_envelope` on the record. Records without one are skipped, not guessed.

**Step 5 — calibrate against H-101.**

Median existing record's EP within ±5 of its v1 score, tier anchors at 32 / 50 / 91 still meaning what they mean. If that fails, the model is wrong, not the stewards.

## Standing rules

1. No coefficient in code. All numbers come from a locale pack.
2. `title_area_m2` is never read by any scoring function. This is auditable by grep and should stay that way.
3. Applicability reduces the denominator. Points are never invented.
4. Persistence and network affect EC only, never EP.
5. Every output carries `method_version` and `locale_version`.
6. A defect found in a shadow run gets logged in HYPOTHESES.md before it gets fixed.

## Shadow run 001 — findings

```
site                              class                    EP      EC     pot      LO
6 m2 Melbourne balcony            balcony                  86     2.1     4.4     2.3
35 m2 Melbourne courtyard         courtyard_micro          73    21.1    61.6    40.5
500 m2 Melbourne suburban         standard_residential     68   311.3    1452  1140.7
1000 m2 Singapore landed          large_residential        45   628.8  2947.1  2318.3
```

The shape is right. The 500 m² block carries more latent opportunity than everything above it combined, which is the finding the model exists to surface.

Three problems, all logged:

- **H-010a (defect).** Multiplying LAI by occupied height double-counts vertical extent. Leaf area index is already a per-ground-area measure. This inflates large canopies badly and makes the potential figures implausible. Upstream of everything — fix first. Also determines whether the Green Plot Ratio comparability actually exists or was wishful.
- **H-070.** EP says 68 for the suburban block; the attainment ratio says 21%. The two measures are deliberately not identical, but a 47-point divergence can't be explained to a steward.
- **H-071.** EC is close to linear in growing area. Confirms in numbers what was a suspicion in prose: EC must never be ranked, tiered or leaderboarded.

The Singapore fixture correctly trips the non-waivable ceiling (not chemical-free, no fauna water point, indigenous fraction 0.25) — and it is currently being scored with a borrowed Victorian locale pack, which is invalid. Treat that row as a mechanism test, not a result.
