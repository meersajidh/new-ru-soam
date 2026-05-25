# Ru-Soam — web templates

Static HTML templates for the Ru-Soam marketing site. All release data
(version, download URLs, checksums) is injected at build time — no runtime
GitHub API fetch.

```
apps/web/
├── build.mjs           ← zero-dep build script (Node 24, ESM)
├── package.json        ← name: ru-soam-web; scripts: build, deploy
├── templates/          ← source templates (this directory)
│   ├── index.html      ← landing page
│   ├── download.html   ← download cards (tokens injected by build.mjs)
│   ├── changelog.html  ← changelog page (CHANGELOG_BODY injected)
│   ├── assets/
│   │   ├── ds/         ← design system (tokens + font sets)
│   │   └── icon/       ← bridge mark + og.png (512px icon for social cards)
│   ├── _headers        ← Cloudflare Pages: security + cache headers (CSP hash inside)
│   └── README.md       ← this file
└── dist/               ← build output (gitignored); served by Cloudflare Pages
```

## How it works

1. `build.mjs` fetches the latest stable GitHub release (and the highest
   prerelease > stable, if any) via the GitHub REST API.
2. Selects `.exe` (Windows) and `.deb` (Linux) assets; reads size and checksum
   from the API response (no asset download).
3. Parses `CHANGELOG.md` (Keep-a-Changelog format) from the repo root.
4. Token-substitutes `{{TOKEN}}` placeholders in templates; keeps or strips
   the `<!--BEGIN_BETA-->…<!--END_BETA-->` region based on prerelease
   availability.
5. Writes `dist/{index,download,changelog}.html`, `dist/assets/**`,
   `dist/_headers`.

## Build

```bash
# From repo root (no GITHUB_TOKEN needed; uses public API rate limit)
node apps/web/build.mjs

# With a token (higher rate limit — needed in CI)
GITHUB_TOKEN=ghp_... node apps/web/build.mjs

# Or via npm script
npm run build -w ru-soam-web
```

Build output lands in `apps/web/dist/`. Preview locally:

```bash
python3 -m http.server 4173 --directory apps/web/dist
# visit http://localhost:4173
```

## Deploy

CI (`release.yml`, `web-deploy.yml`) runs wrangler automatically:

- **On every `v*` tag** (`release.yml` → `web` job, after `desktop`): picks
  up the freshly published release assets.
- **On `main` push touching `apps/web/**`** (`web-deploy.yml`): rebuilds from
  the current latest release.

Manual deploy (requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`):

```bash
node apps/web/build.mjs
npx wrangler@4 pages deploy apps/web/dist --project-name=ru-soam --branch=main
```

Or load `.env.local` first (it contains the Cloudflare credentials):

```bash
export $(grep -v '^#' apps/web/.env.local | xargs)
node apps/web/build.mjs
npx wrangler@4 pages deploy apps/web/dist --project-name=ru-soam --branch=main
```

## Token reference

| Token | Source |
|---|---|
| `{{SITE_URL}}` | `SITE_URL` env (default: `https://ru-soam.pages.dev`) |
| `{{VERSION}}` | Stable release tag (e.g. `0.1.0`) |
| `{{RELEASE_DATE}}` | `published_at` from GitHub API (e.g. `24 May 2026`) |
| `{{WIN_URL}}` | `releases/latest/download/<name>` |
| `{{WIN_NAME}}` | Asset filename from API |
| `{{WIN_SIZE}}` | Whole MB |
| `{{WIN_SHA256}}` | `asset.digest` stripped of `sha256:` prefix, or `—` |
| `{{DEB_URL}}` | Same pattern for `.deb` |
| `{{DEB_NAME}}`, `{{DEB_SIZE}}`, `{{DEB_SHA256}}` | Same |
| `{{BETA_VERSION}}` | Beta tag version string |
| `{{BETA_WIN_URL}}`, `{{BETA_DEB_URL}}` | Version-pinned download URLs |
| `{{BETA_WIN_NAME}}`, `{{BETA_DEB_NAME}}` | Beta asset filenames |
| `{{CHANGELOG_BODY}}` | Rendered HTML from `CHANGELOG.md` |

## CSP hash

`_headers` sets `script-src 'self' 'sha256-…'` (no `'unsafe-inline'`).
The hash covers the inline theme-flip `<script>` block that is **byte-identical**
across all three HTML templates. If you change the theme script, recompute:

```bash
python3 -c "
import hashlib, base64, re
s = re.search(r'<script>(.*?)</script>',
  open('apps/web/templates/download.html').read(), re.DOTALL).group(1)
print('sha256-' + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())
"
```

Then update the hash in `templates/_headers`.

## Themes

Site follows OS dark/light preference. The inline theme script removes the
`dark` class from `<html>` on light preference and listens for subsequent
changes. Default cold-start is Bamboo Dark (brand signature surface).
