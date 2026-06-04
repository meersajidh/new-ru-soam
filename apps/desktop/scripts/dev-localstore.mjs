/**
 * dev-localstore.mjs — DEV-ONLY local-store inspection helper.
 *
 * Reads the per-workspace local-store DB key from the app's safeStorage-backed
 * credential store and either prints the connection details or runs SQL
 * directly against the encrypted DB. The raw key never leaves the privileged
 * Electron main/node zone (unlike a renderer UI reveal) — this script IS that
 * zone.
 *
 * Crypto note: the DB is encrypted by better-sqlite3-multiple-ciphers using the
 * library DEFAULT scheme `chacha20` (sqleet-compatible) — NOT SQLCipher. Inspect
 * externally with a chacha20-capable shell (`sqlite3mc`), never `sqlcipher`.
 * The DB key is sealed by Electron safeStorage (OS keyring), independent of the
 * workspace passphrase — so no passphrase is needed (or accepted) here.
 *
 * MUST run under Electron, not plain node:
 *   - safeStorage is an Electron API (decrypt is tied to app identity).
 *   - better-sqlite3 native binding is built for the Electron ABI.
 *
 * Usage (from apps/desktop). `--no-sandbox` is needed unless chrome-sandbox is
 * setuid-root in your checkout:
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs --list
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id>          # info (path + hex)
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --info
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --tables # list tables
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --sql "SELECT * FROM prefs"
 *
 * Dev-only: refuses to run in a packaged build (app.isPackaged).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { app, safeStorage } from 'electron';

const DB_KEY_TYPE = 'local-store-db-key';

function die(msg) {
  console.error(`[dev-localstore] ${msg}`);
  app.exit(1);
}

/** Parse argv (after the script path) into { target, mode, sql }. */
function parseArgs(argv) {
  // argv layout varies (electron switches like --no-sandbox shift positions),
  // so slice after this script's own path rather than a fixed index.
  const selfIdx = argv.findIndex((a) => a.endsWith('dev-localstore.mjs'));
  const args = argv.slice(selfIdx >= 0 ? selfIdx + 1 : 2);
  let target = null;
  let mode = 'info';
  let sql = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--list') {
      mode = 'list';
    } else if (a === '--info') {
      mode = 'info';
    } else if (a === '--tables') {
      mode = 'sql';
      sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    } else if (a === '--sql') {
      mode = 'sql';
      sql = args[++i] ?? null;
    } else if (!a.startsWith('--') && target === null) {
      target = a;
    }
  }
  return { target, mode, sql };
}

/** Read all workspaces as [{ id, nickname }] from $userData/workspaces/<id>/meta.json. */
function listWorkspaces(userData) {
  const root = path.join(userData, 'workspaces');
  let ids = [];
  try {
    ids = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    let nickname = '(no meta)';
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(root, id, 'meta.json'), 'utf8'));
      nickname = meta.nickname ?? nickname;
    } catch {
      /* leave default */
    }
    out.push({ id, nickname });
  }
  return out;
}

/** Resolve a target (exact id, else case-insensitive nickname) to a workspace. */
function resolveWorkspace(workspaces, target) {
  const byId = workspaces.find((w) => w.id === target);
  if (byId) return byId;
  const lc = target.toLowerCase();
  const byNick = workspaces.filter((w) => w.nickname.toLowerCase() === lc);
  if (byNick.length === 1) return byNick[0];
  if (byNick.length > 1) {
    die(`ambiguous name "${target}" — matches ${byNick.length} workspaces; pass the id instead.`);
  }
  return null;
}

/** Decrypt the raw local-store DB key for a workspace. Returns a Buffer or null. */
function readDbKey(userData, workspaceId) {
  const storePath = path.join(userData, 'credentials', 'store.json');
  let map;
  try {
    map = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    return null;
  }
  const encoded = map[`ru-soam.${workspaceId}.${DB_KEY_TYPE}`];
  if (!encoded) return null;
  // store.json holds base64(safeStorage-encrypted(base64(rawKey)))
  const decryptedB64 = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  return Buffer.from(decryptedB64, 'base64');
}

function dbPathFor(userData, workspaceId) {
  return path.join(userData, 'workspaces', workspaceId, 'local-store.db');
}

async function main() {
  // app.setName must match electron/main/index.ts so userData + safeStorage
  // identity resolve to the same place the real app uses.
  app.setName('Ru-Soam');
  await app.whenReady();

  if (app.isPackaged) {
    die('refusing to run in a packaged build (dev-only tool).');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    die('safeStorage unavailable — start a keyring daemon (gnome-keyring/kwallet) in this session.');
  }

  const userData = app.getPath('userData');
  const { target, mode, sql } = parseArgs(process.argv);
  const workspaces = listWorkspaces(userData);

  if (mode === 'list' || target === null) {
    if (workspaces.length === 0) {
      console.log(`No workspaces found under ${path.join(userData, 'workspaces')}`);
    } else {
      console.log(`Workspaces under ${userData}:\n`);
      for (const w of workspaces) console.log(`  ${w.nickname.padEnd(24)} ${w.id}`);
      if (target === null && mode !== 'list') {
        console.log('\nPass a name or id to inspect: --info | --tables | --sql "<query>"');
      }
    }
    return app.exit(0);
  }

  const ws = resolveWorkspace(workspaces, target);
  if (!ws) die(`no workspace matching "${target}" — run with --list to see options.`);

  const dbPath = dbPathFor(userData, ws.id);
  if (!fs.existsSync(dbPath)) die(`DB not found: ${dbPath}`);

  const key = readDbKey(userData, ws.id);
  if (!key) die(`no DB key in credential store for ${ws.id} (decrypt failed or absent).`);
  const hex = key.toString('hex');

  if (mode === 'info') {
    console.log(`workspace : ${ws.nickname} (${ws.id})`);
    console.log(`db path   : ${dbPath}`);
    console.log(`db key hex: ${hex}`);
    console.log(`\nInspect with sqlite3mc (NOT sqlcipher):`);
    console.log(`  sqlite3mc "${dbPath}"`);
    console.log(`  sqlite> PRAGMA key = "x'${hex}'";`);
    console.log(`  sqlite> .tables`);
    return app.exit(0);
  }

  // mode === 'sql' — open + run via the app's own multiple-ciphers binding
  // (guaranteed cipher match; native ABI matches because we're under Electron).
  if (!sql) die('--sql requires a query string.');
  // npm-aliased to better-sqlite3-multiple-ciphers; require via createRequire
  // since this is ESM and the binding is CJS.
  const Database = createRequire(import.meta.url)('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma(`key = "x'${hex}'"`);
    db.pragma('foreign_keys = ON');
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      console.log(JSON.stringify(stmt.all(), null, 2));
    } else {
      die('only read-only queries are allowed (this tool opens the DB read-only).');
    }
  } finally {
    db.close();
    key.fill(0);
  }
  return app.exit(0);
}

main().catch((err) => {
  console.error('[dev-localstore]', err);
  app.exit(1);
});
