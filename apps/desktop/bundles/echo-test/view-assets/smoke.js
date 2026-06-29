/**
 * ADR-411 Am1 smoke test for the react/strict CSP path.
 *
 * Loaded as a same-host external script (view://echo-test/smoke.js) after
 * the injected bridge and bootstrap seams have run.
 *
 * Reports to window.parent so the shell (or a CDP harness) can verify the
 * mechanism without requiring a real React bundle.
 *
 * Expected results (all-pass = strict path confirmed):
 *   origin          "view://echo-test"   — real per-bundle origin, not "null"
 *   soamViewDefined true                 — bridge seam loaded + ran
 *   inlineBlocked   true                 — inline <script> in <head> was blocked by CSP
 */
(function () {
  'use strict';

  var results = {
    origin: self.origin,
    soamViewDefined: typeof window.soamView !== 'undefined',
    // If the inline script ran, __inlineRan is true. We want it BLOCKED (undefined).
    inlineBlocked: window.__inlineRan !== true,
  };

  // Update the status paragraph for visual inspection in the devtools.
  var statusEl = document.getElementById('status');
  if (statusEl) {
    var allPass = results.soamViewDefined && results.inlineBlocked;
    statusEl.textContent = allPass
      ? 'Smoke PASS — origin=' + results.origin
      : 'Smoke FAIL — see postMessage result';
  }

  // Post to parent so the shell / CDP harness can read it.
  window.parent.postMessage({ __smoke: true, results: results }, '*');
})();
