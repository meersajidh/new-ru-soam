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
  var storeChangeHandlers = new Set();
  // Track activation state so an onActivate handler registered AFTER the
  // 'activate' message arrives still fires (the relay sends activate as soon as
  // the iframe posts view.ready; a view whose script registers its handler
  // later — e.g. delayed by another head script — would otherwise miss it).
  var isActive = false;
  var themeSnapshot = {};
  var resolvedReady;
  var ready = new Promise(function (r) { resolvedReady = r; });
  // Buffer the latest 'context' message and replay it once the DOM is parsed.
  // The bridge listener is injected right after <head>, so it reliably catches
  // the parent's handshake 'context'. A view's OWN message listener is in its
  // body script, which the HTML parser may not have reached yet — for large view
  // documents the parser can yield between the head bridge and the body script,
  // so the handshake 'context' is dispatched and dropped before the view listens.
  // 'context' is replayed on DOMContentLoaded (when the body script, and thus the
  // view's listener, is guaranteed registered) so every view receives it. Mirrors
  // the 'activate' replay (isActive) — without this, single-record views silently
  // never receive their entity id because no second 'context' push ever follows.
  var lastContextMsg = null;
  var contextReplayScheduled = false;
  // Buffer the 'init' message so React views can read channel values (e.g.
  // scheduleViewState, scheduleCounts) that the parent injects on init. Unlike
  // 'context', 'init' fires exactly once and is NOT replayed on DOMContentLoaded
  // — ViewRoot reads it via initPayload() on mount, after awaitBridge() resolves.
  var lastInitMsg = null;
  function replayContext() {
    if (lastContextMsg) window.dispatchEvent(new MessageEvent('message', { data: lastContextMsg }));
  }
  // Same replay machinery for 'focusAspect' (O465 deep-link). The renderer posts
  // focusAspect right after view.ready, but a large view's own message listener
  // (in its body script) may not be registered yet — so the message is dropped,
  // exactly like the handshake 'context' was. Buffer + replay on DOMContentLoaded.
  var lastFocusMsg = null;
  var focusReplayScheduled = false;
  function replayFocus() {
    if (lastFocusMsg) window.dispatchEvent(new MessageEvent('message', { data: lastFocusMsg }));
  }

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
    // Apply --ui-scale as CSS zoom so bundle views scale with the appearance
    // text-size pref. This is the always-run theme path (init + live 'theme'
    // messages) for every view incl. React views whose ViewRoot delegates theme
    // to this bridge — so the zoom must live here, not only in __viewBoot.applyTheme
    // (which React views never call). Mirrors that helper's zoom logic.
    var uiScale = vars['--ui-scale'];
    if (uiScale && uiScale !== '') {
      root.style.zoom = uiScale;
    }
  }

  // Apply the maturity-highlight body class safely. The 'init'/'theme' message
  // can arrive while the parser is still in <head> (before <body> exists),
  // especially as the injected head grows — guard document.body so a null
  // deref never aborts the handler (which would skip resolvedReady() and hang
  // awaitBridge()). Defer to DOMContentLoaded when body isn't ready yet.
  function setMaturityHighlight(on) {
    if (document.body) {
      document.body.classList.toggle('maturity-highlight', on);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.classList.toggle('maturity-highlight', on);
      });
    }
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || typeof m !== 'object' || m.__soamView !== true) return;
    switch (m.kind) {
      case 'init':
        lastInitMsg = m;
        themeSnapshot = m.theme || {};
        applyTheme(themeSnapshot);
        if (typeof m.maturityHighlight === 'boolean') {
          setMaturityHighlight(m.maturityHighlight);
        }
        resolvedReady();
        break;
      case 'activate':
        isActive = true;
        activateHandlers.forEach(function (h) { try { h(); } catch (err) { console.error(err); } });
        break;
      case 'deactivate':
        isActive = false;
        deactivateHandlers.forEach(function (h) { try { h(); } catch (err) { console.error(err); } });
        break;
      case 'theme':
        themeSnapshot = m.theme || {};
        applyTheme(themeSnapshot);
        if (typeof m.maturityHighlight === 'boolean') {
          setMaturityHighlight(m.maturityHighlight);
        }
        break;
      case 'context':
        // Buffer for replay. The view's own listener handles the live message;
        // if it isn't registered yet (parser still in <head>/mid-parse), replay
        // the latest value on DOMContentLoaded so the view never misses its id.
        lastContextMsg = m;
        if (document.readyState === 'loading' && !contextReplayScheduled) {
          contextReplayScheduled = true;
          document.addEventListener('DOMContentLoaded', replayContext);
        }
        break;
      case 'focusAspect':
        // Buffer for replay (mirrors 'context'). The view's own listener handles
        // the live message; if it isn't registered yet, replay on DOMContentLoaded
        // so a freshly-mounted aspects iframe never drops the deep-link focus.
        lastFocusMsg = m;
        if (document.readyState === 'loading' && !focusReplayScheduled) {
          focusReplayScheduled = true;
          document.addEventListener('DOMContentLoaded', replayFocus);
        }
        break;
      case 'store.changed':
        storeChangeHandlers.forEach(function (h) { try { h(m.payload); } catch (err) { console.error(err); } });
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

  function _makeBoundProxy(name, version, expectKind) {
    return ready.then(function () {
      var disposed = false;
      return {
        call: function (method) {
          if (disposed) return Promise.reject(new Error('Capability proxy disposed: ' + name + '@' + version));
          var args = Array.prototype.slice.call(arguments, 1);
          var id = nextId++;
          return new Promise(function (resolve, reject) {
            pending.set(id, { resolve: resolve, reject: reject });
            var msg = { __soamView: true, kind: 'cap.call', requestId: id, capability: name, version: version, method: method, args: args };
            if (expectKind !== undefined) msg.expectKind = expectKind;
            send(msg);
          });
        },
        dispose: function () { disposed = true; }
      };
    });
  }

  function bindCapability(name, version) { return _makeBoundProxy(name, version, undefined); }
  function bindQuery(name, version)      { return _makeBoundProxy(name, version, 'query'); }
  function bindCommand(name, version)    { return _makeBoundProxy(name, version, 'command'); }

  window.soamView = Object.freeze({
    bindCapability: bindCapability,
    bindQuery: bindQuery,
    bindCommand: bindCommand,
    events: Object.freeze({
      onActivate: function (h) {
        activateHandlers.add(h);
        // Replay if already active (handler registered after the activate message).
        if (isActive) { try { h(); } catch (err) { console.error(err); } }
        return { dispose: function () { activateHandlers.delete(h); } };
      },
      onDeactivate: function (h) {
        deactivateHandlers.add(h);
        return { dispose: function () { deactivateHandlers.delete(h); } };
      },
      onStoreChange: function (h) {
        storeChangeHandlers.add(h);
        return { dispose: function () { storeChangeHandlers.delete(h); } };
      }
    }),
    get theme() { var snap = {}; for (var k in themeSnapshot) snap[k] = themeSnapshot[k]; return snap; },
    requestClose: function () { send({ __soamView: true, kind: 'request.close' }); },
    requestFocus: function () { send({ __soamView: true, kind: 'request.focus' }); },
    openInEditor: function (viewId, opts) {
      send({ __soamView: true, kind: 'request.openEditor', viewId: viewId, query: (opts && opts.query) || undefined, title: (opts && opts.title) || undefined, entityId: (opts && opts.entityId !== undefined) ? opts.entityId : undefined, preview: (opts && opts.preview !== undefined) ? opts.preview : undefined, targetBundleId: (opts && opts.bundleId) || undefined });
    },
    setOverviewViewMode: function (mode) {
      send({ __soamView: true, kind: 'request.setOverviewViewMode', mode: mode });
    },
    setScheduleViewState: function (state) {
      send({ __soamView: true, kind: 'request.setScheduleViewState', state: state });
    },
    setScheduleCounts: function (counts) {
      send({ __soamView: true, kind: 'request.setScheduleCounts', counts: counts });
    },
    bumpScheduleData: function () {
      send({ __soamView: true, kind: 'request.bumpScheduleData' });
    },
    setActiveEvent: function (ev) {
      send({ __soamView: true, kind: 'request.setActiveEvent', event: ev });
    },
    openExternal: function (url) {
      send({ __soamView: true, kind: 'request.openExternal', url: url });
    },
    openActivity: function (containerId) {
      send({ __soamView: true, kind: 'request.openActivity', containerId: containerId });
    },
    setTabDescription: function (text) {
      send({ __soamView: true, kind: 'request.setTabDescription', text: text });
    },
    focusAspect: function (sectionId) {
      send({ __soamView: true, kind: 'request.focusAspect', sectionId: sectionId });
    },
    requestContextMenu: function (menuId, x, y, context, contextOverrides) {
      send({ __soamView: true, kind: 'request.contextMenu', menuId: menuId, x: x, y: y, context: context, contextOverrides: contextOverrides || undefined });
    },
    // Buffered last 'context' message (or null). A view whose listener attaches
    // AFTER the initial context was delivered+replayed (e.g. a React view whose
    // listener lives in a post-mount effect) reads this on startup to seed its
    // entity id instead of missing it. Live updates still arrive via the
    // 'context' window message. See @ru-soam/view-kit ViewRoot.
    currentContext: function () { return lastContextMsg; },
    // Buffered 'init' message (or null). React views read this via
    // initPayload() on mount (inside awaitBridge().then) to seed channel values
    // (scheduleViewState, scheduleCounts, etc.) delivered as init message fields.
    // Unlike 'context', 'init' fires once and is never replayed — so channel
    // seeds that arrive on init would otherwise be missed by late-attaching
    // listeners. See @ru-soam/view-kit ViewRoot + useViewChannel.
    initPayload: function () { return lastInitMsg; },
    ready: ready
  });

  window.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
    send({ __soamView: true, kind: 'keydown', key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey });
  });

  send({ __soamView: true, kind: 'view.ready' });
})();
`;
