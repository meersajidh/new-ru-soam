/**
 * Unit tests for backup.ts (ADR-308 §2).
 * Uses node:test + node:assert. Run with:
 *   node --experimental-strip-types --test electron/main/store/backup.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildBackupPath,
  listBackups,
  createPreMigrationBackup,
} from './backup.ts';
import type { AuditEntry } from '../audit/audit-types.ts';

// ── buildBackupPath ────────────────────────────────────────────────────────────

test('buildBackupPath produces expected path', () => {
  const result = buildBackupPath('/home/user/.config/ru-soam/db/data.db', 3, 1700000000000);
  assert.equal(
    result,
    '/home/user/.config/ru-soam/db/data.db.backup-v3-1700000000000',
  );
});

// ── listBackups ────────────────────────────────────────────────────────────────

test('listBackups returns empty array when dir has no backups', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    const result = listBackups(dbPath);
    assert.deepEqual(result, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('listBackups finds backup files and sorts ascending', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    // Create backups out of order.
    const b2 = path.join(tmpDir, 'data.db.backup-v2-1700000002000');
    const b1 = path.join(tmpDir, 'data.db.backup-v1-1700000001000');
    const b3 = path.join(tmpDir, 'data.db.backup-v3-1700000003000');
    for (const f of [b2, b1, b3]) fs.writeFileSync(f, '');

    const result = listBackups(dbPath);
    assert.deepEqual(result, [b1, b2, b3]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('listBackups sorts by timestamp, not schema version (two-digit schema)', () => {
  // Regression: lexicographic sort mis-orders "v10" before "v2".
  // Timestamps must be the ordering key regardless of schema-version digit count.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    // v10 with an OLDER timestamp than v2 — must still sort first (oldest first).
    const older = path.join(tmpDir, 'data.db.backup-v10-1700000001000');
    const newer = path.join(tmpDir, 'data.db.backup-v2-1700000002000');
    for (const f of [newer, older]) fs.writeFileSync(f, '');

    const result = listBackups(dbPath);
    assert.deepEqual(result, [older, newer], 'older timestamp must come first regardless of schema version');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('listBackups ignores non-backup files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    fs.writeFileSync(path.join(tmpDir, 'data.db'), '');
    fs.writeFileSync(path.join(tmpDir, 'data.db-shm'), '');
    fs.writeFileSync(path.join(tmpDir, 'data.db-wal'), '');
    fs.writeFileSync(path.join(tmpDir, 'data.db.backup-v1-1700000001000'), '');

    const result = listBackups(dbPath);
    assert.equal(result.length, 1);
    assert.ok(result[0]!.endsWith('data.db.backup-v1-1700000001000'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── createPreMigrationBackup ───────────────────────────────────────────────────

test('createPreMigrationBackup: byte-for-byte copy of source file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    const content = Buffer.from('synthetic-db-content-abc123');
    fs.writeFileSync(dbPath, content);

    const emitted: AuditEntry[] = [];
    const result = createPreMigrationBackup(dbPath, 2, (e) => emitted.push(e));

    // Backup file exists with identical content.
    assert.ok(fs.existsSync(result.path), 'backup file must exist');
    const backupContent = fs.readFileSync(result.path);
    assert.ok(backupContent.equals(content), 'backup must be byte-for-byte copy');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPreMigrationBackup: emits update.backup.created audit entry', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    fs.writeFileSync(dbPath, 'content');

    const emitted: AuditEntry[] = [];
    const result = createPreMigrationBackup(dbPath, 1, (e) => emitted.push(e));

    const created = emitted.find((e) => e.event === 'update.backup.created');
    assert.ok(created, 'must emit update.backup.created');
    assert.equal(created!.detail!['path'], result.path);
    assert.equal(created!.detail!['fromSchema'], 1);
    assert.ok(typeof created!.detail!['byteSize'] === 'number');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPreMigrationBackup: rotates to MAX_BACKUPS=3, emits update.backup.rotated', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    fs.writeFileSync(dbPath, 'content');

    // Pre-create 3 existing backups (will result in 4 total after new one; rotate oldest 1).
    const now = Date.now();
    for (let i = 1; i <= 3; i++) {
      fs.writeFileSync(
        path.join(tmpDir, `data.db.backup-v${i}-${now - (4 - i) * 1000}`),
        'old',
      );
    }

    const emitted: AuditEntry[] = [];
    createPreMigrationBackup(dbPath, 4, (e) => emitted.push(e));

    // After backup: exactly 3 backup files on disk.
    const remaining = listBackups(dbPath);
    assert.equal(remaining.length, 3, 'only 3 backups must remain after rotation');

    // At least one update.backup.rotated event emitted.
    const rotated = emitted.filter((e) => e.event === 'update.backup.rotated');
    assert.ok(rotated.length >= 1, 'must emit at least one update.backup.rotated');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPreMigrationBackup: does NOT rotate when below MAX_BACKUPS', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'data.db');
    fs.writeFileSync(dbPath, 'content');

    // 2 existing — after new one = 3 total, no rotation needed.
    const now = Date.now();
    for (let i = 1; i <= 2; i++) {
      fs.writeFileSync(
        path.join(tmpDir, `data.db.backup-v${i}-${now - (3 - i) * 1000}`),
        'old',
      );
    }

    const emitted: AuditEntry[] = [];
    createPreMigrationBackup(dbPath, 3, (e) => emitted.push(e));

    const remaining = listBackups(dbPath);
    assert.equal(remaining.length, 3, '3 backups — no rotation needed');

    const rotated = emitted.filter((e) => e.event === 'update.backup.rotated');
    assert.equal(rotated.length, 0, 'no rotation events when at exactly MAX_BACKUPS');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPreMigrationBackup: throws when source file does not exist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ru-soam-test-'));
  try {
    const dbPath = path.join(tmpDir, 'nonexistent.db');
    assert.throws(
      () => createPreMigrationBackup(dbPath, 1, () => {}),
      (err: unknown) => err instanceof Error,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
