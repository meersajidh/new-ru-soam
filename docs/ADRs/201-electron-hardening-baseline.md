# Electron hardening baseline

**ID:** ADR-201
**Status:** Accepted
**Date:** 2026-05-12
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-101, ADR-102, ADR-202 _(planned: narrow preload)_, ADR-203 _(planned: brokered networking)_, ADR-204 _(planned: installer integrity and update channel)_

## Context

ADR-101 labels the Renderer as the untrusted boundary. ADR-102 scopes the Renderer to composition. Those decisions hold only if the Electron process settings actually enforce the boundary. Electron's historical defaults are not safe — `nodeIntegration` was once on, `contextIsolation` was once off, `sandbox` is still per-window opt-in in many setups. Without an explicit baseline, the trust model decays to "whatever the BrowserWindow constructor happened to be called with that day".

The mental-health workbench raises the bar: the Renderer is one bad dependency or one bad inline script away from touching PHI, credentials, or the Local Store if process settings are weak. The baseline must be platform-wide, not per-window discretion.

## Decision

### Window settings

Every BrowserWindow created by the platform is constructed with the following `webPreferences`:

```ts
{
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  // The deprecated `enableRemoteModule` is removed in modern Electron;
  // the remote module is not used regardless.
}
```

### Content Security Policy

A strict CSP is delivered via response headers from the custom protocol (ADR-203, planned) and as a fallback `<meta>` tag. No `unsafe-inline` or `unsafe-eval` for scripts. Inline styles, where unavoidable, use nonces or hashes.

Strawman policy (draft/example, to be tightened — see Open Item O10):

```
default-src 'self' app:;
script-src 'self' app:;
style-src 'self' app: 'unsafe-inline';
img-src 'self' app: data:;
connect-src 'self' app:;
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
```

The `connect-src` line is deliberately strict: `'self'` and `app:` only. The `app://` protocol is the renderer's brokered network channel (ADR-203). Direct `https://` fetches from the renderer are the exception, not the rule (ADR-203 §"Direct-fetch policy") and require both a CSP allowlist entry for the host and a renderer-side override marker. Each host added to the CSP `connect-src` is an audit point.

### Navigation and window opening

`will-navigate`, `setWindowOpenHandler`, and `will-attach-webview` deny by default. Navigation targets and new windows are allowed only by explicit policy declared in the main process.

### Embedded content

- **`<webview>` tags are forbidden.** Electron documents `<webview>` as not recommended for security and stability reasons. The platform does not accept it anywhere.
- **Same-trust embeds use `<iframe sandbox="...">`** with the platform CSP applied to the top-level document. Only used when the embedded content is genuinely same-trust and same-origin.
- **Cross-origin or untrusted embedded content uses `WebContentsView`** (the replacement for the deprecated `BrowserView`), instantiated and managed by the main process. The renderer never instantiates a `WebContentsView`. The renderer asks main, via a capability (ADR-103), to attach or detach embedded content; main owns the lifecycle and the trust boundary.

### IPC sender validation

Every IPC handler validates the sender (`event.senderFrame` or equivalent) against an allowlist of frames the platform itself created. A handler that does not validate is treated as a bug. The validation is implemented by a small platform utility used at every handler registration — see Open Item O12.

### Preload-only privilege

Code with privileged APIs runs only in preload (and only the narrow surface ADR-202 will define). No other path from main into the renderer process exists.

### Single enforcement point

These settings are applied by a single platform-owned BrowserWindow factory. Creating windows by calling `new BrowserWindow(...)` directly is forbidden in application code; same for direct construction of `WebContentsView` outside the platform's embedded-content service. Enforcement is initially social, hardened by lint — see Open Item O13.

### ESM and sandbox

`sandbox: true` interacts non-trivially with ESM preloads in some Electron versions. The platform commits to running with sandbox on. If the chosen preload module format constrains this, the format adapts — not the setting. See Open Item O11.

## Consequences

### Positive

- The trust boundary that ADRs 101 and 102 declare is enforced at the Electron runtime layer, not by author discipline.
- A renderer compromise has bounded blast radius. The renderer cannot reach `require('fs')`, cannot evaluate arbitrary script, cannot navigate to attacker-controlled origins, cannot attach embedded content of its own choosing, and cannot speak to handlers that do not recognise its frame.
- The baseline is one place to audit. Security review of the BrowserWindow factory, CSP policy, IPC validator, and embedded-content service covers most of the renderer surface.

### Negative

- Some third-party UI libraries assume inline scripts/styles or `eval`-based templating. Those are not adopted without a CSP-compatible alternative.
- `sandbox: true` constrains preload module choices. The platform must verify each Electron upgrade against this constraint.
- Strict CSP requires ongoing maintenance as the dependency tree evolves.
- Forbidding `<webview>` means embedding flows that the web tradition reaches for first (drop-in `<webview>`) require a deliberate `WebContentsView` design instead.

### Neutral

- These settings are not novel — they are Electron's documented hardening guidance. The decision is to adopt them as a platform-wide non-negotiable rather than as advisory.

## Considered Options

- **Electron defaults only** — _Rejected_: defaults remain too permissive for this trust model, and may shift between versions.
- **Per-window opt-in hardening** — _Rejected_: relies on every window's author remembering. Drift is inevitable.
- **Platform-wide baseline via a single window factory** _(chosen)_ — One enforcement point, one audit target. Forbids direct BrowserWindow construction in feature code.

## Open Items

- **O10** — CSP exact policy text. The block above is a strawman; tighten as the styling solution and asset pipeline land.
- **O11** — Sandbox + ESM preload compatibility on the targeted Electron version. Verify and record.
- **O12** — IPC sender-validation helper: a small utility every handler uses (`validateSender(event)`), or a wrapper that registers handlers with validation baked in.
- **O13** — Lint rules to mechanically enforce: no direct `new BrowserWindow(...)`, no `electron` imports outside the BrowserWindow factory and platform internals, no `<webview>` tag in any TSX, no direct `WebContentsView` construction in feature code.
