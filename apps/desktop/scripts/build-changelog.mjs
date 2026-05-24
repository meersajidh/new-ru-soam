/**
 * build-changelog.mjs
 *
 * Parses CHANGELOG.md (Keep a Changelog format) and emits:
 *   - apps/desktop/changelog.json  (last 10 versions, bundled into the app)
 *   - apps/desktop/release-notes-<version>.md  (only with --release=<version>)
 *
 * Usage:
 *   node scripts/build-changelog.mjs
 *   node scripts/build-changelog.mjs --release=0.1.0
 *
 * Zero runtime dependencies — pure Node ESM.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(DESKTOP_DIR, '..', '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const OUTPUT_JSON = path.join(DESKTOP_DIR, 'changelog.json');

/** Max versions to include in changelog.json. */
const MAX_VERSIONS = 10;

// ── Argument parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let releaseVersion = null;

for (const arg of args) {
  const m = arg.match(/^--release=(.+)$/);
  if (m) {
    releaseVersion = m[1].trim().replace(/^v/, '');
  }
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Parse a Keep-a-Changelog formatted CHANGELOG.md.
 *
 * Returns an array of version blocks (excluding [Unreleased]) sorted newest-first.
 * Each block: { version: string, date: string | null, entries: Array<{kind, text}> }
 *
 * Handles:
 *   - `## [Unreleased]`
 *   - `## [1.2.3] - 2026-01-01`
 *   - Pre-release suffixes like `## [1.2.3-beta.1] - 2026-01-01`
 *   - Sub-sections: `### Added`, `### Changed`, `### Fixed`, etc.
 */
function parseChangelog(src) {
  const lines = src.split('\n');
  const versions = [];
  let current = null;
  let currentKind = 'Changed';

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Version heading: ## [x.y.z] - date  or  ## [Unreleased]
    const versionMatch = line.match(/^## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/);
    if (versionMatch) {
      if (current) versions.push(current);
      const version = versionMatch[1];
      if (version.toLowerCase() === 'unreleased') {
        current = null;
        continue;
      }
      current = {
        version,
        date: versionMatch[2] ?? null,
        entries: [],
      };
      currentKind = 'Changed';
      continue;
    }

    if (!current) continue;

    // Sub-section heading: ### Added / Changed / Fixed / etc.
    const kindMatch = line.match(/^### (.+)/);
    if (kindMatch) {
      currentKind = kindMatch[1].trim();
      continue;
    }

    // List item
    const itemMatch = line.match(/^[-*]\s+(.+)/);
    if (itemMatch) {
      current.entries.push({ kind: currentKind, text: itemMatch[1].trim() });
    }
  }
  if (current) versions.push(current);

  return versions;
}

// ── Render release notes ───────────────────────────────────────────────────────

/**
 * Render a single version block as Markdown for use as a GH Release body.
 */
function renderReleaseNotes(block) {
  const header = `## ${block.version}${block.date ? ` — ${block.date}` : ''}`;
  if (block.entries.length === 0) return `${header}\n\nNo changelog entries.\n`;

  // Group entries by kind.
  const groups = new Map();
  for (const entry of block.entries) {
    if (!groups.has(entry.kind)) groups.set(entry.kind, []);
    groups.get(entry.kind).push(entry.text);
  }

  const sections = [];
  for (const [kind, texts] of groups) {
    sections.push(`### ${kind}\n\n${texts.map((t) => `- ${t}`).join('\n')}`);
  }

  return `${header}\n\n${sections.join('\n\n')}\n`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(CHANGELOG_PATH)) {
  console.error(`[build-changelog] CHANGELOG.md not found at: ${CHANGELOG_PATH}`);
  process.exit(1);
}

const src = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const versions = parseChangelog(src);

if (versions.length === 0) {
  console.warn('[build-changelog] no version entries found in CHANGELOG.md');
}

// Emit changelog.json — last MAX_VERSIONS entries.
const jsonVersions = versions.slice(0, MAX_VERSIONS);
const json = JSON.stringify({ versions: jsonVersions }, null, 2);
fs.writeFileSync(OUTPUT_JSON, json, 'utf8');
console.log(`[build-changelog] wrote ${OUTPUT_JSON} (${jsonVersions.length} versions)`);

// Emit release-notes-<version>.md if --release flag provided.
if (releaseVersion) {
  const block = versions.find((v) => v.version === releaseVersion);
  if (!block) {
    console.error(
      `[build-changelog] version "${releaseVersion}" not found in CHANGELOG.md. ` +
        `Available: ${versions.map((v) => v.version).join(', ')}`,
    );
    process.exit(1);
  }
  const notes = renderReleaseNotes(block);
  const notesPath = path.join(DESKTOP_DIR, `release-notes-${releaseVersion}.md`);
  fs.writeFileSync(notesPath, notes, 'utf8');
  console.log(`[build-changelog] wrote ${notesPath}`);
}
