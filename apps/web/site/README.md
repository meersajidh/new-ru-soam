# Ru-Soam — site

A single static page for [ru-soam.com](https://ru-soam.com) — the bridge
mark, the brand story, and a download button. Built to be served from
Cloudflare Pages, no build step.

```
.
├── index.html        ← the landing page (icon, story, download button)
├── download.html     ← Windows / Linux downloads, checksums, macOS waitlist
├── assets/
│   ├── ds/           ← Ru-Soam design system (tokens + font sets, copied in)
│   └── icon/         ← the bridge mark in several variants
├── _headers          ← Cloudflare Pages: security + cache headers
└── README.md         ← this file
```

## Local preview

The site is plain static files — open `index.html` in a browser, or serve the
folder over any static server. The simplest option, if you have Python around:

```bash
python3 -m http.server 4173
# then visit http://localhost:4173
```

…or with Node:

```bash
npx serve .
```

## Deploy to Cloudflare Pages

There are two equally valid paths. **Direct upload** is fastest for a one-off;
**Git integration** is what you want for an ongoing site.

### Option A — Direct upload (no Git)

1. Open the Cloudflare dashboard → **Workers & Pages** → **Create
   application** → **Pages** → **Upload assets**.
2. Project name: `ru-soam` (this becomes `ru-soam.pages.dev`).
3. Drag the contents of this folder (not the folder itself — the files inside
   it) into the upload box. Make sure `index.html` and `_headers` land at the
   root.
4. Click **Deploy site**. First deploy is usually under a minute.

To redeploy, repeat the upload — Cloudflare keeps every deployment as a
separate immutable build, so you can roll back from the dashboard if needed.

### Option B — Git integration (recommended)

1. Push this folder to a GitHub or GitLab repository.
2. Cloudflare dashboard → **Workers & Pages** → **Create application** →
   **Pages** → **Connect to Git**.
3. Authorize the repo and pick the branch (usually `main`).
4. Build settings:
   - **Framework preset:** *None*
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
5. Deploy. Every push to `main` ships automatically; PR previews get their own
   subdomain.

### Custom domain — ru-soam.com

Once the Pages project is live:

1. In the project, **Custom domains → Set up a custom domain**.
2. Enter `ru-soam.com` (and add `www.ru-soam.com` separately if you want both).
3. If the domain is already on Cloudflare, the DNS records are created for
   you. If not, follow the CNAME instructions on the page.
4. Cloudflare provisions an SSL certificate automatically — usually within a
   few minutes.

### `_headers` — what it does

The `_headers` file at the project root is read by Cloudflare Pages and
applied to every response. Highlights:

- **CSP** locks scripts to self + inline (we use one small inline script for
  the theme flip), allows the Google Fonts stylesheet and font files, and
  blocks framing.
- **HSTS** with a one-year max-age and preload — only enable preload once
  you're confident the site will keep HTTPS.
- **HTML files** are cached with `max-age=0, must-revalidate` so a re-deploy
  is visible immediately.
- **Everything under `/assets/`** is treated as immutable for a year. If you
  edit a CSS file, also rename it (e.g. `site.css` → `site.v2.css`) and
  update the `<link>` so the browser picks up the new version.

## Themes

The site follows the OS dark-mode preference:

- Cold-start: dark Bamboo (the brand-signature surface).
- If the OS prefers light, an inline script strips the `dark` class from
  `<html>` before paint.
- If the OS preference changes while the page is open, the theme follows.

Other Ru-Soam themes (Stone, Geist) are shown as a comparison block on the
landing page but the site itself stays on Bamboo.

## Updating release artifacts

The download buttons on `download.html` currently point to `#`. When the
binaries are ready, replace each `href` with the real release URL, e.g.:

```html
<a class="btn btn-primary" href="https://releases.ru-soam.com/ru-soam-0.6.2.exe" download>
```

Also update the SHA-256 strings in the `.checksums` block and the version
label at the top of the page (and the matching version in `index.html` if
you choose to surface it there).

## What's not here

- No analytics. Don't add Google Analytics or any equivalent — it would
  contradict the privacy claim on the landing page. If you eventually want
  basic visit numbers, use Cloudflare Web Analytics (privacy-preserving,
  no cookies).
- No service worker / offline support. A static three-page site doesn't need
  one; adding one is a maintenance cost without a real user benefit here.
- No build step. The fonts come from Google Fonts at runtime. If you want
  to self-host them (faster first paint, fewer third-party requests),
  download the `.woff2` files into `assets/ds/fonts/` and replace
  `google-fonts.css` with explicit `@font-face` rules. See the design system
  README for the families and weights to pull.
