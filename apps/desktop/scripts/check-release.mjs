/**
 * check-release.mjs
 *
 * Pre-release guard: validates that both package.json files and CHANGELOG.md
 * are in sync with the given version before a tag reaches CI.
 *
 * Usage:
 *   node scripts/check-release.mjs <version>
 *   node scripts/check-release.mjs 0.1.6
 *   node scripts/check-release.mjs v0.1.6   (leading 'v' stripped)
 *
 * Exits 0 if all checks pass; exits 1 on any failure.
 * Zero runtime dependencies — pure Node ESM.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(DESKTOP_DIR, '..', '..');

// ── Argument parsing ───────────────────────────────────────────────────────────

const rawArg = process.argv[2];

if (!rawArg) {
  console.error('[check-release] Usage: node scripts/check-release.mjs <version>');
  console.error('[check-release]   e.g. node scripts/check-release.mjs 0.1.6');
  process.exit(1);
}

const version = rawArg.trim().replace(/^v/, '');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Read + parse a JSON file; return the object. */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ── Checks ────────────────────────────────────────────────────────────────────

const failures = [];

// (a) Repo-root package.json .version
const rootPkgPath = path.join(REPO_ROOT, 'package.json');
const rootPkg = readJson(rootPkgPath);
if (rootPkg.version !== version) {
  failures.push(
    `[check-release] package.json version "${rootPkg.version}" != tag "${version}"`,
  );
}

// (b) apps/desktop/package.json .version
const desktopPkgPath = path.join(DESKTOP_DIR, 'package.json');
const desktopPkg = readJson(desktopPkgPath);
if (desktopPkg.version !== version) {
  failures.push(
    `[check-release] apps/desktop/package.json version "${desktopPkg.version}" != tag "${version}"`,
  );
}

// (c) CHANGELOG.md: heading present + section has at least one list item
const changelogPath = path.join(REPO_ROOT, 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');

// Escape dots for regex so e.g. "0.1.6" doesn't match "0X1Y6".
const escapedVersion = version.replace(/\./g, '\\.');

// Find the exact heading line: ## [<version>] (optionally followed by date).
const headingRe = new RegExp(`^## \\[${escapedVersion}\\]`, 'm');

if (!headingRe.test(changelog)) {
  failures.push(
    `[check-release] CHANGELOG.md missing heading "## [${version}]"`,
  );
} else {
  // Extract the section body between this heading and the next ## heading.
  const sectionRe = new RegExp(
    `## \\[${escapedVersion}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`,
  );
  const sectionMatch = changelog.match(sectionRe);
  const sectionBody = sectionMatch ? sectionMatch[1] : '';

  // Require at least one list item (- or *).
  const hasListItem = /^[-*] /m.test(sectionBody);
  if (!hasListItem) {
    failures.push(
      `[check-release] CHANGELOG.md section "[${version}]" has no list items (would render "No changelog entries")`,
    );
  }
}

// ── Result ────────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  for (const msg of failures) {
    console.error(msg);
  }
  process.exit(1);
}

console.log(`[check-release] OK: ${version}`);
