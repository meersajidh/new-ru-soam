/**
 * Maturity-marking system for bundle views (Phase 0 of practice-build-plan.md).
 *
 * Exports:
 *   VIEW_MATURITY_CSS   — injected as <style> into every bundle view HTML
 *   VIEW_MATURITY_SOURCE — injected as <script>; provides window.hydrateMaturity()
 *
 * Single source of truth: the MATURITY registry maps element id → state.
 * Views carry data-maturity-id="<id>" on card/aspect roots; the helper
 * sets data-maturity="concrete|wip|mock" and appends pills + tooltips.
 *
 * The body.maturity-highlight class intensifies all marks for a build-scan.
 * BundleViewIframe pushes maturityHighlight:true|false via the theme/init
 * message; view-bridge.ts applies it to document.body.
 *
 * Colors: palette token vars (--color-warning, --color-fg-muted, --color-border)
 * fall through from the theme snapshot — safe for both light and dark themes.
 * Fallback literals work standalone (dark defaults, same hues as the dark theme).
 */

// ── CSS ────────────────────────────────────────────────────────────────────────
// Uses only CSS custom properties already present in the iframe via the theme
// snapshot (--color-warning, --color-fg-muted, --color-border) or self-contained
// fallbacks. No @theme{} tokens — those are tree-shaken and absent in iframes.
export const VIEW_MATURITY_CSS = `
/* ── Maturity marks (Phase 0 — practice-build-plan.md) ──────────────── */

/* ── Base pill ────────────────────────────────────────────────────────── */
.maturity-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
  vertical-align: middle;
  margin-left: 6px;
  line-height: 1.5;
  pointer-events: none;
  flex-shrink: 0;
}

/* ── Mock: dashed muted border + faint tint ──────────────────────────── */
[data-maturity="mock"] {
  outline: 1.5px dashed var(--color-fg-muted, #636366);
  outline-offset: 2px;
  position: relative;
}
.maturity-pill--mock {
  background: color-mix(in srgb, var(--color-fg-muted, #636366) 14%, transparent);
  color: var(--color-fg-muted, #636366);
  border: 1px solid color-mix(in srgb, var(--color-fg-muted, #636366) 30%, transparent);
}

/* ── WIP: dotted amber border ────────────────────────────────────────── */
[data-maturity="wip"] {
  outline: 1.5px dotted var(--color-warning, #f4a623);
  outline-offset: 2px;
  position: relative;
}
.maturity-pill--wip {
  background: color-mix(in srgb, var(--color-warning, #f4a623) 14%, transparent);
  color: var(--color-warning, #f4a623);
  border: 1px solid color-mix(in srgb, var(--color-warning, #f4a623) 35%, transparent);
}

/* ── Concrete: no visible border (subtle dot only via pill-less) ─────── */
[data-maturity="concrete"] {
  /* no border — live data, no noise */
}

/* ── body.maturity-highlight — intensified for build-scan ────────────── */
body.maturity-highlight [data-maturity="mock"] {
  outline-width: 2px;
  outline-color: var(--color-fg-muted, #636366);
  background: color-mix(in srgb, var(--color-fg-muted, #636366) 6%, transparent) !important;
}
body.maturity-highlight [data-maturity="wip"] {
  outline-width: 2px;
  outline-color: var(--color-warning, #f4a623);
  background: color-mix(in srgb, var(--color-warning, #f4a623) 8%, transparent) !important;
}
body.maturity-highlight [data-maturity="concrete"] {
  outline: 1.5px solid var(--color-accent, #5ac85a);
  outline-offset: 2px;
}
body.maturity-highlight .maturity-pill {
  opacity: 1;
}
`;

// ── JS helper ─────────────────────────────────────────────────────────────────
// Must be </script>-free (CSP safety contract; see view-protocol.ts comment).
export const VIEW_MATURITY_SOURCE = `(function () {
  'use strict';

  /**
   * Single source of truth — element id → maturity state.
   *
   * States:
   *   'concrete' — real owned data, real read/write via bindQuery/bindCommand
   *   'wip'      — Practice-owned but static / incomplete (built structure, no live data yet)
   *   'mock'     — projection from an unbuilt Activity (pure placeholder)
   *
   * Phase 0 registry (flip one entry here when ownership changes).
   *
   * -- overview.html --
   *   card-next-session    : Schedule projection → mock
   *   card-last-note       : Sessions projection → mock
   *   card-scores          : Assessments projection → mock
   *   card-goals           : Planner projection → mock
   *   card-payment         : Billing projection → mock
   *   card-circle          : Practice owned, static mock data → wip (People/Circle not yet real)
   *   overview-header      : real record.patient data (get + getProfile) → concrete
   *   risk-banner          : real conditional banner (P4) → concrete
   *   glance-row           : projection mini-stats (Schedule+Sessions+Assessments+Billing) → mock
   *   timeline-wrap        : fully static MOCK.timeline → mock
   *
   * -- roster.html --
   *   roster-list          : real bindQuery record.patient.query → concrete
   *   lens-intake-panel    : real lifecycle stage (ADR-505 Am3, setStatus O433) → concrete
   *   lens-agenda-panel    : Schedule projection → mock
   *   lens-attention-panel : lifecycle model (not yet built) → wip
   *
   * -- aspects.html --
   *   section-risk         : real Risk/Safety aspect (P4) → concrete
   *   section-profile      : real getProfile + edit via updateProfile → concrete (Phase 1)
   *
   * -- safety-plan.html --
   *   safety-plan-editor   : real getSafetyPlan + setSafetyPlan (P4) → concrete
   *
   * -- projections.html (Notes view) --
   *   notes-view           : MOCK_NOTES, no real Sessions cap → mock
   */
  var MATURITY = {
    /* overview */
    'card-next-session':   'mock',
    'card-last-note':      'mock',
    'card-scores':         'mock',
    'card-goals':          'mock',
    'card-payment':        'mock',
    'card-circle':         'wip',
    'overview-header':     'concrete',
    'risk-banner':         'concrete',
    'glance-row':          'mock',
    'timeline-wrap':       'mock',
    /* roster */
    'roster-list':         'concrete',
    'lens-intake-panel':   'concrete',
    'lens-agenda-panel':   'mock',
    'lens-attention-panel':'wip',
    /* aspects */
    'section-risk':        'concrete',
    /* safety-plan */
    'safety-plan-editor':  'concrete',
    'section-profile':     'concrete',
    /* projections */
    'notes-view':          'mock',
  };

  var TOOLTIPS = {
    'mock':     'Mock — placeholder; owner Activity not built yet',
    'wip':      'WIP — wired but incomplete (fields or real data missing)',
    'concrete': 'Concrete — live data, real read/write',
  };

  var PILL_LABELS = { 'mock': 'Mock', 'wip': 'WIP', 'concrete': '' };

  /**
   * Walk [data-maturity-id] elements under root, set data-maturity attr,
   * append pill (mock/wip only), set title tooltip.
   * Idempotent: re-call after dynamic render.
   * @param {Document|Element} [root]
   */
  window.hydrateMaturity = function hydrateMaturity(root) {
    var r = root || document;
    var els = r.querySelectorAll('[data-maturity-id]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var id = el.getAttribute('data-maturity-id');
      var state = MATURITY[id];
      if (!state) continue;

      el.setAttribute('data-maturity', state);
      el.title = TOOLTIPS[state] || '';

      /* remove any existing pill first (idempotency) */
      var existing = el.querySelector('.maturity-pill[data-maturity-pill]');
      if (existing) existing.parentNode.removeChild(existing);

      var label = PILL_LABELS[state];
      if (label) {
        /* find a header/title element to append pill to; fallback to el itself */
        var target = el.querySelector(
          '.ov-card-head, .ov-card-title, .section-header, .section-title, ' +
          '.header-bar, .header-title, .id-text, .lens-panel > p'
        );
        if (!target) target = el;
        var pill = document.createElement('span');
        pill.className = 'maturity-pill maturity-pill--' + state;
        pill.setAttribute('data-maturity-pill', '1');
        pill.setAttribute('aria-label', label + ' build state');
        pill.textContent = label;
        target.appendChild(pill);
      }
    }
  };

  /* Auto-hydrate static markup on DOMContentLoaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.hydrateMaturity();
    });
  } else {
    window.hydrateMaturity();
  }
})();
`;
