# Field Notes Method

Field notes are the documentary backbone of every garden. They are the evidence layer beneath the score.

## URL and file conventions

- **Path:** `/gardens/[name][number]/field-notes/YYYY-MM-DD.html`
- **Filename:** ISO date (e.g. `2025-11-28.html`)
- **Displayed date:** Australian format (e.g. `28 Nov 2025`)
- **One note per date.** If multiple events happen on one day, combine them into one note.

## Structure

Every field note follows the same three-part structure.

1. **Observation.** What is visible. Describe before interpreting.
2. **Method.** What was done, or what is being done. Tools, materials, techniques.
3. **Next steps.** What follows from this. Often dated or seasonally scoped.

A signal box at the top summarises score impact and any new badges or evidence. The signal box uses the Signal Green token (see `/docs/design-system.md`).

## Theme

Canopy / Understory toggle on every field note. Same theme system as profiles. No per-note design variation.

## Documentary methodology

Field notes are documentary, not promotional. The standards:

- **Photos before claims.** If there is no photo, the claim is weaker.
- **Inference is allowed when framed.** "The presence of X suggests Y" is fine. "X means Y" requires evidence.
- **No marketing language.** No "stunning," no "beautiful," no "amazing." Descriptive language is enough.
- **Date precision.** Use the actual date of the observation. Do not backfill or round.
- **Steward voice optional.** Some notes are written in the steward's voice with attribution. Most are written in observational third person.

## Activity log integration

When a field note is added, its date and title must also be appended to the garden JSON's `activity_log` and `field_notes` arrays. Both arrays remain in chronological order.

```jsonc
"activity_log": [
  { "date": "2025-11-28", "event": "Planting day — wild native meadow installed" }
],
"field_notes": [
  { "date": "2025-11-28", "title": "Planting day", "url": "/gardens/evelina23/field-notes/2025-11-28.html" }
]
```

## Image handling

Currently field note images are inline base64. This is functional but expensive — the largest notes are over 10MB (the 15 Jan Arundel baseline note is 11MB).

**Migration priority** — base64 → `/assets/` folder or Cloudinary CDN. Replace inline data URIs with relative or absolute URL references. Queue order:

1. Notes over 5MB first
2. Notes 2–5MB next
3. Smaller notes incrementally

Field notes over 2MB to prioritise (known list, expand as discovered):

- 15 Jan 2026 — Arundel baseline
- 7 Oct 2025 — Arundel aerial
- 28 Nov 2025 — Evelina planting day

When a note is migrated, replace its base64 blocks with `/assets/[garden]/[YYYY-MM-DD]-[slug].jpg` references. Keep the original aspect ratios in the HTML — let the browser size them.

## Score impact from field notes

A field note can raise a garden's score by adding evidence. The categories that move when a note is published:

- **Fauna sighting documented** → Evidence pillar, possibly the `fauna_record` badge
- **New species identified** → Biodiversity pillar (if it pushes species count over a threshold)
- **Habitat installation** (logs, rocks, water feature, nesting boxes) → Habitat pillar
- **Professional assessment** → Evidence pillar
- **Soil/water work** → Soil & Water pillar

When publishing a note that triggers a score change:

1. Update the garden JSON `score_breakdown` and `score`.
2. Update `rating` from the new score.
3. Update `last_verified` if relevant.
4. Run the registry recalculation (see `/docs/data-schema.md`).
5. Commit all changes together.

## What field notes are not

- Not blog posts
- Not garden tours
- Not steward testimonials (those have their own pattern)
- Not marketing for G&S services

They are observational records of what is happening in a garden, written for the long term.
