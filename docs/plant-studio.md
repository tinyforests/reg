# Plant Studio

Plant Studio now lives in tinyforests/gardenerandson:
https://www.gardenerandson.com/plants/studio.html

Client lists use https://www.gardenerandson.com/plants/view.html?p=TOKEN.
The Registry's former pages redirect there, preserving query parameters and
fragments so existing client links continue working. Frontend source and styling
are maintained in that repository; this repository owns the shared library and
Apps Script backend. Both sites read the same data/plant-library.json published
from tinyforests/plants. No plant records or backend data were moved.

| page | who | what |
|---|---|---|
| `/plants/studio.html` | G&S (admin key) | projects, plant search, add to areas, qty/size/notes, edit plant records, add new plants, import Notion themes |
| `/plants/view.html?p=TOKEN` | the client | their plant list as cards, grouped by area, printable |

The Gardener & Son pages read `https://ecologicalregistry.org/data/plant-library.json`
through their local `plants/plant-library.js`.
Add `?mock=1` to either page to try it with an in-browser demo store (no backend).

## Data

```
tinyforests/plants  ──canonical.publish --reg──►  data/plant-library.json   (public fields only)

Apps Script (scripts/appsscript/Plants.gs)
  Plant Projects   project_id, name, client_title, intro, status, view_token,
                   garden_id, source, created_at, updated_at, archived, internal_notes
  Project Plants   project_id, slug, area, qty, size, note, position, updated_at
  Plant Edits      edited_at, slug, field, value_json, editor     (append-only)
```

- `slug` (botanical name, lowercased, hyphenated) is the join key everywhere.
- `name` and `internal_notes` are studio-only. The client view returns
  `client_title`, `intro`, `updated_at` and the lines — nothing else.
- "New link" rotates `view_token`; the old link stops working. Archiving a
  project also hides its client page.
- Record edits are whitelisted per field (`PL_EDITABLE`). A new plant is just
  edits on a slug the library doesn't have yet.

## Routes

| request | auth |
|---|---|
| `GET ?action=plants_view&t=TOKEN` | view token |
| `GET ?action=plants_export_edits&admin_token=` | admin — used by the plants repo's nightly sync |
| `POST {submission_type:'plant_studio', op, admin_token}` | admin. ops: list_projects, get_project, save_project, save_lines, save_edits, list_edits, rotate_token, import_projects |

`save_lines` replaces a project's whole list (the studio autosaves ~1 s after a change).

## Using it elsewhere

Presentations, the journal and agents can read a project with its view token
(`plants_view`) and join slugs to `data/plant-library.json`, or use the studio's
**Export JSON** / **Copy as list**.

## Photos

Notion images were not migrated. Set `image_url` (and `image_credit`) on a record
in the studio; only use photos you have the right to show clients.

## Tests

`node scripts/test_plant_studio.cjs` — Plants.gs against an in-memory Sheets shim:
auth, line replacement, duplicate and formula-injection handling, view-token scope,
edit whitelisting, token rotation, archive, idempotent import.

## Deploy

1. Apps Script editor → add a file `Plants` → paste `scripts/appsscript/Plants.gs`.
2. Paste the updated `Code.gs` (two routing lines added).
3. Deploy → Manage deployments → edit → **New version**. The /exec URL is unchanged.
4. Open `https://www.gardenerandson.com/plants/studio.html`, sign in with the admin key, and use
   **Import Notion projects…** with `migration/notion-projects.json` from tinyforests/plants.
