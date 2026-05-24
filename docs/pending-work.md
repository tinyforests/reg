# Pending Work

Known unfinished items. Move items out of this file as they complete (and into the decision log if they involve a meaningful decision).

## High priority


### Badge engine — `pollinator_rich` badge threshold not reachable from assess.html

`pollinator_rich` requires 3+ verified fauna sightings. `assess.html` now correctly generates N fauna sightings when count > 1, so this is reachable from the form. However, the additional sightings are generated as placeholder entries ("Additional sighting 2") rather than real species names. If pollinator richness needs to be accurate, the fauna section of assess.html should be extended to allow entry of multiple named sightings (future improvement).

### Image migration — base64 → /assets/ or Cloudinary

Field notes currently contain inline base64 images. The largest notes are 10MB+. This is a soft scaling problem (GitHub Pages 1GB repo limit, slow page loads, bad diffs).

**Queue:**

1. Notes over 5MB first
2. Notes 2–5MB next
3. Smaller notes incrementally

**Known notes to prioritise:**

- 15 Jan 2026 — Arundel baseline (~11MB)
- 7 Oct 2025 — Arundel aerial
- 28 Nov 2025 — Evelina planting day

See `/docs/field-notes-method.md` for migration approach.

### Google Sheet access — for reporting dashboard

The reporting strategy across fmeg (findmyecologicalgarden.com), fmevc (findmyevc.com), and fmnp (findmynativeplants.com.au) is agreed:

1. Dashboard pulling from the existing Google Sheet (500+ rows: timestamp, address, lat/lng, EVC code, EVC name, referrals) via Google Sheets API. Lives on ecologicalregistry.org.
2. Contextual Registry nudges injected into search results across all three sites.
3. Public data summary page on ecologicalregistry.org.

**Blocked on:** Google Sheet access credentials. Build cannot proceed until access is granted.

### fmnp HTTPS — broken

`findmynativeplants.com.au` has a broken HTTPS configuration.

**Fix path:** GitHub Pages + GoDaddy DNS. A records and CNAME configuration. Enforce HTTPS checkbox in GitHub Pages settings.

This is outside the Registry repo but tracked here because it blocks the unified reporting work above.

## Medium priority

### Council pilot — first signed pilot

Target: Whitehorse first (home council). Triggered when Whitehorse reaches five registered gardens. Currently at three (Evelina, Dewrang, York Street).

Boroondara is over threshold (six gardens) but Whitehorse is the relationship-first target.

### Scoring engine consolidation

JS and Python implementations should produce identical scores for identical inputs. Periodic audit recommended — write a test harness that runs every garden JSON through both implementations and asserts equality.

### Sponsor pipeline outreach

For the Yield layer to activate, three sponsor categories need engagement:

1. Local government (Whitehorse, Boroondara, Stonnington)
2. Corporate sustainability programs
3. Philanthropic foundations

Status: pipeline exists in conceptual form, no active conversations yet.

## Low priority / longer term

### Public registration path

Currently every garden is added via G&S (paid Steward Review). A future public registration path needs:

- Self-assessment form
- Photo upload pipeline
- Verification queue
- Tiering UI (self_assessed / professional_assessed / gardener_and_son_verified)

### YIELD methodology page

The yield formula is currently `"formula_note": "Score x area x connectivity x verification. Formula v1."` This needs a public methodology page explaining the formula transparently before yield activates.

### Decisions log backfill

The decisions log is starting fresh. Earlier major decisions (scoring rebalance, Canopy/Understory rename, typology field addition, registry_role and trajectory fields, yield section addition) deserve retrospective entries if they ever need to be re-litigated.

## Out of scope (do not work on without explicit instruction)

- Carbon offsetting methodology — not pursued until biodiversity infrastructure is mature
- Marketplace functionality — Registry is not a marketplace
- Social features — not a social network
- Mobile app — web is sufficient
