/**
 * Icon registry — single semantic-id → codicon-glyph mapping table.
 *
 * This is the ONE place to touch when swapping icon libraries.
 * Future: an icon-theme override layer will intercept resolveIconGlyph here
 * (per ADR-413 Amendment 1) — add that seam here, not at call sites.
 *
 * Authoritative glyph source: node_modules/@vscode/codicons/dist/codicon.css
 * Every entry has been validated against `.codicon-<name>:before` rules.
 */

/** Semantic icon ids used throughout the shell. */
export type SemanticIconId = string;

/**
 * Codicon glyph name (the part after `codicon-`).
 * Validated present in @vscode/codicons@0.0.45.
 */
type CodiconGlyph = string;

// Substitution notes (for review):
//   hash        → tag                  (no hash/number-sign glyph in codicons; tag is the nearest visual substitute)
//   stethoscope → pulse                (no stethoscope in codicons; pulse is the medical-monitor nearest)
//   theme-light → circle-large-outline (distinct open-circle glyph for light mode)
//   theme-dark  → circle-large-filled  (distinct filled-circle glyph for dark mode)
//   dot         → circle-filled        (dot glyph maps to circle-filled; visually equivalent small filled circle)
//   circle-dot  → circle-filled        (circle-dot maps to circle-filled as closest match)
//   shield-check→ verified-filled      (no shield-check; verified-filled = shield + check mark composite)

const REGISTRY: Record<SemanticIconId, CodiconGlyph> = {
  // Navigation
  'arrow-left': 'arrow-left',
  'arrow-right': 'arrow-right',
  'search': 'search',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  'chevron-right': 'chevron-right',
  'chevron-left': 'chevron-left',

  // Panel layout toggles
  'panel-left': 'layout-sidebar-left',
  'panel-bottom': 'layout-panel',
  'panel-right': 'layout-sidebar-right',

  // Window chrome
  'window-minimize': 'chrome-minimize',
  'window-maximize': 'chrome-maximize',
  'window-close': 'chrome-close',

  // Common actions
  'check': 'check',
  'close': 'close',
  'copy': 'copy',

  // Visibility
  'eye': 'eye',
  'eye-off': 'eye-closed',

  // Security / auth
  'lock': 'lock',
  'unlock': 'unlock',
  'key': 'key',
  'sign-out': 'sign-out',
  'shield': 'shield',
  'shield-check': 'verified-filled',

  // UI chrome
  'help': 'question',
  'settings': 'settings-gear',
  'trash': 'trash',
  'newline': 'newline',
  'bell': 'bell',
  'bell-dot': 'bell-dot',

  // Theme (distinct glyphs: outline = light, filled = dark)
  'theme-light': 'circle-large-outline',
  'theme-dark': 'circle-large-filled',

  // Status / severity
  'error': 'error',
  'warning': 'warning',
  'info': 'info',
  'pass': 'pass-filled',

  // Telemetry mode indicators
  'telemetry-off': 'eye-closed',        // off — clearly "nothing being observed"
  'telemetry-online-only': 'pulse',     // online-only — activity when connected
  'telemetry-on': 'broadcast',          // on — active transmission

  // Cloud
  'cloud': 'cloud',
  'cloud-download': 'cloud-download',
  'cloud-disconnected': 'debug-disconnect', // dead cloud session — plug pulled

  // Data / workspace
  'briefcase': 'briefcase',
  'hash': 'tag',
  'dot': 'circle-filled',
  'circle-dot': 'circle-filled',

  // Radio / toggle glyphs (menu system)
  'circle-large-outline': 'circle-large-outline',
  'circle-large-filled': 'circle-large-filled',
  'circle-filled': 'circle-filled',

  // ActivityBar manifest vocabulary (stable contract — O435 controls bundle icons)
  'users': 'organization',
  'calendar': 'calendar',
  'clockface': 'clockface',
  'clipboard-list': 'checklist',
  'book-open': 'book',
  'check-square': 'checklist',
  'layout-grid': 'layout',
  'files': 'files',
  'file-text': 'note',
  'activity': 'pulse',
  'stethoscope': 'pulse',
  'bar-chart-2': 'graph',
  'folder': 'folder',
  'home': 'home',
};

const FALLBACK_GLYPH: CodiconGlyph = 'question';

/**
 * Resolve a semantic icon id to a codicon glyph name.
 * Unknown ids fall back to `question` so UI never breaks silently.
 *
 * Icon-theme override seam: insert theme-specific overrides here in a future
 * ADR-413 Amendment 1 implementation before the fallback lookup.
 */
export function resolveIconGlyph(name: SemanticIconId): CodiconGlyph {
  return REGISTRY[name] ?? FALLBACK_GLYPH;
}
