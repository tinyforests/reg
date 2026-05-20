# Design System

The Registry uses Tailwind CSS (CDN build) with a custom colour palette and a single global geometry rule. These are the actual tokens from the profile template — match these exactly when adding new pages.

## Palette (Tailwind tokens)

| Token | Value | Use |
|---|---|---|
| `rg` | `#3d4535` | Gardener Green — primary dark, body text on light, background in Canopy mode |
| `rb` | `#fff0dc` | Registry Beige — primary light, background in Understory mode, text on dark |
| `rs` | `#f7ead6` | Registry Sand — subtle warm accent on light surfaces (tags, panels) |
| `rl` | `#d7ccb9` | Registry Line — borders on light surfaces |
| `rdp` | `#485141` | Registry Dark Panel — slightly lighter dark for card surfaces in Canopy mode |
| `rdl` | `rgba(255,240,220,0.12)` | Registry Dark Line — borders on dark surfaces |
| `signal` | `#7a9e5f` | Signal Green — the hero score box, fauna sighting cues, map markers |

The Tailwind config in every page header must include all seven tokens. Do not introduce additional colours without a decision-log entry.

**Note on Signal Green:** The Registry uses `#7a9e5f`. Village Rewards uses `#a8c285` (lighter, brighter). These are different products with different signal greens — do not unify them by accident.

## Theme — Canopy / Understory

- **Canopy** = dark mode = `<html class="dark">`. **This is the default.**
- **Understory** = light mode = `<html class="light">` (or absence of `dark`).

The theme toggle button labels itself with the **current** mode (button says "Canopy" while in dark mode, "Understory" while in light mode). Preference is stored at `localStorage['reg-theme']` as `'dark'` or `'light'`.

**Inversion rule:** the palette is paired (`rg ↔ rb`, `rs ↔ rdp`, `rl ↔ rdl`) and Tailwind's `dark:` variant handles the flip. Do not write per-component dark mode overrides outside the token system. Bar tracks in Canopy mode use `rgba(255,240,220,0.12)`.

## Geometry

```css
* { border-radius: 0 !important; }
```

This rule is enforced globally on every Registry page. The only exceptions are map markers (Leaflet div icons), which use explicit `border-radius: 50% !important` to override the global rule for circular markers — these are the only circles allowed.

Other geometry conventions:

- Thin accent bars (1.5–2px) at the top of cards
- Section labels in small caps, mono font, 0.65–0.7rem, opacity 0.5–0.6
- Sticky nav with a "scrolled" state (background fill after threshold)
- Stagger fade-up animations on section reveal (`@keyframes fadeUp`)
- Concentric circle motifs used selectively for badges and accents

## Typography

| Element | Font | Notes |
|---|---|---|
| Hero name and section titles | `Abril Fatface` (serif) | G&S brand standard, 4rem–7rem |
| Body | `IBM Plex Sans` | All running text, navigation, captions |
| Numeric / identifier | `IBM Plex Mono` | Registry IDs, dates, coordinates |

Loaded via Google Fonts. Three font families is the maximum — do not add a fourth.

Some sibling products use different display fonts (YIELD uses Fraunces, Heirloom may differ). The Registry uses Abril Fatface. Stay consistent within the Registry.

## Hero score box

Embedded in the hero on the right (lg:col-span-4). Background uses the Signal Green token (`#7a9e5f`) with `color: #3d4535`. Contents:

- Two stacked panels: score (4.5rem digits) and badges (4.5rem digits)
- Rating tier label as a small pill below
- Progress bar from 0 to score with baseline and target markers underneath
- Earned badges as a flex-wrap row of pills at the bottom, verification and corridor-node badges shown stronger

This box appears on every profile page. It is rendered from `scoreEcologicalRegistry(record)` and `awardBadges(record)` — do not hard-code values.

## Profile page section order

The reference template is the York Street profile. Sections (in order):

1. **Hero** — name, type, description, stewards, Registry ID on left; embedded score box on right
2. **Signals** — two 6-cell grids of structured ecological data (EVC, canopy, species count, layers, soil, water in primary; habitat nodes, fauna sightings, bioregion, planting method, weed pressure, last assessment in secondary)
3. **Score Breakdown** — five category bars + opportunity list (top 3 recommendations)
4. **Network Position** — Leaflet corridor map + node status panel + adjacency list + connectivity score + network contribution + curbing layer note
5. **Species List** — documented species count + grid of italicised botanical names
6. **Trajectory** — milestones (chronological) + next level panel + 3-year vision text
7. **Field Record** — activity log entries + garden facts sidebar

There is currently **no yield section on this profile**. See `/docs/revenue-and-yield-rules.md` for the open issue.

## Map specification (Leaflet)

The Network Position section embeds a Leaflet map with the CARTO `light_all` tile layer, styled with a CSS filter:

```css
#corridorMap .leaflet-tile-pane {
  filter: grayscale(0.3) sepia(0.15) hue-rotate(60deg) brightness(0.97);
}
```

Three marker classes (`.reg-marker`, `.park-marker`, `.adj-marker`) provide the only allowed circles in the design system. Popup wrappers respect the no-radius rule. Map zoom defaults to 14, scroll-wheel zoom disabled.

If the garden JSON is missing `connectivity.lat` / `connectivity.lng`, the map renders a fallback "No coordinates in data" message. Always supply coordinates.

## Notification system

Profile pages carry a fixed-position notification element (`#erNotif`) that slides down from the top when:

- A new badge is awarded since last visit (compared against `localStorage['er_badges_' + gardenId]`)
- The score has lifted since last visit (compared against `localStorage['er_score_' + gardenId]`)

Notifications queue and display sequentially with a 7-second auto-dismiss. The background uses `#e8f0e0` with `#b8d4a0` border — this is the only place the celebratory pale-green is used; do not promote it to a palette token.

There is a duplicate, older notification system (`#badgeNotification`, `BADGE_DESCS`, `_notifQueue`, `showNextNotification`) still present in the York template. **It is unused** — the `#badgeNotification` element is not in the HTML body, only its CSS and JS are present. Should be removed in a future cleanup. Add a decision log entry when it goes.

## Landing page

The landing page is also the public registry entry point. It carries:

- Hero with the registry value proposition
- The current demo garden (currently Rupert, marked as `status: "Demo garden"`)
- Aggregated registry statistics from `registry.json`
- The three-audience framing (stewards, councils, investors)
- Steward signup CTA

The landing page is the visual reference. If a profile and the landing page disagree visually, the landing page wins and the profile re-syncs.
