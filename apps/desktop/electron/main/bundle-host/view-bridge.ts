/**
 * In-iframe bridge served at `view://_platform_/bridge.js` and auto-injected
 * into every bundle view HTML by `view-protocol.ts`. Exposes
 * `window.soamView` per ADR-411 (trimmed Phase 7 surface):
 *   - bindCapability(name, version) — postMessage relay → renderer → Main
 *   - events.onActivate / onDeactivate
 *   - theme (CSS variable snapshot, applied to documentElement)
 *   - requestClose / requestFocus
 *
 * The bundle's iframe code is third-party-trust (ADR-411 §Trust zone). The
 * bridge runs in the same context and cannot reach `window.soam`, the
 * ServiceRegistry, or `require('electron')` — all gated by the iframe origin
 * (`view://<bundleId>`), the sandbox attribute, and Electron's webPreferences.
 */
export const VIEW_BRIDGE_SOURCE = `(function () {
  'use strict';
  if (window.soamView) return;

  var nextId = 1;
  var pending = new Map();
  var activateHandlers = new Set();
  var deactivateHandlers = new Set();
  var themeSnapshot = {};
  var resolvedReady;
  var ready = new Promise(function (r) { resolvedReady = r; });

  function send(msg) {
    try { window.parent.postMessage(msg, '*'); }
    catch (e) { console.error('[soamView] postMessage failed:', e); }
  }

  function applyTheme(vars) {
    var root = document.documentElement;
    for (var k in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, k)) {
        root.style.setProperty(k, vars[k]);
      }
    }
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || typeof m !== 'object' || m.__soamView !== true) return;
    switch (m.kind) {
      case 'init':
        themeSnapshot = m.theme || {};
        applyTheme(themeSnapshot);
        resolvedReady();
        break;
      case 'activate':
        activateHandlers.forEach(function (h) { try { h(); } catch (err) { console.error(err); } });
        break;
      case 'deactivate':
        deactivateHandlers.forEach(function (h) { try { h(); } catch (err) { console.error(err); } });
        break;
      case 'theme':
        themeSnapshot = m.theme || {};
        applyTheme(themeSnapshot);
        break;
      case 'cap.response': {
        var entry = pending.get(m.requestId);
        if (!entry) return;
        pending.delete(m.requestId);
        if (m.ok) entry.resolve(m.data);
        else {
          var err = new Error('[' + m.error.code + '] ' + m.error.message);
          err.code = m.error.code;
          entry.reject(err);
        }
        break;
      }
    }
  });

  function bindCapability(name, version) {
    return ready.then(function () {
      var disposed = false;
      return {
        call: function (method) {
          if (disposed) return Promise.reject(new Error('Capability proxy disposed: ' + name + '@' + version));
          var args = Array.prototype.slice.call(arguments, 1);
          var id = nextId++;
          return new Promise(function (resolve, reject) {
            pending.set(id, { resolve: resolve, reject: reject });
            send({ __soamView: true, kind: 'cap.call', requestId: id, capability: name, version: version, method: method, args: args });
          });
        },
        dispose: function () { disposed = true; }
      };
    });
  }

  window.soamView = Object.freeze({
    bindCapability: bindCapability,
    events: Object.freeze({
      onActivate: function (h) {
        activateHandlers.add(h);
        return { dispose: function () { activateHandlers.delete(h); } };
      },
      onDeactivate: function (h) {
        deactivateHandlers.add(h);
        return { dispose: function () { deactivateHandlers.delete(h); } };
      }
    }),
    get theme() { var snap = {}; for (var k in themeSnapshot) snap[k] = themeSnapshot[k]; return snap; },
    requestClose: function () { send({ __soamView: true, kind: 'request.close' }); },
    requestFocus: function () { send({ __soamView: true, kind: 'request.focus' }); },
    ready: ready
  });

  send({ __soamView: true, kind: 'view.ready' });
})();
`;
