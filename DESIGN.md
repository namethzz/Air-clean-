---
name: AirClean
description: The soi's registered motorcycle-taxi stand in AirClean blue, where every job and technician wears a numbered plate.
colors:
  vest-blue-900: "#0b2f74"
  vest-blue-800: "#0f3f99"
  vest-blue-700: "#1450b8"
  vest-blue-600: "#1756c8"
  vest-blue-500: "#1f6fe0"
  vest-blue-400: "#3d8bef"
  vest-blue-100: "#e9f1fd"
  vest-blue-050: "#f4f8fe"
  on-blue: "#ffffff"
  on-blue-2: "#cfe0fb"
  ink: "#0f1e33"
  ink-2: "#33445c"
  ink-3: "#52627a"
  placeholder: "#66768c"
  ground: "#f3f7fc"
  surface: "#ffffff"
  sunken: "#f5f8fc"
  line: "#d8e1ec"
  line-strong: "#b9c7d8"
  turn: "#3ddbaa"
  turn-deep: "#1fbf8f"
  turn-ink: "#0b2a22"
  turn-bg: "#e4fbf3"
  done: "#0e7a5f"
  done-bg: "#e3f5ee"
  wait: "#9a5b00"
  wait-bg: "#fff4dd"
  problem: "#b42318"
  problem-bg: "#fdecea"
typography:
  display:
    fontFamily: "Kanit, IBM Plex Sans Thai Looped, Noto Sans Thai, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
  plate-number:
    fontFamily: "Kanit, IBM Plex Sans Thai Looped, Noto Sans Thai, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Kanit, IBM Plex Sans Thai Looped, Noto Sans Thai, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Kanit, IBM Plex Sans Thai Looped, Noto Sans Thai, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "IBM Plex Sans Thai Looped, IBM Plex Sans Thai, Noto Sans Thai, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Sans Thai Looped, IBM Plex Sans Thai, Noto Sans Thai, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  sm: "8px"
  base: "12px"
  md: "14px"
  lg: "18px"
  sheet: "22px"
  pill: "999px"
spacing:
  gap-1: "4px"
  gap-2: "8px"
  gap-3: "12px"
  gap-4: "16px"
  gap-5: "20px"
  gap-6: "24px"
  gap-8: "32px"
  gap-10: "40px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.vest-blue-700}"
    textColor: "{colors.on-blue}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.vest-blue-800}"
  button-turn:
    backgroundColor: "{colors.turn}"
    textColor: "{colors.turn-ink}"
    rounded: "{rounded.md}"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.vest-blue-700}"
    rounded: "{rounded.md}"
  button-lg:
    height: "52px"
    padding: "0 24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "0 14px"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  plate:
    backgroundColor: "{colors.vest-blue-700}"
    textColor: "{colors.on-blue}"
    typography: "{typography.plate-number}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  plate-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.vest-blue-700}"
    rounded: "{rounded.md}"
  strip:
    backgroundColor: "{colors.turn}"
    textColor: "{colors.turn-ink}"
    rounded: "{rounded.base}"
    padding: "9px 14px"
  chip-on:
    backgroundColor: "{colors.vest-blue-700}"
    textColor: "{colors.on-blue}"
    rounded: "{rounded.pill}"
    height: "40px"
---

# Design System: AirClean

## Overview

**Creative North Star: "The Win Stand Vest"**

AirClean is the soi's registered motorcycle-taxi stand (วินมอเตอร์ไซค์) translated into AirClean blue. Every job and every technician wears a numbered vest-blue plate whose key number (a price, a payout, a distance) reads at arm's length, and a reflective orange strip marks whose turn it is. Vest-blue fields carry the shell (rail, band) and the plates; plain white working cards sit on a cool ground with navy ink. The app refuses the delivery-app default where every object is the same grey card with a small blue button. Controls are standard ones people already know; the world shows in colour, type, density and the plate.

**Key Characteristics:**
- A light frame: white rail and phone bar, white cards on a pale cool ground; vivid blue only for the main action, the active place and the plate's key number.
- White cards on a cool blue-grey ground; navy, never black, ink.
- Mint appears only when it is this person's turn now (orange until 2026-10-17, changed at the owner's request).
- Kanit numerals and headings, read like a vest's printed number.
- Large touch targets (48px, 52px large) for outdoor, one-handed use.

## Colors

One blue family does almost all the work; mint and the three state colours are signals, never decoration. All values live in `frontend/src/styles/tokens.css` as `--v-*`.

### Primary
- **Vest Blue scale** (`--v-blue-900` to `--v-blue-050`): 500 to 600 the plate gradient; 700 is primary buttons, links, active chips and the selected day or room; 100/050 tint the active nav item, the job band, the sign-in side column and the legal band; 800 is the summary numbers and pressed primary.
- **On Blue / On Blue 2** (`--v-on-blue`, `--v-on-blue-2`): primary and secondary text on any blue field.

### Secondary
- **Mint** (`--v-turn`, `--v-turn-deep`, `--v-turn-bg`, ink `--v-turn-ink`): the strip, `is-turn` buttons and badges, the rail/tab counts, the current stop on a job's route, a summary cell that is the person's turn (pale mint with a mint underline), and the hero badge when it is the person's turn. Dark ink on mint, never white.

### Neutral
- **Ink** (`--v-ink`, `--v-ink-2`, `--v-ink-3`, `--v-placeholder`): headings and body; labels; secondary lines and captions; placeholders.
- **Ground / Surface / Sunken** (`--v-ground`, `--v-surface`, `--v-sunken`): page background, cards and sheets, disabled fields and neutral badges.
- **Line / Line Strong** (`--v-line`, `--v-line-strong`): card and list dividers; control borders.

### States
- **Done** teal, **Wait** amber, **Problem** red, each with a `-bg` tint: badges (`ui-badge.is-done|is-wait|is-problem`), alerts, problem text and invalid field borders. Colour only where it means something.
- Each state also has a `-line` border and an `-ink` text colour for use on its tint (`--v-done-line`, `--v-wait-ink`, `--v-problem-line`, …), and `--v-blue-line` borders the blue info tint. Rating stars use `--v-star`, an amber dark enough to read on white.

### Named Rules
**The Your-Turn-Only Rule.** `--v-turn` marks exactly one thing: what this person must do now. Never use it for emphasis, promotion or brand.
**The Token Source Rule.** Colours come from `--v-*`. Raw hex belongs in `tokens.css` only, except brand-mandated third-party buttons.

## Typography

**Display Font:** Kanit (`--v-font-head`, falls back to IBM Plex Sans Thai Looped, Noto Sans Thai)
**Body Font:** IBM Plex Sans Thai Looped (`--v-font-text`, falls back to IBM Plex Sans Thai, Noto Sans Thai)

**Character:** Kanit 600 is the vest's printed number: geometric, confident, tabular for figures. Looped Plex keeps Thai text calm and legible for people not confident with technology.

### Hierarchy
- **Plate number** (600, `--v-num` 2.5rem, 1, tabular-nums): the price, payout or distance on a plate. Unit in a 1rem `small`.
- **Display** (600, `--v-text-3xl` 2.25rem): sign-in band title, openings.
- **Headline** (600, `--v-text-2xl` 1.75rem, 1.25): page `h1` in `PageHead`, photo-card titles.
- **Title** (600, `--v-text-lg`/`--v-text-xl` 1.125 to 1.375rem): section, card, empty-state and sheet headings.
- **Body** (400, 1rem, 1.6, max 62ch in page leads): copy. The bare `body` default is 14px/1.55.
- **Label** (600, `--v-text-sm` 0.875rem): field labels, row secondaries, alerts; `--v-text-xs` 0.75rem for badges, tab labels, counts.

### Named Rules
**The Numerals-in-Kanit Rule.** Any number or date in data uses `ui-num` (Kanit, tabular-nums) so columns align and figures read as plates.

## Layout

- **Spacing** steps on `--v-gap-1..10` (4, 8, 12, 16, 20, 24, 32, 40px). Pages are a column with `--v-gap-6` (20px on phones); `ui-page` max 1120px, `is-narrow` 760px.
- **Wide screens (min-width 1024px):** a fixed 256px white rail with a right border (blue brand mark, blue "book" CTA, nav with a blue-100 active item, me) and a sticky white top bar (72px, translucent with blur) with title, search and bell.
- **Phones and tablets (max-width 1023px):** a sticky white bar (64px + safe area, bottom border, blur) with the blue mark, title and bell; a white bottom tab bar (3 or 5 tabs, 56px targets, raised round blue book button) for customers, managers and technicians; the admin gets a slide-in rail.
- **Band and card over its edge:** on phones a pale blue band (blue-100 fading to the ground) carries the title and a white card overlaps its lower edge with a negative top margin (sign-in `au-card` -40px, legal `lg-body` -48px).
- **Job list and detail (`jb`, Jobs.css):** one column on phones (list, or the job page when one is open); from 900px a sticky list of 300 to 380px beside the detail. Shared by customers, building managers and technicians (`tj-` adds technician parts).
- **Admin list beside detail:** tracking `tk` puts the chosen job and map (7fr) beside the list (min 320px, 5fr) from 1024px, sticky at 88px; on phones the job comes first. `ad-two` pairs cards at min 420px.
- **Summary band (`jb-summary`, reused by `ad-summary`, buildings, reports):** a white card split into equal cells (3, or 4 for admin queues, 2 on small phones) divided by hairlines; Kanit numbers in blue-800; a cell that is the person's turn is pale mint with a mint underline.

## Elevation & Depth

Hybrid: depth is mostly tonal (white on ground, blue on white), with three blue-tinted shadows.

### Shadow Vocabulary
- **Card** (`--v-shadow-card`): cards, lists, quiet plates, auth card.
- **Plate** (`--v-shadow-plate`): blue plates and photo cards.
- **Raised** (`--v-shadow-raised`): sheets and the update banner.

### Named Rules
**The Blue Shadow Rule.** Shadows are tinted with ink or vest-blue-900, never neutral grey, and only lift what sits above the ground.

## Shapes

Gently rounded, sturdy rectangles. Buttons, plates, options, tabs and toasts use `--v-radius-md` (14px); fields, icon buttons, rows' leads, strips and alerts 12px; cards, lists, empty states and photo cards 18px; small buttons 12px; sheets 22px (top corners only on phones). Badges, chips, counts and tab icon wells are pills. A strip inside a plate runs edge to edge with square corners.

## Components

Shared components are `ui-*` in `styles/ui.css`; React helpers in `components/kit.tsx`.

- **Buttons `ui-btn`:** 48px (`--v-control`), 600 text. Default white with strong line; `is-primary` blue-700 (the one main action); `is-turn` mint (only when the action is the person's turn); `is-ghost` blue text; `is-danger` red text; `is-light` white on blue or photo; `is-lg` 52px (`--v-control-lg`, pinned or primary phone actions); `is-sm` 38px for dense rows; `is-block` full width. Hover tints, active nudges 1px; disabled turns plain grey (sunken ground, ink-3 text) rather than fading, so it stays readable outdoors; `aria-busy` for work.
- **`ui-icon-btn`** 44px square; **`ui-link`** underlined inline action.
- **Fields `ui-field` + `ui-input`/`ui-select`/`ui-textarea`:** 48px, 16px text, label above, help `small`. Focus: blue-600 border plus 3px blue halo; `aria-invalid` red border and halo.
- **`ui-option`:** one choice from a few, with a line each (radio/checkbox or `aria-checked`); selected gets blue border and tint. **`ui-check`:** labelled checkbox, 44px.
- **`ui-card`** (white working card, 20px padding, 16 on phones) with `ui-card-head`; **`ui-list` + `ui-row`** (64px rows with lead, text, trail; rows that are buttons or links tint on hover).
- **`ui-badge`:** dot plus label for status (`is-active`, `is-done`, `is-wait`, `is-problem`, `is-turn`). **`ui-chip`:** 40px filter pills, `aria-pressed` fills blue, optional count `b`. **`ui-tabs`:** segmented control, selected fills blue.
- **`ui-alert`:** inline message, `is-info|is-done|is-wait|is-problem`. **`ui-skeleton`**, **`ui-spin`** for loading.
- **`PageHead`** (`ui-page-head`): page title, a line on what it is for, actions that wrap below on phones.
- **`Plate`** (`ui-plate`): one object's key number plus qualifying facts (`meta`), a `side` column (tags, rating), an optional strip. `quiet` is the white plate for offers or jobs not first in line; the first is blue. `ui-plate-tag` marks a fact like "ตรวจแล้ว".
- **`Strip`** (`ui-strip`, `role="status"`): the mint strip, only when it is your turn.
- **`EmptyState`** (`ui-empty`): dashed panel saying what will appear and the action that makes it appear.
- **`Problem`** (`ui-problem`, `role="alert"`, `data-problem`): a problem placed next to the thing it is about.
- **`Sheet`** (`ui-sheet is-framed`): bottom sheet on phones, dialog from 640px; fixed head with close, scrolling body, `footer` pinned so a long form keeps its button in reach; `wide` for 760px forms (94dvh on phones).
- **`PhotoCard`** (`ui-photo-card`): a photo of the work under a blue gradient with a headline and one action, for empty pages and invitations.
- **`Steps`** (`ui-steps`): numbered blue circles on a blue rule, only for a real sequence.
- **Opening `hx-`** (`components/ui/hero-section-6`): full-screen opening on the landing page and each role's first page; white-to-vest-blue glow, Kanit headline that is the next step, real screens in device frames, badge orange when it is the person's turn.

### Plate and Strip (signature)
The plate is the system's signature: a 160-degree vest-blue gradient (500 to 600) with a Kanit number. The strip hangs off its lower edge when the plate's object is waiting on the viewer.

**The Single Sheen Rule.** When a strip appears it makes one sheen sweep (`ui-glint`, 1.1s, once, 0.25s delay), and none under reduced motion. Nothing else in the app animates for attention.

### Motion
`--v-ease` (0.2, 0.8, 0.2, 1) with `--v-fast` 160ms for hovers and presses, `--v-slow` 260ms for sheets, backdrop and the admin menu. Under `prefers-reduced-motion` the sheen, skeleton shimmer, sheet rise and component transitions stop, and spinners slow to 2.4s.

### CSS by area (one prefix per area)
`styles/tokens.css` tokens and the `.ac-shell` base · `styles/ui.css` `ui-` · `styles/shell.css` `sh-` frame · `pages/Jobs.css` `jb-` (shared job layout) · `pages/Home.css` `hm-` · `pages/NearbyJobs.css` `nj-` · `pages/TechnicianJobs.css` `tj-` · `pages/Buildings.css` `bd-` · `pages/Admin.css` `ad-`, `tk-` · `pages/Auth.css` `au-` · `pages/Profile.css` `pf-` · `pages/Membership.css` `ms-` · `pages/History.css` `hs-` · `pages/Landing.css` `ld-` with `components/ui/hero-section-6.css` `hx-` · `components/Request.css` `rq-`, `tm-`, `pl-`, `rp-` · `components/Pricing.css` `pr-` · `components/Receipt.css` `rt-` · `components/JobPhotos.css` `ph-` · `components/LocationMap.css` `map-` · `components/NotificationBell.css` `nb-` · legal pages `frontend/privacy.html`, `frontend/terms.html` with `src/legal/legal.css` `lg-` (imports tokens.css, loads without the app).

### Technician setup (`components/Setup.css`, `ts-`)
A new technician's first screen (`pages/TechnicianSetup.tsx`) and the profile's service editor share `components/TechnicianServices.tsx`: what they clean (`ServicesPicker`: kinds of unit as `ui-option` checkboxes with their drawings, deep cleans yes or no, other work as chips) and their prices (`PriceSheetEditor`: one row per kind they clean, a large ฿ box per price with what most technicians charge and "use this price", the per-unit additions, and a worked example of a typical job). The setup is five steps on a numbered step line (done steps are links back), one `ui-card` per step, and the step's buttons pinned at the foot above the tab bar. A draft is kept on the device.

### Accessibility in the code
- Fields are 16px; on screens up to 850px any non-`ui-*` field inside `.ac-shell` is forced to 16px so iOS does not zoom.
- `:focus-visible` draws a 2px blue-500 ring offset 2px; on blue plates and photo cards the ring turns white.
- `Sheet` moves focus in, traps Tab, closes the top sheet only on Escape or outside tap, locks page scroll, and returns focus on close.
- Problems sit next to their field (`Problem`, `aria-invalid`); on submit the form scrolls to and focuses the first `[data-problem]` or invalid field.
- Targets: 44px minimum, 48px controls, 52px large, 56px tabs. Reduced motion as above.

## Do's and Don'ts

### Do:
- **Do** take every colour, size, gap, radius, shadow and duration from `--v-*` tokens.
- **Do** put an object's key number on a `Plate`; make the first-in-line plate blue and the rest `quiet`.
- **Do** use `ui-btn is-primary` for the one main action and `is-lg` (52px) for the pinned phone action.
- **Do** show a problem next to its field with `Problem` and focus it.
- **Do** put new area styles in that area's stylesheet under its own prefix, refining `ui-*` rather than re-creating it.
- **Do** use `ui-num` for numbers and dates in data.

### Don't:
- **Don't** use `--v-turn` mint for anything except the person's turn now.
- **Don't** write raw hex outside `tokens.css`, except brand-mandated third-party buttons.
- **Don't** animate anything for attention other than the strip's single sheen.
- **Don't** add new global stylesheets; the globals are `index.css`, `tokens.css`, `ui.css`, `shell.css`.
- **Don't** style with Tailwind beyond small layout glue (`flex`, `gap-2`, `flex-wrap`): preflight is off and the world lives in `ui-*`.
- **Don't** put plates in admin tables; admin tables stay plain.
