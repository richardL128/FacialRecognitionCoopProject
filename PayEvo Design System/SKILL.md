# Skill: Designing with PayEvo

This project is the PayEvo design system. When using it for new design work:

## 1. Always include the design tokens
Link `colors_and_type.css` from any new HTML you create. It exposes CSS variables for the full palette, type stack, radii, shadows and spacing scale.

```html
<link rel="stylesheet" href="../colors_and_type.css"/>
```

## 2. Use Open Sans, weights 300/400/600/700
- Numbers and large display headlines: **300 Light** with `letter-spacing: -0.02em`
- Body, table cells, button labels: **400 Regular** / **600 Semibold**
- Branded titles in the hero band: **700 Bold**

Do not introduce new fonts.

## 3. Color rules (hard)
- **PE Blue (`#2285D0`)** is the only primary action color. Outline buttons and links also use it.
- **PE Green (`#4CAF50`)** signals success/active state — never as a CTA color in the Workspace product.
- The hero header band on every screen is the navy → PE Blue gradient (`#02314D` → `#2285D0`) with subtle low-poly geometry overlays. Reuse `<HeroBand>` from `ui_kits/workspace/Chrome.jsx`.
- Surfaces sit on the `#F4F8FB` page background; cards are `#FFFFFF` with `#E0E0E0` borders and the soft card shadow.
- Body text is `#444` (Ink). Secondary text is `#70808F`. Muted/labels are `#7987A9` (Slate).

## 4. Reuse the Workspace components
Before composing anything new, import the kit's React components:

```html
<script type="text/babel" src="ui_kits/workspace/Chrome.jsx"></script>
<script type="text/babel" src="ui_kits/workspace/Screens.jsx"></script>
```

You get: `TopHeader`, `Sidebar`, `Btn` (primary/secondary/tertiary/danger), `Badge` (semantic pills), `HeroBand`, `StatCard`, `PELogo`, `PEWordmark`, `Icon` (Lucide wrapper).

## 5. Iconography
Use Lucide via the CDN (`https://unpkg.com/lucide@latest`). Inherit `currentColor`. See `assets/icons/README.md` for the FA-Pro → Lucide mapping. **When the user has a Font Awesome Pro license, swap Lucide out** — the names in the mapping are 1:1.

## 6. Imagery
Storyset Pana/Rafiki illustrations, recolored to the PE blue palette. List of names in `assets/illustrations/README.md`. If unavailable, leave a sized rectangle placeholder labeled with the storyset name — don't draw alternatives in SVG.

## 7. Layout
- Page gutter: 24–32px outside cards, 14px between cards in a grid row
- Card padding: 18–20px
- Radii: 5px default, 10px on outer hero/marketing surfaces, 50px on the splash band tiles, 999px on pills
- Shadow: the "card" preset only on raised surfaces. Hero band has no shadow.

## 8. Workspace shell
For any screen mockup, wrap in:
```jsx
<div className="app-shell">
  <TopHeader/>
  <div className="app-body">
    <Sidebar active="home" onNav={…}/>
    <main className="app-main">{/* your screen */}</main>
  </div>
</div>
```
And tag the shell with `data-screen-label="<name>"` for comment context.

## 9. Tone
PayEvo is Canadian payroll software for SMBs. Voice is plain, practical, lightly warm. Never enterprise-formal, never jokey. Reference CRA, T4, ROE, CPP/EI, direct deposit — these are the real domain nouns.

## 10. What lives where
- `colors_and_type.css` — design tokens
- `assets/` — fonts, icon mapping, illustration list
- `preview/` — single-purpose review cards (one component each, in the asset review pane)
- `ui_kits/workspace/` — full interactive kit (open `index.html`)
