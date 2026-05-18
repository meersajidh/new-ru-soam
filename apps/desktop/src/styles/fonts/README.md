# styles/fonts

CDN @import for webfonts used by the Ru-Soam font sets.

## Families

| Family | License | Use |
|---|---|---|
| Source Serif 4 | SIL OFL 1.1 | Display headings + editorial body |
| Inter Tight | SIL OFL 1.1 | UI chrome / workbench sans |
| IBM Plex Mono | SIL OFL 1.1 | Mono / inline code |

## Notes

- `google-fonts.css` contains a single `@import url(...)` pointing to Google Fonts CSS2 endpoint.
- `font-display: swap` is implicit in that endpoint — text renders in fallback first.
- **TODO:** bundle the `.woff2` files here and replace the CDN import with explicit `@font-face` rules to remove the network dependency and enable offline use.
