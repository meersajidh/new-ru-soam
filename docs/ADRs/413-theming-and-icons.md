# Theming and icons

**ID:** ADR-413
**Status:** Accepted
**Date:** 2026-05-13
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-104, ADR-401, ADR-411, ADR-412

## Context

VSCode's themes and icons are **data contributions** — pure JSON with no executable code. A theme is a token-value map; an icon contribution is an SVG sprite or icon-font reference. The zero-code property is what makes them safe (no attack surface) and easy to ship (no Bundle Host activation, no IPC discipline).

Ru-soam needs the same model. The workbench has many slots that need consistent visual treatment (Parts per ADR-401, view containers per ADR-402, status bar entries per ADR-409, editor surfaces per ADR-404, bundle iframe contents per ADR-411 via theme-token propagation). A theme is the single source of those tokens. Icons appear in activity-bar items, view headers, status-bar entries, editor tab titles, and inside bundle views via the icon registry.

This ADR commits the theming and icon model: data-only contributions, platform-owned token catalogue, declarative icon registry, theme propagation discipline including to bundle iframes per ADR-411.

## Decision

### Themes are data contributions

A theme is a JSON document mapping platform-owned **theme tokens** to values. No code, no activation, no Bundle Host involvement. A bundle that contributes themes registers them in its manifest:

```json
// illustrative
"contributes": {
  "themes": [
    {
      "id": "ru-soam.theme.calm-dark",
      "label": "Calm Dark",
      "uiKind": "dark",
      "path": "./themes/calm-dark.json"
    }
  ]
}
```

`uiKind` ∈ `light | dark | high-contrast` so the platform can pick a sensible default based on OS preference.

The theme file:

```json
// illustrative
{
  "tokens": {
    "color.background.workbench":   "#1f2226",
    "color.background.editor":      "#1a1c20",
    "color.foreground.default":     "#d6d9dc",
    "color.foreground.muted":       "#8b929b",
    "color.accent.primary":         "#7aa2f7",
    "color.border.subtle":          "#2c3037",
    "color.semantic.warning":       "#e0af68",
    "color.semantic.error":         "#f7768e",
    "font.family.ui":               "system-ui, ...",
    "font.size.body":               "13px",
    "radius.surface.medium":        "6px",
    "shadow.elevation.medium":      "0 1px 2px ..."
  }
}
```

Tokens are namespaced and typed by convention. Their **catalogue is platform-owned** (Open Item O107). A theme that omits a token falls back to the platform's default theme value; a theme that introduces an unknown token name is silently ignored (forward compatibility).

### Token catalogue is platform-owned

The platform commits to a **theme token catalogue** — a typed, versioned list of token names, their kinds (color, length, font, radius, shadow, duration), and their intended use. The catalogue is documented alongside ADR-413's reference materials (planned).

Bundles do not extend the token catalogue with their own tokens. A bundle that wants a custom colour for a non-platform surface uses platform tokens and inherits the user's theme.

This discipline keeps themes portable: a theme written today renders correctly against a workbench with bundles installed later, because every bundle uses the same tokens.

### Theme propagation

The platform applies the active theme by writing token values as CSS variables on the workbench shell's root document:

```css
:root {
  --color-background-workbench: #1f2226;
  --color-foreground-default:   #d6d9dc;
  /* ... */
}
```

Workbench code, bundle iframe contents, and embedded view assets all read the variables through a small platform-provided utility (`token('color.background.workbench')` → `var(--color-background-workbench)`) or directly via CSS.

Per ADR-411, **bundle iframes** receive the active theme tokens via the view bridge (`window.soamView.theme` and `events.onThemeChange`). The bridge sets the same CSS variables on the iframe's document root. A bundle view that uses the variables stays in sync across theme changes automatically; a bundle view that hardcodes colours opts out at its own cost.

### Theme switching

The user changes themes via the Settings surface (per ADR-405 core shell). On change:

- The platform updates the CSS variables on the shell document.
- It pushes the new token snapshot to every active bundle iframe via the bridge.
- It emits an `onThemeChange` event through the ThemeService (ADR-412).
- It persists the choice to user configuration (per ADR-403 workspace settings cascade — Open Item O55 governs the cloud-mirror policy).

No reload is required for a theme switch.

### Default themes

The platform ships at least:

- **Default Light** (light UI)
- **Default Dark** (dark UI)
- **High Contrast Light** (accessibility)
- **High Contrast Dark** (accessibility)

These are the platform's defaults. Third-party theme bundles can ship as many additional themes as they want.

Accessibility themes are not optional. They meet WCAG AA contrast minimums and have explicit high-contrast borders. Their inclusion is committed; the exact contrast budget is Open Item O109.

### Icons

Icons are a separate data contribution.

**Built-in icon set.** The platform ships a default icon set under a stable namespace (e.g., `$(workbench-*)` for shell icons, `$(record-*)` for record-kind icons). Icons are SVGs served from the workbench bundle.

**Icon contribution.** A bundle (or icon-pack bundle) contributes additional icons:

```json
// illustrative
"contributes": {
  "icons": [
    { "id": "$(audit-shield)", "path": "./icons/audit-shield.svg", "theme": "any" }
  ]
}
```

Each icon entry declares an id (the `$(...)` token used in `text` fields across ADRs 405 / 408 / 409), a path to the SVG, and an optional `theme` flag indicating whether the icon is theme-independent, light-only, or dark-only (for icons that need different versions per uiKind).

**Icon font / sprite.** The platform decides at engineering time whether icons render as inline SVG, SVG sprite, or icon font (Open Item O108). The contribution shape stays the same; the rendering machinery is a private detail.

**Icon theme bundle.** A bundle may contribute a full **icon theme** that overrides the platform's default icons across the entire workbench (analogous to a VSCode icon theme). Users can switch icon themes independently of colour themes.

### Reserved icon prefixes

Icon ids namespaced:

- `$(workbench-*)` — platform shell icons; bundles may not contribute under this prefix.
- `$(record-*)`, `$(consent-*)`, `$(kek-*)`, etc. — platform domain icons; bundles may not contribute under these.
- `$(<bundleId>-*)` — bundle-owned icons; bundles must use their own prefix.

Collision rejection at manifest registration.

### Themes and icons are not active bundles

Theme and icon contributions do not require their containing bundle to **activate**. They are read from the manifest at boot, and the assets are served by Main's protocol handler when referenced. The bundle's `activate(...)` hook (ADR-105) is not invoked for theme/icon-only operations. A pure theme-and-icon bundle has no Bundle Host process footprint.

This is the property that makes themes safe: even a hostile theme bundle author cannot ship code that runs in the workbench. The bundle is data, not behaviour.

### What this ADR does not commit

- The exact theme token catalogue. Open Item O107; lands as a reference doc when the catalogue stabilises.
- The icon rendering mechanism (inline SVG / sprite / font). O108.
- The contrast budget per uiKind. O109.

## Consequences

### Positive

- Themes and icons are pure data — zero attack surface, zero activation cost, zero IPC.
- Tokenised theming makes the whole workbench (including bundle iframes) consistent under a single source of truth.
- Bundle view consistency is free for bundles that use tokens; hardcoding is allowed but discouraged.
- Accessibility themes are committed defaults, not optional add-ons.
- Theme switching is live; no reload.

### Negative

- The token catalogue must be maintained. Adding a token is a non-breaking change; renaming or removing one breaks downstream themes. Discipline needed.
- A token-only model can be limiting for elaborate visual designs. The platform's escape hatch is "use CSS classes that combine multiple tokens"; an arbitrary custom rule on a bundle's surface still needs justification.
- Icon contribution surface depends on the rendering mechanism choice (O108). Bundle authors can't ship icons until that lands.

### Neutral

- Familiar pattern from VSCode and most plugin-host editors. Bundle authors transfer their muscle memory.

## Considered Options

- **Themes as code (theme bundles contribute a `getColor()` function)** — _Rejected_: introduces executable code into the theming path; defeats the zero-attack-surface property; activates the Bundle Host for a non-behavioural concern.
- **No themes; one hardcoded look** — _Rejected_: accessibility (high-contrast) and user preference need first-class support.
- **Themes as JSON data contributions, icons as data contributions, tokens platform-owned and propagated to iframes** _(chosen)_ — Matches VSCode discipline; preserves bundle iframe consistency; keeps theming a no-code surface.

## Open Items

- **O107** — Theme token catalogue (full list, types, intended use). Lands as a reference doc; updated as new platform surfaces appear.
- **O108** — Icon rendering mechanism: inline SVG vs sprite vs font. Affects bundle-author asset format and bundle size.
- **O109** — Accessibility-theme contrast budget. WCAG AA minimum is starting point; per-surface tuning.
- **O110** — Theme + iframe propagation cost. When many iframes are active and the user switches themes, theme push to all iframes happens in parallel; verify no perceptible flicker.

---

## Amendment 1 — Built-in icon set = VS Code Codicons; O108 resolved (icon font for the shell, inline SVG for iframes); `$(…)` registry seam committed

**Date:** 2026-06-01
**Status:** Accepted
**Amends:** the *Icons* + *Reserved icon prefixes* sections above; **resolves O108**.

### Why

The base ADR committed the icon **contribution model** (`$(…)` token ids, platform-owned namespaces, bundle-contributed SVGs, switchable icon themes) but deliberately deferred the **rendering mechanism** (O108) and never named the platform's built-in set. As built, the shell drifted from the design: icons are consumed two ways, neither matching the `$(…)` registry —

1. **Direct component imports** — ~16 renderer files `import { PanelLeft, Check, … } from 'lucide-react'` and render `<PanelLeft/>` inline.
2. **String→component map** — `ActivityBar.tsx`'s `ICON_MAP` resolves *manifest-contributed* icon names (`icon: "users"`, `"file-text"`) to lucide components. These lucide names are a de-facto contribution contract (first-party `ru-soam-practice` manifest references them).

The product direction is to adopt the **VS Code Codicon set** (`https://microsoft.github.io/vscode-codicons/`) everywhere, for visual parity with the VS Code-style shell. That decision forces O108 and the registry seam at the same time.

### Decision

1. **Built-in icon set = Codicons.** The platform's shipped icon set is `@vscode/codicons` (the same set VS Code uses). It replaces `lucide-react` as the shell's icon source. `lucide-react` is removed once migration completes.

2. **O108 resolved — split by surface:**
   - **Workbench shell (renderer/React):** Codicons render as an **icon font** (`codicon.ttf` + the generated CSS), bundled as a **local asset** (no CDN — ADR-203). A single `<Icon name="…" />` React component wraps the `<i class="codicon codicon-…">` mechanism; call sites never touch class names or the font directly.
   - **Bundle iframes (sandboxed `view://` HTML, ADR-411):** Codicons render as **inline SVG** (from the codicon SVG sources), *not* the font. This sidesteps the documented "sandboxed iframe fonts need `font-src view:` in the page's own `<meta>` CSP + font served over `view://`" gotcha for the icon set specifically, and keeps each iframe self-contained. (If a future surface needs the font in-iframe, hosting it over `view://` with the `font-src` meta fix is the fallback — but inline SVG is the committed default.)
   - Bundle-**contributed** icons (`contributes.icons`, `$(<bundleId>-*)`) remain **SVG** per the base ADR — unchanged.

3. **`$(…)` registry seam is the only icon API.** All direct `lucide-react` imports and the ad-hoc `ICON_MAP` are replaced by one platform icon module that resolves a stable id → codicon. The id vocabulary is the codicon name namespaced per the base ADR's reserved prefixes:
   - `$(workbench-*)` shell icons map to specific codicons (e.g. `$(workbench-panel-left)` → `layout-sidebar-left`).
   - Manifest `icon` fields switch from lucide names to **codicon ids** — a contribution-contract change. First-party bundles (`ru-soam-practice`: `users`→`organization`/`account`, `file-text`→`note`, etc.) are migrated in lockstep; this is a breaking change for any external bundle, acceptable pre-1.0.
   - Collision-rejection on reserved prefixes at manifest registration stays as the base ADR specifies (still pending real enforcement — O427/O86).

4. **Icon themes (base ADR) unaffected.** A bundle can still ship a full icon theme overriding the built-in codicon mapping; the seam resolves through the active icon theme first, then the built-in codicon default.

### Consequences

- **Positive:** Visual parity with VS Code; one icon API (`<Icon>`); the `$(…)` model ADR-413 always intended finally exists; zero CDN/attack surface (local font + inline SVG); iframes stay self-contained.
- **Negative:** Cross-cutting migration touching every icon call site + the manifest vocab + iframe views. Codicon names ≠ lucide names → a manual mapping table is required (one-time). The font (~`codicon.ttf`) adds a small fixed asset.
- **Neutral:** Two render paths (font in shell, inline SVG in iframes) — justified by the iframe CSP boundary; both resolve from the same id table.

### Migration (phased — Open Items)

- **O434** — Icon-registry seam: add the platform `<Icon name>` component + id→codicon table; wire the codicon font (local `@font-face`) into the shell; migrate the ~16 direct `lucide-react` call sites + `ActivityBar.ICON_MAP` onto it; keep lucide as a temporary fallback until call sites are clear, then remove the dep.
- **O435** — Contributed-icon vocab migration: switch first-party manifest `icon` fields (lucide names → codicon ids) + the iframe views (`roster.html` etc.) to inline-SVG codicons; document the reserved-prefix → codicon mapping. Couples with O427/O86 (prefix-collision lint).
- **O108** — **Resolved by this amendment** (font for shell, inline SVG for iframes).
