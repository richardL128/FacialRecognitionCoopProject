# PayEvo Design System

A design system for **PayEvo** (also styled PAYEVO) — a payroll, HR and time‑tracking platform built by **PaymentEvolution**, focused on small‑to‑mid Canadian businesses. The brand promise pulled directly from the marketing surface:

> "Easy, fast and affordable payroll for your team."
>
> "Experience PaymentEvolution payroll software, designed for small businesses. Streamline employee payments and effortlessly manage your payroll taxes in one platform."

## Products under the PayEvo umbrella

The Logos page enumerates the full product family. Each product gets the same **broken‑circle mark** plus a lower‑case wordmark in one of three brand color groups:

| Group | Color | Products |
|---|---|---|
| **Payroll · Business (PE blue)** | `#2285D0` | payroll, workflow, timetracker, hr, payroll8, paycalculator, benefits, epay |
| **Cheques (PE green)** | `#4CAF50` | chequer, paycheque, timetracker, workflow |
| **Partner (PE orange)** | `#F75C03` | evolv, benefits |

The corporate **PAYEVO** wordmark sits above all of them as the umbrella brand.

## What's in this directory

- `README.md` — you are here
- `colors_and_type.css` — design tokens (color, type scale, spacing, radii, shadows)
- `fonts/` — webfonts (Open Sans is loaded from Google Fonts at runtime)
- `assets/logos/` — PayEvo corporate mark + wordmark, product logos as inline SVGs in `ui_kits/workspace/logos.jsx`
- `assets/icons/` — icon usage notes (Lucide is used as a stand-in — see ICONOGRAPHY)
- `assets/illustrations/` — reference list for the Storyset Pana / Rafiki series the brand uses
- `preview/` — small specimen cards rendered into the project's Design System tab
- `ui_kits/workspace/` — the Workspace product UI kit (dashboard, list page, navigation chrome, login)
- `SKILL.md` — Claude Code–compatible skill manifest

## Sources

This system was reconstructed from the **Payroll Library.fig** Figma file (35 pages, 568 frames). Highest-signal pages used:

- `/Cover/PE-Library-Cover` — brand cover, blue→sky gradient palette in motion
- `/Introduction/Introduction` — voice, values, audience
- `/Color/Color` — primary palette, additional UI palette, semantic mapping
- `/Typography/Guidelines` — Open Sans usage rules + marketing example
- `/Logos/PE-Logos` — full product‑logo grid
- `/Buttons/Buttons-Guidelines` — button hierarchy & states
- `/Workspace/*` — application screens (header, navigation, cards, tables)
- `/Inputs/Inputs`, `/Cards/Cards`, `/Navigation-Menu/Components` — component studies

Direct human access to the .fig is not assumed; everything design-relevant has been transcribed below or into `colors_and_type.css`.

---

## Content fundamentals

**Voice** — direct, plainspoken, slightly utilitarian. The Library copy literally calls itself a *"one-stop-shop"* and lists who it's for ("developers, designers, marketers and PMs"). Marketing leans on three‑adjective rhythms: *"Easy, fast and affordable."*

**Audience** — Canadian small-business owners and the PMs/devs/designers building tools for them. Copy assumes the reader is busy and not a payroll specialist.

**Person** — second‑person ("your team", "your payroll taxes"). First‑person plural ("we") for product values.

**Casing** — Sentence case for everything except the **PAYEVO** wordmark (always all‑caps in logos and section headers in the library) and proper nouns. Buttons use **Title Case** ("Add Employee", "Run Payroll").

**Tone words from the values** — *Collaboration · Technical · Scalability · Efficiency*. The values copy is pragmatic, not aspirational; it talks about reducing rework, speccing things correctly, scaling processes.

**Emoji** — none. Not used anywhere in the brand surface.

**Numbers, units, currency** — Canadian: `$1,234.56`, dates as `2/04/2021` (DD/MM/YYYY in the date-input specimens). Use Oxford comma; spell out under ten in body copy; keep numerals in tables, dashboards, and amounts.

**Examples (verbatim)**
- *"Welcome to the PayEvo Library! This [is] your one-stop-shop for style guidelines, components, page layouts and everything else you need to build branded components."*
- *"All of the elements in the library are designed to the correct technical specs - meaning you can move from design to production faster."*
- *"Streamline employee payments and effortlessly manage your payroll taxes in one platform."*
- Button labels seen in the kit: **Button +**, **Cancel**, **Action**, **Yes / No**, **Secondary / Primary**.

---

## Visual foundations

**Color** — anchored by **PE Blue `#2285D0`**. Every section header in the library is a solid blue band with a 50px top‑radius, so blue reads as the **structural** color, not just an accent. Neutrals are a true grey ramp (`#444`, `#7987A9`, `#C4C4C4`, `#E0E0E0`, `#F2F2F2`, `#F9F9F9`) — slightly cool. Semantic green (`#4CAF50`) for success, amber (`#F5B700`) for warning, red (`#F8333C`) for error. A muted slate `#7987A9` is used for "secondary text / non-priority content". Tints (`#EBF6FF`, `#F1FFF2`, `#F4F8FB`) are used as banner / row backgrounds.

**Type** — **Open Sans** is the official font (the typography page literally says so). Used in four weights: Light 300 for big section titles ("Color Guidelines", "Application"), Regular 400 for body, Semibold 600 for component labels, Bold 700 for page titles. There's a tight `-0.02em` letter‑spacing on headings and large body. No serif; no condensed.

**Spacing** — base 5px grid. 1600px content column inside a 1920px page, with 160px gutters. Card stacks use 30px or 50px row‑gap; controls use 10–20px gaps.

**Backgrounds** — flat solid blue `#2285D0` for hero/header bands; flat near‑white (`#F2F2F2` / `#F4F8FB`) for page body. The dashboard hero uses a subtle navy → blue **low‑poly geometric overlay** (`#02314D` → `#2285D0`). No noise, no painterly textures, no full‑bleed photography in‑app.

**Illustrations** — the system relies on the **Storyset "Pana / Rafiki"** illustration sets (`analytics-pana`, `chat-rafiki`, `mail-sent-pana`, etc., 50+ instances on the Workspace page). Friendly, geometric, primary‑palette people-with-stuff scenes. We reference these by name in `assets/illustrations/README.md`; please add the SVGs from storyset.com when shipping.

**Animation** — minimal. Buttons have a "Loading" state that's a **rotating spinner icon** (the Cover page literally renders a broken-circle spinner inside a primary button). No bounces, no springs. Transitions are short fades / color swaps. Hover = small color step toward darker; press = darker still.

**Hover** — primary buttons darken to ~`#1B6BAA`; outline buttons fill light blue `#EBF6FF`; tertiary text turns from blue to darker blue. The Navigation menu shows hover as a "slight underline appears".

**Press / active** — one further step darker (`#165585`). No scale change documented; Buttons-Guidelines specifies "default, hover, active, disabled" as the four states.

**Disabled** — primary buttons fade to a desaturated light blue (`#C4C4C4` neutral or a ~30% blue tint). Disabled text is `#C4C4C4`.

**Borders** — 1px, color `#E0E0E0` for cards, `#C4C4C4` for inputs at rest, `#2285D0` on focus, `#F8333C` on invalid. Outline buttons use 1.5px PE Blue.

**Shadows** — soft and small.
- card: `0 1px 2px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)`
- elevated/hover: `0 4px 12px rgba(0,0,0,0.08)`
- floating (modal/dropdown): `0 8px 24px rgba(0,0,0,0.12)`

**Corner radii** — 5px for buttons, chips, inputs and small cards. **50px** for the giant "section" containers (the page-level hero panels). 50% for avatars and circular icon badges.

**Transparency / blur** — used sparingly. Disabled states drop opacity to ~0.4; modals dim background with `rgba(0,0,0,0.4)`. No backdrop‑filter blur in the library.

**Cards** — white `#FFF`, 5px radius, 1px `#E0E0E0` border OR the soft card shadow above (rarely both). Padding 20px. A "feature card" pattern uses a left-side text block + right-side illustration.

**Layout rules** — fixed top header (64px), fixed left sidebar (~250px expanded / 60px collapsed). Body scrolls; header and sidebar do not. Page gutters are generous on desktop (160px on marketing, 24–32px on app screens).

**Imagery** — illustrations only; no stock photography of people in the in-app surface. Marketing screenshots use the low-poly blue header texture as a hero backdrop.

---

## Iconography

**System used in the source.** PayEvo uses **Font Awesome (Pro)** — the icon page is organized A–Z and named after FA glyphs (`Stopwatch1`, `FolderOpen`, `EllipsisHAlt`, `BallotCheck`, `MoneyBills`, `HandHoldingHeart1`, `CircleDollar`, `UserLarge`, `NetworkWired`, etc.). Both **Light/Outline** (1.5px stroke) and **Solid** weights are present. There's also a "Duo Tone" sheet for marketing illustrations.

**What we ship.** Font Awesome Pro is license-gated, so this design system uses **Lucide** (CDN: `https://unpkg.com/lucide@latest`) as the working substitute — same 1.5–2px stroke language, same neutral geometry, no fills by default. **This is a substitution**; please replace with the FA Pro CDN or self-hosted set when access is available. A short FA → Lucide mapping is documented in `assets/icons/README.md`.

**Color & weight.** Icons inherit `currentColor`. Use 1.5px stroke at 14–18px sizes and 2px at 20px+. In dashboard rows, icons are `#7987A9` at rest, `#2285D0` on hover/active. Inside primary buttons they're white. Status icons mirror the semantic color tokens.

**No emoji. No unicode glyphs as icons.** The chevron, ellipsis, back/forward, plus and check are all real SVGs from the icon set.

**Avatars.** Initials avatars (`Avatar-Initials`) over the slate `#7987A9` color; female/male illustrative avatars exist as a fallback set. People imagery in product screens is illustrative (Storyset), never photographic.

---

## UI kits

- `ui_kits/workspace/` — the Workspace product (dashboard + employee list + login). Open `ui_kits/workspace/index.html`.

## Index of files

```
README.md                 — this file
SKILL.md                  — Claude Code skill manifest
colors_and_type.css       — design tokens
fonts/                    — local font notes (Open Sans loaded from Google Fonts)
assets/logos/             — PayEvo corporate mark, wordmark, product logo data
assets/icons/             — Lucide CDN reference + FA mapping notes
assets/illustrations/     — Storyset reference (names of illustrations used)
preview/                  — design-system specimen cards
ui_kits/workspace/        — Workspace UI kit (dashboard, list, login)
```
