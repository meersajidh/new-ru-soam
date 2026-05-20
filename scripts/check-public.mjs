#!/usr/bin/env node
// Fails the build/precommit if apps/desktop/public/ contains files that
// would ship into dist/renderer/ unintentionally.
//
// Vite copies everything under public/ verbatim. .html / .md / source SVGs
// belong in docs/References/ or src/assets/, not public/.
//
// Edit ALLOWED if you legitimately need to ship a new file type from public/.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PUBLIC_DIR = join(ROOT, 'apps/desktop/public');

// Extensions that are OK to ship from public/.
const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif',
  '.svg',
  '.ico', '.icns',
  '.woff', '.woff2', '.ttf', '.otf',
  '.json',
  '.txt',
]);

// Specific paths permitted regardless of extension (relative to public/).
const ALLOWED_PATHS = new Set([
  // 'icon/master/index.html',  // example: uncomment to whitelist a single doc
]);

const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(PUBLIC_DIR, full).split(sep).join('/');
    if (ALLOWED_PATHS.has(rel)) continue;
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
    if (!ALLOWED_EXT.has(ext)) {
      violations.push(rel);
    }
  }
}

walk(PUBLIC_DIR);

if (violations.length > 0) {
  console.error('check:public — disallowed files under apps/desktop/public/:');
  for (const v of violations) console.error('  ' + v);
  console.error(
    '\nFiles under public/ are copied verbatim into dist/. Move documentation,' +
    '\nHTML previews, and source-only assets out of public/ or whitelist them' +
    '\nin scripts/check-public.mjs.',
  );
  process.exit(1);
}
console.log('check:public — ok');
