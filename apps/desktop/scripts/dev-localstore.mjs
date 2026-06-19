/**
 * dev-localstore.mjs — DEV-ONLY local-store + protected-store inspection helper.
 *
 * Reads per-workspace DB keys and either prints connection details or runs SQL
 * directly against the encrypted DB. The raw key never leaves the privileged
 * Electron main/node zone — this script IS that zone.
 *
 * --- OPERATIONAL STORE (default) ---
 * DB: $userData/workspaces/<id>/local-store.db
 * Key source: Electron safeStorage (OS keyring) — independent of passphrase.
 *   No passphrase needed or accepted.
 *
 * --- PROTECTED STORE (--protected) ---
 * DB: $userData/workspaces/<id>/protected-store.db
 * Key source: KEK-wrapped (ADR-307). Unlock chain:
 *   passphrase → Argon2id → wrapKey → unwrap KEK (from lock.json) → unwrap
 *   protected-store cipher key (from protected-store.key.json).
 *
 * Passphrase sourcing order (--protected only):
 *   1. --passphrase <pp> flag
 *   2. Environment variable RU_SOAM_DEV_PASSPHRASE
 *   3. If workspace id == dev UUID (00000000-0000-4dev-8000-000000000000),
 *      use the known dev constant: dev-passphrase-12+
 *   4. else die() — prefer env var (avoids shell-history leak).
 *
 * Crypto note: DBs use better-sqlite3-multiple-ciphers DEFAULT scheme
 * `chacha20` (sqleet-compatible) — NOT SQLCipher. Inspect externally with
 * sqlite3mc, never sqlcipher.
 *
 * MUST run under Electron, not plain node (safeStorage + native ABI).
 *
 * Usage (from apps/desktop):
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs --list
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id>
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --info
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --tables
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --sql "SELECT * FROM prefs"
 *
 * Protected store modes (--protected):
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --protected --info
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --protected --tables
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --protected --sql "SELECT id, given_name, status FROM patients"
 *   pnpm exec electron --no-sandbox scripts/dev-localstore.mjs <name|id> --protected --passphrase <pp> --info
 *
 * Dev-only: refuses to run in a packaged build (app.isPackaged).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createDecipheriv } from 'node:crypto';
import { createRequire } from 'node:module';
import { app, safeStorage } from 'electron';

// Named `requireCjs` (not `require`) so it doesn't shadow the ambient Node
// `require` global — a module-scope `const require` trips TS `noUnusedLocals`.
const requireCjs = createRequire(import.meta.url);

const DB_KEY_TYPE = 'local-store-db-key';
const DEV_WORKSPACE_ID = '00000000-0000-4dev-8000-000000000000';
const DEV_PASSPHRASE = 'dev-passphrase-12+';

function die(msg) {
  console.error(`[dev-localstore] ${msg}`);
  app.exit(1);
}

// ── CLI parsing ───────────────────────────────────────────────────────────────

/** Parse argv (after the script path) into { target, mode, sql, protected, passphrase }. */
function parseArgs(argv) {
  // argv layout varies (electron switches like --no-sandbox shift positions),
  // so slice after this script's own path rather than a fixed index.
  const selfIdx = argv.findIndex((a) => a.endsWith('dev-localstore.mjs'));
  const args = argv.slice(selfIdx >= 0 ? selfIdx + 1 : 2);
  let target = null;
  let mode = 'info';
  let sql = null;
  let useProtected = false;
  let passphrase = null;
  let exec = false;
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
    } else if (a === '--protected') {
      useProtected = true;
    } else if (a === '--exec') {
      exec = true;
    } else if (a === '--passphrase') {
      passphrase = args[++i] ?? null;
    } else if (!a.startsWith('--') && target === null) {
      target = a;
    }
  }
  return { target, mode, sql, useProtected, passphrase, exec };
}

// ── Workspace helpers ─────────────────────────────────────────────────────────

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

// ── Operational DB key (safeStorage) ─────────────────────────────────────────

/** Decrypt the raw local-store DB key for a workspace. Returns a Buffer or null. */
function readOperationalDbKey(userData, workspaceId) {
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

// ── Protected DB key (KEK-wrapped) ───────────────────────────────────────────

/**
 * Inline AES-256-GCM decrypt helper.
 * Envelope shape: { v, alg, nonce, ciphertext, tag, aad } — all binary fields base64.
 * Uses the envelope's own stored aad directly (no canonical-JSON reconstruction).
 * Throws on auth-tag failure (wrong key / tampered data).
 */
function aeadDecryptEnvelope(keyBuf, envelope) {
  const nonce = Buffer.from(envelope.nonce, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const aad = Buffer.from(envelope.aad, 'base64');
  const d = createDecipheriv('aes-256-gcm', keyBuf, nonce);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ciphertext), d.final()]);
}

const CANARY_PLAINTEXT = Buffer.from('ru-soam-kek-canary-v1', 'utf8');

/**
 * Resolve the passphrase for the protected store.
 * Order: --passphrase flag → RU_SOAM_DEV_PASSPHRASE env → dev-UUID constant → die.
 */
function resolvePassphrase(workspaceId, passphraseFlag) {
  if (passphraseFlag) return passphraseFlag;
  if (process.env.RU_SOAM_DEV_PASSPHRASE) return process.env.RU_SOAM_DEV_PASSPHRASE;
  if (workspaceId === DEV_WORKSPACE_ID) return DEV_PASSPHRASE;
  die(
    'passphrase required for protected store.\n' +
    '  Options (in order of preference):\n' +
    '    export RU_SOAM_DEV_PASSPHRASE=<pp>   (avoids shell-history leak)\n' +
    '    --passphrase <pp>\n' +
    '  For the dev workspace the constant is used automatically.',
  );
}

/**
 * Derive the protected-store cipher key for a workspace.
 * Implements the full KEK chain: passphrase → Argon2id wrapKey → KEK → protected key.
 * Returns { protectedKey: Buffer }; caller MUST zero protectedKey in a finally block.
 * @param {string} userData
 * @param {string} workspaceId
 * @param {string} passphrase
 */
async function deriveProtectedKey(userData, workspaceId, passphrase) {
  // Step 2: read lock.json
  const lockPath = path.join(userData, 'workspaces', workspaceId, 'lock.json');
  if (!fs.existsSync(lockPath)) {
    die('lock.json not found — workspace setup incomplete (passphrase/KEK not yet provisioned).');
  }
  let lockJson;
  try {
    lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    die('lock.json is not valid JSON.');
  }
  const { salt_p, wrapped_KEK_passphrase, verifier } = lockJson;
  if (!salt_p || !wrapped_KEK_passphrase || !verifier) {
    die('lock.json missing required fields (salt_p / wrapped_KEK_passphrase / verifier).');
  }

  // Step 6: read protected-store.key.json
  const keyFilePath = path.join(userData, 'workspaces', workspaceId, 'protected-store.key.json');
  if (!fs.existsSync(keyFilePath)) {
    die(
      'no protected store for this workspace (no protected-residency tables declared, or ' +
      'never unlocked since O452-A).',
    );
  }
  let keyFileEnvelope;
  try {
    keyFileEnvelope = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  } catch {
    die('protected-store.key.json is not valid JSON.');
  }

  // Step 3: derive wrapKey (Argon2id)
  // @node-rs/argon2 is CJS; load via createRequire.
  const argon2 = requireCjs('@node-rs/argon2');
  let wrapKey = null;
  let kek = null;
  let protectedKey = null;
  try {
    const saltBuf = Buffer.from(salt_p, 'base64');
    wrapKey = await argon2.hashRaw(passphrase, {
      salt: saltBuf,
      memoryCost: 65536, // 64 MiB in KiB
      timeCost: 3,
      parallelism: 1,
      outputLen: 32,
    });

    // Step 4: unwrap KEK
    try {
      kek = aeadDecryptEnvelope(wrapKey, wrapped_KEK_passphrase);
    } catch {
      die('bad passphrase (KEK unwrap failed).');
    }

    // Step 5: canary check
    let canary;
    try {
      canary = aeadDecryptEnvelope(kek, verifier);
    } catch {
      die('bad passphrase (KEK verification failed — canary decrypt threw).');
    }
    if (!canary.equals(CANARY_PLAINTEXT)) {
      die('bad passphrase (KEK verification failed — canary mismatch).');
    }
    canary.fill(0);

    // Step 7: unwrap protected-store key
    try {
      protectedKey = aeadDecryptEnvelope(kek, keyFileEnvelope);
    } catch {
      die('protected-store.key.json decrypt failed (KEK correct but key file tampered?).');
    }

    return protectedKey;
  } finally {
    if (wrapKey) wrapKey.fill(0);
    if (kek) kek.fill(0);
    // protectedKey is intentionally NOT zeroed here — caller owns it
  }
}

// ── Shared DB open + run ──────────────────────────────────────────────────────

/**
 * Open DB at dbPath read-only with the given keyHex, run mode (info | sql),
 * then close. Zeros keyBuf in a finally block.
 *
 * @param {{ nickname: string, id: string }} ws
 * @param {string} dbPath
 * @param {Buffer} keyBuf   - raw 32-byte key; WILL be zeroed in finally
 * @param {string} mode     - 'info' | 'sql'
 * @param {string|null} sql - required when mode === 'sql'
 * @param {string} label    - 'operational' | 'protected' (for display)
 */
function runDbMode(ws, dbPath, keyBuf, mode, sql, label, exec = false) {
  const hex = keyBuf.toString('hex');
  try {
    if (mode === 'info') {
      console.log(`workspace : ${ws.nickname} (${ws.id})`);
      console.log(`store     : ${label}`);
      console.log(`db path   : ${dbPath}`);
      console.log(`db key hex: ${hex}`);
      console.log(`\nInspect with sqlite3mc (NOT sqlcipher):`);
      console.log(`  sqlite3mc "${dbPath}"`);
      console.log(`  sqlite> PRAGMA key = "x'${hex}'";`);
      console.log(`  sqlite> .tables`);
      return;
    }

    // mode === 'sql'
    if (!sql) die('--sql requires a query string.');
    if (!fs.existsSync(dbPath)) {
      if (label === 'protected') {
        die(
          'protected-store.db not found — unlock the workspace in the app at least once ' +
          'to provision it.',
        );
      }
      die(`DB not found: ${dbPath}`);
    }
    const Database = requireCjs('better-sqlite3');
    const db = new Database(dbPath, { readonly: !exec, fileMustExist: true });
    try {
      db.pragma(`key = "x'${hex}'"`);
      db.pragma('foreign_keys = ON');
      const stmt = db.prepare(sql);
      if (stmt.reader) {
        console.log(JSON.stringify(stmt.all(), null, 2));
      } else if (exec) {
        const info = stmt.run();
        console.log(JSON.stringify({ changes: info.changes }, null, 2));
      } else {
        die('only read-only queries are allowed by default — pass --exec to run a write.');
      }
    } finally {
      db.close();
    }
  } finally {
    keyBuf.fill(0);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

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
  const { target, mode, sql, useProtected, passphrase: passphraseFlag, exec } =
    parseArgs(process.argv);
  const workspaces = listWorkspaces(userData);

  if (mode === 'list' || target === null) {
    if (workspaces.length === 0) {
      console.log(`No workspaces found under ${path.join(userData, 'workspaces')}`);
    } else {
      console.log(`Workspaces under ${userData}:\n`);
      for (const w of workspaces) console.log(`  ${w.nickname.padEnd(24)} ${w.id}`);
      if (target === null && mode !== 'list') {
        console.log('\nPass a name or id to inspect: --info | --tables | --sql "<query>"');
        console.log('Add --protected to inspect the KEK-gated clinical PHI store.');
      }
    }
    return app.exit(0);
  }

  const ws = resolveWorkspace(workspaces, target);
  if (!ws) die(`no workspace matching "${target}" — run with --list to see options.`);

  if (useProtected) {
    // Protected store path: KEK-wrapped key, passphrase required.
    const dbPath = path.join(userData, 'workspaces', ws.id, 'protected-store.db');

    // --info doesn't require DB to exist (prints path + key hex).
    // For sql mode, existence is checked inside runDbMode.
    if (mode === 'sql' && !fs.existsSync(dbPath)) {
      die(
        'protected-store.db not found — unlock the workspace in the app at least once ' +
        'to provision it.',
      );
    }

    const pp = resolvePassphrase(ws.id, passphraseFlag);
    let protectedKey = null;
    try {
      protectedKey = await deriveProtectedKey(userData, ws.id, pp);
      runDbMode(ws, dbPath, protectedKey, mode, sql, 'protected', exec);
      protectedKey = null; // zeroed inside runDbMode
    } finally {
      if (protectedKey) protectedKey.fill(0);
    }
  } else {
    // Operational store: raw safeStorage key.
    const dbPath = path.join(userData, 'workspaces', ws.id, 'local-store.db');
    if (!fs.existsSync(dbPath)) die(`DB not found: ${dbPath}`);

    const key = readOperationalDbKey(userData, ws.id);
    if (!key) die(`no DB key in credential store for ${ws.id} (decrypt failed or absent).`);

    runDbMode(ws, dbPath, key, mode, sql, 'operational', exec);
    // key is zeroed inside runDbMode
  }

  return app.exit(0);
}

main().catch((err) => {
  console.error('[dev-localstore]', err);
  app.exit(1);
});
