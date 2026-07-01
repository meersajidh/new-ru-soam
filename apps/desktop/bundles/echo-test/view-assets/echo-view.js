// echo-test view logic (Phase 7 sandbox-hardening fixture).
//
// Externalised from the former inline <script> so the view runs under the
// strict react-tier CSP (`script-src 'self'`, no 'unsafe-inline'). Same-host
// `view://echo-test/echo-view.js` — permitted by `script-src 'self'`.
// Verifies iframe hardening (soam/require/process/parent.document/top.location
// all denied), echo.ping round-trip, theme propagation echo. ADR-411 Am1 / O511.
(function () {
  var log = document.getElementById('log');
  function append(line, cls) {
    var div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = '[' + new Date().toISOString().slice(11, 19) + '] ' + line;
    if (log.textContent === '(waiting for bridge…)') log.textContent = '';
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function awaitBridge() {
    return new Promise(function (resolve) {
      if (window.soamView) return resolve(window.soamView);
      var iv = setInterval(function () {
        if (window.soamView) { clearInterval(iv); resolve(window.soamView); }
      }, 25);
    });
  }

  awaitBridge().then(function (soamView) {
    append('bridge ready', 'ok');
    window.__autoProbeResults = { ready: true, pings: [], probes: null };

    // Echo every theme push so the parent can verify propagation.
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (d && d.__soamView === true && d.kind === 'theme') {
        var cs = getComputedStyle(document.documentElement);
        var surface = cs.getPropertyValue('--color-surface-base').trim();
        window.parent.postMessage({ __soamView: true, kind: 'view.themeEcho', surface: surface, varCount: Object.keys(d.theme || {}).length }, '*');
      }
    });

    soamView.events.onActivate(async function () {
      append('activate received', 'ok');
      try {
        var proxy = await soamView.bindCapability('echo.ping', '1.0');
        try {
          var reply = await proxy.call('echo', 'auto-ping-on-activate');
          window.__autoProbeResults.pings.push({ ok: true, reply: reply });
          append('auto-ping reply: ' + JSON.stringify(reply), 'ok');
        } finally { proxy.dispose(); }
      } catch (err) {
        window.__autoProbeResults.pings.push({ ok: false, message: err && err.message });
        append('auto-ping failed: ' + (err && err.message), 'leak');
      }
      window.__autoProbeResults.probes = runProbes();
      window.parent.postMessage({ __soamView: true, kind: 'view.probeReport', payload: window.__autoProbeResults }, '*');
    });
    soamView.events.onDeactivate(function () { append('deactivate received', 'ok'); });

    function runProbes() {
      var out = {};
      try { out.hasSoam = typeof window.soam !== 'undefined'; } catch (e) { out.hasSoam = 'threw:' + e.message; }
      try { out.parentDoc = (function(){ try { return !!window.parent.document; } catch (e) { return 'denied:' + e.message; } })(); } catch (e) { out.parentDoc = 'threw:' + e.message; }
      try { out.hasRequire = typeof window.require !== 'undefined'; } catch (e) { out.hasRequire = 'threw:' + e.message; }
      try { out.hasProcess = typeof window.process !== 'undefined'; } catch (e) { out.hasProcess = 'threw:' + e.message; }
      try { out.topLocation = (function(){ try { return window.top.location.href; } catch (e) { return 'denied:' + e.message; } })(); } catch (e) { out.topLocation = 'threw:' + e.message; }
      try { out.origin = window.origin; } catch (e) { out.origin = 'threw:' + e.message; }
      return out;
    }

    document.getElementById('ping').addEventListener('click', async function () {
      try {
        var proxy = await soamView.bindCapability('echo.ping', '1.0');
        try {
          var reply = await proxy.call('echo', 'hello from iframe @ ' + Date.now());
          append('echo.ping pong: ' + JSON.stringify(reply), 'ok');
        } finally { proxy.dispose(); }
      } catch (err) {
        append('echo.ping FAILED: ' + (err && err.message), 'leak');
      }
    });

    document.getElementById('close').addEventListener('click', function () {
      soamView.requestClose();
    });

    document.getElementById('probes').addEventListener('click', function () {
      append('--- hardening probes ---');

      try {
        var hasSoam = typeof window.soam !== 'undefined';
        if (hasSoam) append('LEAK: window.soam defined in iframe', 'leak');
        else append('window.soam undefined (denied)', 'deny');
      } catch (e) { append('window.soam read threw: ' + e.message, 'deny'); }

      try {
        var parentDoc = window.parent.document;
        append('LEAK: parent.document reachable: ' + parentDoc.title, 'leak');
      } catch (e) { append('parent.document denied: ' + e.message, 'deny'); }

      try {
        var hasRequire = typeof window.require !== 'undefined';
        if (hasRequire) append('LEAK: window.require defined', 'leak');
        else append('window.require undefined (denied)', 'deny');
      } catch (e) { append('window.require read threw: ' + e.message, 'deny'); }

      try {
        var hasProcess = typeof window.process !== 'undefined';
        if (hasProcess) append('LEAK: window.process defined', 'leak');
        else append('window.process undefined (denied)', 'deny');
      } catch (e) { append('window.process read threw: ' + e.message, 'deny'); }

      try {
        var topLoc = window.top.location.href;
        append('LEAK: top.location.href: ' + topLoc, 'leak');
      } catch (e) { append('top.location denied: ' + e.message, 'deny'); }
    });
  });
})();
