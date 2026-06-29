# Bundle-view sandbox, origin, and CSP — the reasoning

**Audience:** anyone touching bundle view hosting, the `view://` protocol, the
view CSP, or building UI inside a bundle iframe.
**Companion to:** ADR-411 (view hosting) + its Amendment 1, ADR-418 (trust
tiers), ADR-419 (bundle-view tech stack), ADR-201 (Electron hardening).

This doc explains *why* bundle views are hosted the way they are — specifically
the origin model and the Content-Security-Policy — because the reasoning is
subtle, was initially gotten wrong (opaque origins), and is easy to re-break
without understanding the trade-offs.

---

## 1. CSP is a renderer (Blink) mechanism — it only exists in web contexts

Content-Security-Policy is enforced by the **browser engine** (Blink/Chromium)
that renders web documents. It is meaningless in a Node process — there is no
Blink there to enforce it.

So across the four trust zones (ADR-101):

| Zone | Type | Has a CSP? | Actually governed by |
|------|------|-----------|----------------------|
| **Main** | Node | No | Electron fuses, no-remote-code, the capability broker |
| **FP-Host** | Node (spawned) | No | process isolation, manifest caps, the PHI invariant (ADR-418) |
| **TP-Host** (future) | Node | No | same, plus structural PHI hard-deny |
| **Shell renderer** | web (`app://`) | **Yes** | ADR-201 baseline CSP |
| **Bundle view iframe** | web (`view://`) | **Yes** | the view CSP (ADR-411 Am1) |

There are therefore exactly **two CSP-bearing layers**: the shell renderer and
the bundle view iframes. The Node zones are hardened by entirely different
controls. A common confusion is to ask for "a CSP for FP-Host" — but FP-Host
runs the bundle's `index.mjs` *host logic* in Node with no DOM; it never loads
the bundle's view HTML. The view HTML runs in a **renderer-side iframe**, and
that is the only place a bundle's CSP applies.

---

## 2. "First-party code" does not mean "trusted content"

The natural objection: *every view asset is first-party, packaged in our own
repo — who is the attacker a CSP defends against?*

The code is ours. **The data flowing through it is not.** Views render:

- Google calendar **event titles, descriptions, locations**, attendee and
  organiser names
- contact names (People API)
- patient-supplied free text, notes, identifiers
- anything synced or imported from outside

All of that is **attacker-controllable input**. A crafted calendar invite with a
title like `<img src=x onerror="…">`, or a hostile contact display name, is
external data landing inside a first-party view. If a view ever interpolates it
into HTML unescaped (`innerHTML`, `dangerouslySetInnerHTML`, a string template),
that is stored/reflected XSS — and it executes **in the bundle's origin, holding
that bundle's PHI capabilities.**

So the defense layers are:

1. **Escape at render** — `textContent` (vanilla views) / JSX auto-escaping
   (React views, ADR-419). First line.
2. **CSP** — the backstop for when (1) is missed. `script-src` blocks injected
   scripts from running; `base-uri 'none'` blocks a `<base>` tag from repointing
   relative URLs to a hostile origin; `form-action 'none'` blocks form-POST
   exfiltration even if script execution is otherwise contained.

For a PHI application this net is the point, *because* the content is hostile by
default even though the code is ours. This is also exactly why
`'unsafe-inline'` in `script-src` is a real problem: it re-permits the injected
inline `<script>` that step (2) exists to stop, collapsing the backstop.

---

## 3. Opaque origin vs real per-bundle origin — the mistake and the fix

### What we did first (and why it caused pain)

ADR-411 originally sandboxed each view iframe as
`sandbox="allow-scripts allow-forms"` — **without `allow-same-origin`**. That
forces an **opaque origin** (a unique, origin-less identity). The intent was
isolation: an opaque-origin document can't reach the shell DOM, `window.soam`,
or another bundle.

The cost: an opaque origin **cannot reliably load `view://` subresources.**
Blink's same-origin scheme check rejects them — cross-host (`view://_platform_/…`)
intermittently *blocks* the load (the codicons-blank-view incident), same-host
(`view://<bundleId>/…`) loads but logs a violation. To dodge this, **everything
got inlined** — bridge, codicons, fonts, the query vendor — and the CSP had to
allow `'unsafe-inline'`, and a normal bundler build (external chunks + ES
modules) didn't fit, forcing single-file inlining. One origin choice cascaded
into the entire hack chain.

### The fix: a real, unique origin per bundle (the VS Code webview model)

VS Code webviews do **not** use opaque origins. Each webview gets a **real,
unique origin** (`vscode-webview://<uuid>`) plus a strict CSP. Normal web content
— bundlers, ES modules, external chunks — works, and isolation comes from the
**unique origin + CSP**, not from opaqueness.

We adopt the same model: add **`allow-same-origin`** to the view sandbox.

**The critical, non-obvious point:** `allow-same-origin` does *not* make the
iframe same-origin with the shell. It means "do not force an opaque origin —
keep the origin from your URL," i.e. `view://<bundleId>`. That origin is:

- **different from the shell** (`app://` in prod, `http://localhost:5173` in
  dev) → the iframe still cannot reach `window.parent`, the shell DOM, or
  `window.soam`. Cross-origin same-origin-policy blocks it.
- **different per bundle** (`view://bundleA` ≠ `view://bundleB`) → cross-bundle
  access stays blocked.

### "Never combine allow-scripts + allow-same-origin" — when it actually applies

The well-known warning is real but **conditional**: it is dangerous only when
the framed content is **same-origin with its embedder**, because then the iframe
can reach `window.parent`, rewrite its own `sandbox` attribute, and remove its
restrictions. Our view content is **cross-origin** with the shell
(`view://bundleId` vs `app://`), so `window.parent` is blocked by SOP and the
self-de-sandbox escape is structurally impossible.

In other words: the isolation ADR-411 §"Trust zone" relies on —
*"the same-origin policy prevents it from reaching the shell's DOM"* — was always
coming from the **distinct origin**, never from opaqueness. Opaqueness added
nothing but the subresource pain. Removing it (while keeping a distinct,
per-bundle origin) preserves the trust boundary exactly and deletes the hack
chain.

### What the real origin buys

- `view://` subresources load normally → seams become ordinary same-host files,
  no inline injection.
- The view CSP can be `script-src 'self'` — **no `'unsafe-inline'`, no nonce
  needed** for the common case.
- Bundlers build idiomatically: external chunks, **shared vendor chunk across a
  bundle's views**, ES modules. (ADR-419's single-file inlining becomes a
  fallback, not the default.)
- Egress posture is unchanged: `connect-src 'none'` stays — no direct network
  from a view, the bridge is still `postMessage` (which CSP `connect-src` does
  not govern). We relaxed *origin opaqueness only*, never network policy.
- It generalises to a future untrusted TP-Host bundle: a real-but-unique origin
  is still fully isolated.

---

## 4. Trust-tiered CSP

The view CSP (and sandbox flags) is **parameterised by the serving bundle's
`trustClass`** (ADR-418). The `view://` protocol handler knows which bundle it
is serving, so it knows the trust tier and emits the matching policy.

```
shell renderer  (app://)            highest trust   → ADR-201 CSP
FP bundle views (view://fp-bundle)  first-party     → CSP tier: first-party
TP bundle views (view://tp-bundle)  untrusted       → CSP tier: untrusted (strictest)
```

Today there is a single view CSP because there is a single tier — everything is
first-party FP-Host (ADR-418 rung-0). The design makes the policy a function of
trust tier so the untrusted tier can be tightened (and its sandbox flags
reconsidered) when rung-H lands, without touching the first-party path.

---

## 5. The one-line summary for reviewers

Bundle views are isolated by a **real, unique, per-bundle origin** + a
**trust-tiered CSP**, not by an opaque origin. The code is first-party but the
**content is hostile by default** (external PHI/provider data), so the CSP is a
genuine XSS backstop — which is why `'unsafe-inline'` is avoided, made possible
by the real origin. Don't reintroduce the opaque origin: it buys no isolation
the distinct origin doesn't already provide, and it forces every inline hack.
