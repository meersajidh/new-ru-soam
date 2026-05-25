/**
 * build.mjs — Ru-Soam marketing site builder (Full-B: build-time injection)
 *
 * Zero runtime dependencies — pure Node ESM, Node 24+.
 *
 * Behaviour:
 *   1. Fetch update manifests (latest.yml / latest-linux.yml / beta*.yml) from R2.
 *   2. Parse each manifest to extract version, path, size, sha512, releaseDate.
 *   3. Parse CHANGELOG.md → render changelog.html.
 *   4. Token-substitute templates → write to apps/web/dist/.
 *   5. Copy assets/ and _headers verbatim.
 *
 * Usage:
 *   node apps/web/build.mjs
 *   R2_PUBLIC_URL=https://dl.ru-soam.com node apps/web/build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

// ── Config ──────────────────────────────────────────────────────────────────

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://dl.ru-soam.com').replace(/\/$/, '');
const SITE_URL = process.env.SITE_URL || 'https://ru-soam.pages.dev';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const DIST_DIR = path.join(__dirname, 'dist');
const REPO_ROOT = path.join(__dirname, '..', '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');

// ── HTTP fetch (zero-dep) ───────────────────────────────────────────────────

/**
 * GET a URL and return the raw text body.
 * Returns null on 404. Throws on other non-200 or network errors.
 * Follows one redirect.
 */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ru-soam-web-builder/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        res.resume();
        return;
      }
      if (res.statusCode === 404) {
        res.resume();
        resolve(null);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

// ── electron-updater YAML parser ────────────────────────────────────────────

/**
 * Parse an electron-updater manifest (latest.yml / beta.yml).
 *
 * Fields extracted:
 *   version      — top-level `version:` value
 *   path         — top-level `path:` value (primary installer filename)
 *   releaseDate  — top-level `releaseDate:` value (ISO string, quotes stripped)
 *   size         — size from the matching entry in `files:` list
 *   sha512       — sha512 from the matching entry in `files:` list
 *                  (falls back to top-level `^sha512:` if no files entry found)
 *
 * Returns null if any required field is missing.
 */
function parseManifest(yaml) {
  if (!yaml) return null;

  // Top-level scalar fields (column-0 keys only, `m` flag for multiline)
  const version = (yaml.match(/^version:\s*(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
  const primaryPath = (yaml.match(/^path:\s*(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
  const releaseDateRaw = (yaml.match(/^releaseDate:\s*(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');

  if (!version || !primaryPath) return null;

  // Parse `files:` block — extract entries with url/sha512/size
  // Format (indented, so won't conflict with top-level keys):
  //   files:
  //   - url: filename.exe
  //     sha512: base64==
  //     size: 12345
  let size = null;
  let sha512 = null;

  // Find the files block — iterate entries by splitting on "- url:"
  const filesBlockMatch = yaml.match(/^files:\s*\n([\s\S]*?)(?=^\S)/m);
  if (filesBlockMatch) {
    const filesBlock = filesBlockMatch[1];
    const entries = filesBlock.split(/^\s*- url:/m).slice(1); // first split is before any entry
    for (const entry of entries) {
      const entryUrl = entry.split('\n')[0].trim().replace(/^['"]|['"]$/g, '');
      if (entryUrl === primaryPath) {
        const sizeLine = (entry.match(/^\s+size:\s*(\d+)$/m) || [])[1];
        const sha512Line = (entry.match(/^\s+sha512:\s*(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
        if (sizeLine) size = parseInt(sizeLine, 10);
        if (sha512Line) sha512 = sha512Line;
        break;
      }
    }
  }

  // Fallback: top-level sha512 (column-0, `^sha512:` with m flag)
  if (!sha512) {
    sha512 = (yaml.match(/^sha512:\s*(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '') || null;
  }

  // releaseDate: strip to YYYY-MM-DD
  const releaseDate = releaseDateRaw ? releaseDateRaw.slice(0, 10) : null;

  return { version, path: primaryPath, releaseDate, size, sha512 };
}

// ── Semver helpers ──────────────────────────────────────────────────────────

/**
 * Parse semver string into comparable object.
 * pre: '' means stable (sorts highest).
 * Returns null for unparseable strings.
 */
function parseSemver(v) {
  const s = v.replace(/^v/, '');
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    pre: m[4] || '',
  };
}

/**
 * Compare two parsed semver objects. Returns positive if a > b.
 * Stable (pre='') > prerelease.
 */
function cmpSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === '' && b.pre !== '') return 1;
  if (a.pre !== '' && b.pre === '') return -1;
  return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0;
}

// ── Asset helpers ───────────────────────────────────────────────────────────

/**
 * Convert bytes to whole MB string.
 */
function toMB(bytes) {
  return String(Math.round(bytes / 1_048_576));
}

// ── Changelog parser (Keep-a-Changelog) ─────────────────────────────────────

/**
 * Parse Keep-a-Changelog formatted CHANGELOG.md.
 * Returns array of { version, date, entries: [{kind, text}] }, newest-first.
 * Excludes [Unreleased].
 */
function parseChangelog(src) {
  const lines = src.split('\n');
  const versions = [];
  let current = null;
  let currentKind = 'Changed';

  for (const raw of lines) {
    const line = raw.trimEnd();

    const versionMatch = line.match(/^## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/);
    if (versionMatch) {
      if (current) versions.push(current);
      const version = versionMatch[1];
      if (version.toLowerCase() === 'unreleased') {
        current = null;
        continue;
      }
      current = { version, date: versionMatch[2] ?? null, entries: [] };
      currentKind = 'Changed';
      continue;
    }

    if (!current) continue;

    const kindMatch = line.match(/^### (.+)/);
    if (kindMatch) {
      currentKind = kindMatch[1].trim();
      continue;
    }

    const itemMatch = line.match(/^[-*]\s+(.+)/);
    if (itemMatch) {
      current.entries.push({ kind: currentKind, text: itemMatch[1].trim() });
    }
  }
  if (current) versions.push(current);

  return versions;
}

/**
 * Format YYYY-MM-DD to human e.g. "24 May 2026".
 */
function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${day} ${months[month - 1]} ${year}`;
}

/**
 * Render changelog versions array to HTML for injection into changelog.html.
 */
function renderChangelogHTML(versions) {
  if (versions.length === 0) return '<p>No releases yet.</p>';

  return versions.map((block) => {
    const dateStr = block.date ? formatDate(block.date) : '';
    const dateHtml = dateStr
      ? `<span class="cl-version-date">${escapeHtml(dateStr)}</span>`
      : '';

    // Group entries by kind
    const groups = new Map();
    for (const entry of block.entries) {
      if (!groups.has(entry.kind)) groups.set(entry.kind, []);
      groups.get(entry.kind).push(entry.text);
    }

    const kindOrder = ['Added', 'Changed', 'Fixed', 'Deprecated', 'Removed', 'Security'];
    const sortedKinds = [
      ...kindOrder.filter((k) => groups.has(k)),
      ...[...groups.keys()].filter((k) => !kindOrder.includes(k)),
    ];

    const groupsHtml = sortedKinds.map((kind) => {
      const items = groups.get(kind);
      const itemsHtml = items.map((t) => `<li>${escapeHtml(t)}</li>`).join('\n        ');
      return `
      <div class="cl-group">
        <p class="cl-kind">${escapeHtml(kind)}</p>
        <ul class="cl-items">
        ${itemsHtml}
        </ul>
      </div>`;
    }).join('');

    return `<section class="cl-version">
  <div class="cl-version-header">
    <h2 class="cl-version-tag">${escapeHtml(block.version)}</h2>
    ${dateHtml}
  </div>${groupsHtml}
</section>`;
  }).join('\n\n');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Template substitution ───────────────────────────────────────────────────

/**
 * Replace {{TOKEN}} placeholders in template string.
 */
function substitute(template, tokens) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    return key in tokens ? tokens[key] : `{{${key}}}`;
  });
}

/**
 * Keep or strip the <!--BEGIN_BETA-->...<!--END_BETA--> region.
 */
function processBetaRegion(html, keepBeta) {
  const begin = '<!--BEGIN_BETA-->';
  const end = '<!--END_BETA-->';
  const startIdx = html.indexOf(begin);
  const endIdx = html.indexOf(end);
  if (startIdx === -1 || endIdx === -1) return html;

  if (keepBeta) {
    return html.replace(begin, '').replace(end, '');
  } else {
    return html.slice(0, startIdx) + html.slice(endIdx + end.length);
  }
}

// ── File system helpers ─────────────────────────────────────────────────────

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[web/build] fetching update manifests from R2…');

  // 1. Fetch stable manifests. Missing or unfetchable → WARN + skip the build
  //    (exit 0, write no dist/) so a release isn't blocked and the previously
  //    deployed site stays live; the Deploy step is guarded on dist/ existing.
  //    A manifest that IS fetched but malformed stays fatal (real corruption).
  const skip = (reason) => {
    console.warn(`[web/build] WARN: ${reason} — skipping site build (no dist/ written).`);
    process.exit(0);
  };

  const stableWinYaml = await fetchText(`${R2_PUBLIC_URL}/latest.yml`).catch((err) =>
    skip(`failed to fetch latest.yml: ${err.message}`),
  );
  if (!stableWinYaml) skip('latest.yml returned 404 — no stable release published yet');

  const stableLinuxYaml = await fetchText(`${R2_PUBLIC_URL}/latest-linux.yml`).catch((err) =>
    skip(`failed to fetch latest-linux.yml: ${err.message}`),
  );
  if (!stableLinuxYaml) skip('latest-linux.yml returned 404 — no stable release published yet');

  const stableWin = parseManifest(stableWinYaml);
  if (!stableWin || !stableWin.path || !stableWin.version) {
    console.error('[web/build] ERROR: latest.yml fetched but malformed (missing path/version)');
    process.exit(1);
  }

  const stableLinux = parseManifest(stableLinuxYaml);
  if (!stableLinux || !stableLinux.path || !stableLinux.version) {
    console.error('[web/build] ERROR: latest-linux.yml fetched but malformed (missing path/version)');
    process.exit(1);
  }

  const stableVersion = stableWin.version;
  const stableSemver = parseSemver(stableVersion);

  // 2. Fetch beta manifests (404 = no beta, non-fatal)
  let betaWin = null;
  let betaLinux = null;

  try {
    const betaWinYaml = await fetchText(`${R2_PUBLIC_URL}/beta.yml`);
    if (betaWinYaml) betaWin = parseManifest(betaWinYaml);
  } catch (err) {
    console.warn(`[web/build] WARN: could not fetch beta.yml: ${err.message}. Skipping beta.`);
  }

  try {
    const betaLinuxYaml = await fetchText(`${R2_PUBLIC_URL}/beta-linux.yml`);
    if (betaLinuxYaml) betaLinux = parseManifest(betaLinuxYaml);
  } catch (err) {
    console.warn(`[web/build] WARN: could not fetch beta-linux.yml: ${err.message}. Skipping beta linux.`);
  }

  // Beta is shown only when both manifests exist and beta version > stable version
  const betaVersion = betaWin?.version || '';
  const betaSemver = betaVersion ? parseSemver(betaVersion) : null;
  const hasBeta = !!(
    betaWin && betaLinux && betaSemver && stableSemver &&
    cmpSemver(betaSemver, stableSemver) > 0
  );

  // 3. Build token map
  const releaseDate = stableWin.releaseDate ? formatDate(stableWin.releaseDate) : '';

  const tokens = {
    SITE_URL: SITE_URL,
    VERSION: stableVersion,
    RELEASE_DATE: releaseDate,
    WIN_URL: `${R2_PUBLIC_URL}/${stableWin.path}`,
    WIN_NAME: stableWin.path,
    WIN_SIZE: stableWin.size ? toMB(stableWin.size) : '—',
    WIN_SHA512: stableWin.sha512 || '—',
    DEB_URL: `${R2_PUBLIC_URL}/${stableLinux.path}`,
    DEB_NAME: stableLinux.path,
    DEB_SIZE: stableLinux.size ? toMB(stableLinux.size) : '—',
    DEB_SHA512: stableLinux.sha512 || '—',
    // Beta tokens (only meaningful when hasBeta)
    BETA_VERSION: hasBeta ? betaVersion : '',
    BETA_WIN_URL: hasBeta && betaWin ? `${R2_PUBLIC_URL}/${betaWin.path}` : '',
    BETA_WIN_NAME: hasBeta && betaWin ? betaWin.path : '',
    BETA_DEB_URL: hasBeta && betaLinux ? `${R2_PUBLIC_URL}/${betaLinux.path}` : '',
    BETA_DEB_NAME: hasBeta && betaLinux ? betaLinux.path : '',
  };

  // 4. Parse changelog
  if (!fs.existsSync(CHANGELOG_PATH)) {
    console.error(`[web/build] ERROR: CHANGELOG.md not found at ${CHANGELOG_PATH}`);
    process.exit(1);
  }
  const changelogSrc = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const changelogVersions = parseChangelog(changelogSrc);
  const changelogBody = renderChangelogHTML(changelogVersions);

  // 5. Prepare dist/
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 6. Process and write each HTML page
  const pages = ['index', 'download', 'changelog'];
  let totalAssets = 0;

  for (const page of pages) {
    const templatePath = path.join(TEMPLATES_DIR, `${page}.html`);
    let html = fs.readFileSync(templatePath, 'utf8');

    // Inject changelog body before token substitution
    if (page === 'changelog') {
      html = html.replace('{{CHANGELOG_BODY}}', changelogBody);
    }

    // Handle beta region
    html = processBetaRegion(html, hasBeta);

    // Substitute tokens
    html = substitute(html, tokens);

    fs.writeFileSync(path.join(DIST_DIR, `${page}.html`), html, 'utf8');
  }

  // 7. Copy assets/ verbatim
  const assetsSource = path.join(TEMPLATES_DIR, 'assets');
  const assetsDest = path.join(DIST_DIR, 'assets');
  if (fs.existsSync(assetsSource)) {
    copyDirSync(assetsSource, assetsDest);
    const countFiles = (dir) => {
      let n = 0;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
      }
      return n;
    };
    totalAssets = countFiles(assetsDest);
  }

  // 8. Copy _headers verbatim
  const headersSource = path.join(TEMPLATES_DIR, '_headers');
  if (fs.existsSync(headersSource)) {
    fs.copyFileSync(headersSource, path.join(DIST_DIR, '_headers'));
  }

  // 9. Summary
  console.log(
    `[web/build] done — stable=${stableVersion}  beta=${hasBeta ? betaVersion : 'none'}  assets=${totalAssets}  pages=${pages.length}`,
  );
}

main().catch((err) => {
  console.error(`[web/build] FATAL: ${err.message}`);
  process.exit(1);
});
