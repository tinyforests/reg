# AGENTS.md — Ecological Registry

The engineering operating brief for any AI agent (Claude Code, Cursor, Codex, Aider, Cline, Roo, others) working on this repo.

## Read order

Read in this sequence before any change. Each layer informs the next.

1. **`/SUPER_MIND.md`** — what the work is for. The strategic, ecological, and cultural frame across all Gardener & Son properties. Read first, every session.
2. **`/AI_CONTEXT.md`** — the quick-start companion. Tone, canonical colours, the five practical-rule questions.
3. **`/AGENTS.md`** (this file) — the repo-specific engineering brief. Non-negotiables, before-editing checklist, docs index.
4. **`/docs/[relevant].md`** — subsystem detail for the area you're touching.

If SUPER_MIND.md or AI_CONTEXT.md disagree with anything here, the senior documents win on intent and tone; this file wins on engineering invariants (schema shape, field names, build steps).

---

## The five practical-rule questions

Before any meaningful change, the five questions from AI_CONTEXT.md apply. They are the operational gate:

1. Does this strengthen the whole system?
2. Does this still feel true to Gardener & Son?
3. Is it beautiful, useful, ecological, and legible?
4. Is the public language grounded?
5. Are the gardens, objects, registry, discovery, and incentives still connected?

**If the answer to any of these is no, stop and surface the conflict before proceeding.**

---

## Non-negotiables (engineering)

These are repo-level invariants. SUPER_MIND.md and AI_CONTEXT.md cover the cultural and tonal invariants — the items below are the mechanical ones that protect the data and the build.

- Do not invent garden data, species, scores, sightings, or yield values.
- Do not imply active yield payments. Yield is not paying anyone today. See `/docs/revenue-and-yield-rules.md`.
- Do not change scoring without updating `reg-score.js`, the Python equivalent (if present), every garden JSON snapshot, and `registry.json` in the same commit.
- Do not use rounded corners. `* { border-radius: 0 !important; }` is enforced globally. Map markers are the only exception.
- Do not use US spelling or US date formats. AU English. `28 Nov 2025`.
- Do not commit partial registry states.
- The code and JSON are source of truth. Chat history is not.

---

## Before editing

1. Read SUPER_MIND.md (always).
2. Read AI_CONTEXT.md (always).
3. Read this file.
4. Read the relevant `/docs/*.md` for the subsystem you're touching.
5. Inspect `registry.json`.
6. Inspect the relevant garden JSON.
7. Inspect the current profile template (reference: York Street profile).
8. Confirm whether the change affects schema, scoring, design, copy, or data — and read the corresponding doc.

---

## Decision log

When making a meaningful product, scoring, naming, schema, or design decision, append an entry to `/docs/decisions-log.md` with:

- Date
- Decision
- Reason
- Files affected

This is the long-term institutional memory. Future agents and Tyson will read it to understand why things are the way they are. Decisions made without an entry will be forgotten and likely reversed.

---

## When this file and the code disagree

Do not guess. Identify the conflict. Preserve existing behaviour unless explicitly instructed. Update the losing source only after confirming intent through nearby code, data, and tests.

If there is no test or precedent to confirm intent, surface the conflict before changing either side. The doc may be stale, but the code may also be wrong — neither wins by default.

---

## Docs index

| Topic | File |
|---|---|
| Engineering-specific product brief (audiences, revenue sequence) | `/docs/registry-product-brief.md` |
| Scoring engine, rating tiers, verification, badges | `/docs/scoring-methodology.md` |
| Garden JSON, registry.json, repository structure | `/docs/data-schema.md` |
| Palette, theme, typography, geometry | `/docs/design-system.md` |
| Field note conventions and documentary methodology | `/docs/field-notes-method.md` |
| Yield calculation, eligibility, revenue language rules | `/docs/revenue-and-yield-rules.md` |
| Current registry state — gardens, species, councils | `/docs/current-state.md` |
| Known unfinished work | `/docs/pending-work.md` |
| Decision log | `/docs/decisions-log.md` |

For strategic frame, tone, and cross-property context: `/SUPER_MIND.md` and `/AI_CONTEXT.md` at the repo root.

---

## A note on this file

`CLAUDE.md` mirrors this file for Claude compatibility. **`AGENTS.md` is canonical** in the engineering layer. If they ever drift, AGENTS.md wins and CLAUDE.md should be re-synced.

`SUPER_MIND.md` sits above both and is canonical for intent, tone, and cross-property frame.
