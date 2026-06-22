/**
 * Platform-owned shared bootstrap for bundle views, auto-injected inline into
 * every view by view-protocol.ts (same seam as the bridge/codicons/fonts —
 * sandboxed opaque-origin iframes can't share an `import`, so common helpers
 * are injected as a global instead of re-rolled per file).
 *
 * Exposes `window.__viewBoot` with the helpers every view otherwise duplicates:
 *   awaitBridge()          -> Promise<soamView> (polls window.soamView)
 *   isLockedError(err)     -> bool (cap.locked detection)
 *   isNotFoundError(err)   -> bool (cap.not_found detection)
 *   parseQuery(search)     -> { key: value } (decoded location.search params)
 *   applyTheme(d)          -> bool (apply an init/theme postMessage's CSS vars; true if handled)
 *   applyCodicons(root?)   -> void (hydrate [data-codicon] via window.codicon)
 *
 * Injected AFTER the codicons script so window.codicon exists; runs in <head>
 * before any view's body script, so window.__viewBoot is ready at view IIFE time.
 * Source is verified free of any script-closing sequence (no escaping needed).
 */
export const VIEW_BOOTSTRAP_SOURCE = `(function () {
  'use strict';

  function awaitBridge() {
    return new Promise(function (resolve) {
      if (window.soamView) return resolve(window.soamView);
      var iv = setInterval(function () {
        if (window.soamView) {
          clearInterval(iv);
          resolve(window.soamView);
        }
      }, 25);
    });
  }

  function hasCode(err, code) {
    return !!(err && (err.code === code ||
      (err.message && err.message.indexOf(code) !== -1)));
  }
  function isLockedError(err) { return hasCode(err, 'cap.locked'); }
  function isNotFoundError(err) { return hasCode(err, 'cap.not_found'); }

  function parseQuery(search) {
    var q = (search || '').replace(/^\\?/, '');
    var params = {};
    q.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      var k = decodeURIComponent(pair.slice(0, idx));
      var v = decodeURIComponent(pair.slice(idx + 1));
      params[k] = v;
    });
    return params;
  }

  // Apply the theme CSS vars carried by an init/theme bridge message. Returns
  // true when the message was a theme-bearing one (caller may still handle
  // other kinds like 'context'). No-op for unrelated messages.
  function applyTheme(d) {
    if (!d || d.__soamView !== true) return false;
    if ((d.kind === 'init' || d.kind === 'theme') && d.theme) {
      var root = document.documentElement;
      Object.keys(d.theme).forEach(function (k) {
        root.style.setProperty(k, d.theme[k]);
      });
      // Apply --ui-scale as CSS zoom so px-sized bundle views scale uniformly.
      var uiScale = d.theme['--ui-scale'];
      if (uiScale && uiScale !== '') {
        root.style.zoom = uiScale;
      }
      return true;
    }
    return false;
  }

  function applyCodicons(root) {
    var els = (root || document).querySelectorAll('[data-codicon]');
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      var name = e.getAttribute('data-codicon');
      var size = parseInt(e.getAttribute('data-size') || '13', 10);
      if (window.codicon) {
        e.innerHTML = window.codicon(name, size);
      }
    }
  }

  window.__viewBoot = {
    awaitBridge: awaitBridge,
    isLockedError: isLockedError,
    isNotFoundError: isNotFoundError,
    parseQuery: parseQuery,
    applyTheme: applyTheme,
    applyCodicons: applyCodicons,
  };
})();
`;
