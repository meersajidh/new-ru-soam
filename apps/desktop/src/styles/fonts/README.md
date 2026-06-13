# styles/fonts

Self-hosted webfonts (via `@fontsource`) for the Ru-Soam font sets — O422.

## Families

| Family | Package | License | Use |
|---|---|---|---|
| Source Serif 4 | `@fontsource-variable/source-serif-4` (`standard.css` — opsz+wght) | SIL OFL 1.1 | Display headings + editorial body |
| Inter Tight | `@fontsource-variable/inter-tight` (`wght.css`) | SIL OFL 1.1 | UI chrome / workbench sans |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` (`400.css` + `500.css`) | SIL OFL 1.1 | Mono / inline code |

## Notes

- `google-fonts.css` (filename kept to avoid churn) now `@import`s the
  `@fontsource` package CSS instead of the Google Fonts CDN. Vite rewrites the
  packages' `url(./files/*.woff2)` rules to hashed assets under
  `dist/renderer/assets/` at build time — fonts ship inside the app, **no
  runtime CDN fetch** (offline-clean + removes the ADR-203 third-party-fetch
  concern).
- The two **variable** packages register family names `Inter Tight Variable` /
  `Source Serif 4 Variable`. The brand font-set stacks
  (`../font-sets/{ru-display,ru-editorial}.css`) list the `Variable` name first,
  then the plain name, then the system fallback. IBM Plex Mono is static and
  registers the plain `IBM Plex Mono` (matches the stacks directly).
- `font-display: swap` is set by `@fontsource` — text renders in fallback first.
- The bundle-view iframes self-host Inter Tight separately (base64-inlined in
  `electron/main/fp-host/view-fonts.ts`) because their sandboxed opaque origin
  can't fetch `view://` subresources reliably — that was the bundle-view half of
  O422 (done 2026-06-02). This file covers the renderer half.
