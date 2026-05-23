# Update-time data integrity

**ID:** ADR-308
**Status:** Accepted
**Date:** 2026-05-22
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-204, ADR-301, ADR-302, ADR-303, ADR-306, ADR-307, ADR-502

## Context

ADR-204 commits the platform to a roll-forward auto-update channel. ADR-302 commits the local-first SQLCipher store as the home of clinical data, with schema changes carried by migrations. ADR-301 commits PHI to never leave the device in plaintext. Together these create a specific risk: a user updates the app, the new binary opens the old database, runs migrations, and during that window something can corrupt or delete the user's data — PHI or otherwise — by mistake.

The risk does not come from binary replacement itself. `electron-builder`-produced installers (NSIS on Windows, `.deb` on Linux) write only into the install directory (`Program Files\Ru-Soam\` / `/opt/Ru-Soam/`). User data lives in the OS app-data directory (`%APPDATA%\Ru-Soam\` / `~/.config/ru-soam/`). The installer never opens those paths. So the binary swap is safe by construction.

The risk lives in three other places:

1. **Schema migration on first launch of the new binary.** A bug in the new version's migration code (a wrong `UPDATE`, a destructive `DROP`, an aborted partial migration left in a half-state) is the realistic data-loss vector. Roll-forward only (ADR-204) means a user who is bitten cannot trivially go back to the old binary and re-open the un-migrated DB.
2. **Update-time concurrency.** If the app installs an update while a write is in flight, or while the WAL has un-checkpointed pages, the next binary can find the DB in a state it did not expect.
3. **Uninstall / reinstall semantics.** Any installer-side script that touches the user-data directory — deliberately or by mistake — is catastrophic. The default `electron-builder` behaviour is safe; the risk is that a future config change quietly changes it.

ADR-204's "Open Items" already names migration policy (O177) but treats it as a discipline note. That is insufficient: the policy is load-bearing for clinical-grade data safety and deserves its own decision record. ADR-303 (E2EE sync) and ADR-306 (recovery flows) will both lean on the invariants committed here.

The decision must hold under the constraint that the application is local-first (ADR-302) — there is no server to authoritatively restore from, no cloud snapshot to roll back to. The device's own backup is the only safety net for the time between a migration running and a fix shipping.

## Decision

The platform commits a layered safety stack around update-time data integrity. Each layer is independently sufficient against a specific failure mode; the combination removes most single-fault loss scenarios.

### 1. Installer-side invariants (the easy half)

- **Installers touch only install directory.** Default `electron-builder` behaviour. Locked in by config:
  - `nsis.deleteAppDataOnUninstall: false`
  - `nsis.allowToChangeInstallationDirectory: true` (user picks install path; data path is independent of install path)
  - No custom NSIS scripts that read or write under `%APPDATA%`.
  - No custom `.deb` `postinst` / `postrm` / `prerm` scripts that read or write under `~/.config/ru-soam/` or `~/.local/share/ru-soam/`.
- **Reinstall is idempotent w.r.t. data.** Installing the same version on top of itself, installing a newer version, and reinstalling after uninstall must all leave the user-data directory unchanged.
- **Test gate.** A CI smoke test installs v1, fingerprints (SHA-256) every file under the user-data directory, upgrades to v2 without first launching v2, fingerprints again, and asserts equality. This test is mandatory on every release pipeline.

### 2. Pre-migration backup (the load-bearing half)

Before any migration runs, the app copies the current SQLCipher file to a sibling backup:

```
<data-dir>/db/data.db
<data-dir>/db/data.db.backup-v<from-schema>-<unix-timestamp>
```

Properties:

- The copy is byte-for-byte. The file remains SQLCipher-encrypted with the same key. PHI never leaves the device unencrypted at any point during this operation (ADR-301).
- The copy happens **before** the migration transaction opens. If the copy fails (disk full, IO error), migration does not run and the app surfaces an error.
- Backups are retained for the last **N = 3** schema upgrades. Older ones are rotated out only after the new schema has been opened successfully at least once.
- The backup file path is recorded in the audit ledger (ADR-502) — both the create event and the rotate-out event.

Recovery: if migration fails or the new version is later found to corrupt data, the user (or a support flow) can restore by copying the backup back to `data.db`. The downgrade is an explicit, audited action — not an in-app feature, but a documented support path. This is the only escape from a bad migration under roll-forward (ADR-204).

### 3. Migrations run inside a single transaction

Every migration is wrapped in:

```sql
BEGIN IMMEDIATE;
  -- DDL + data transforms for this version step
  PRAGMA user_version = <new>;
COMMIT;
```

SQLite (and SQLCipher) make DDL transactional. Consequences:

- Crash, power loss, OOM, or an uncaught exception mid-migration triggers a full rollback on next open. The DB is either at the pre-migration version or fully at the post-migration version; no in-between state exists on disk.
- `PRAGMA user_version` is updated **only as the last statement before `COMMIT`**. This is what makes "did the migration succeed" a single atomic question.

Multi-step migrations (vN → vN+2 → vN+3) run each step in its own transaction. Failure on step 2 leaves the DB at vN+1 with the corresponding backup-vN file on disk for support to restore from.

### 4. Schema version gates

On opening the DB, the app compares the on-disk `user_version` against its compiled-in `[minSupportedSchema, maxSupportedSchema]` window:

| Comparison | Action |
| --- | --- |
| `disk == max` | Open. No migration. |
| `min ≤ disk < max` | Run migrations forward in order. |
| `disk < min` | Refuse to open. Surface a "this database was written by a too-old version; install the intermediate version first" error. Audit-logged. |
| `disk > max` | Refuse to open. Surface a "this database was written by a newer version; downgrade is not supported" error. Audit-logged. |

The `disk > max` branch is what protects a user who manually re-installs an older `.exe` / `.deb` from corruption. ADR-204's roll-forward-only stance is enforced here, not just by policy.

### 5. Forward-only-safe migrations (policy gate)

Each new migration must satisfy the following review checklist before merge:

- **No destructive column drop** of a column that holds user data without first writing the data elsewhere (sibling column, JSON blob in another table, or explicit deletion event in the audit ledger).
- **No type narrowing** that loses information (e.g., `TEXT` → `INTEGER` with truncation).
- **Renames are copy-then-drop:** add new column → copy data → verify row count → drop old column. Each step in its own statement inside the same transaction.
- **Add-column / add-table / add-index / add-non-null-with-default** are safe by default.
- **Idempotent:** running the migration twice on the same DB must produce the same result. (Enforced by `user_version` gate, but the migration body itself should be authored idempotently.)

Each migration ships with a fixture: a snapshotted pre-migration DB (small synthetic, no PHI) committed to the repo, plus an expected post-migration assertion set. CI runs the migration against the fixture and verifies row counts, sampled values, and index presence.

### 6. Update-time concurrency

The Main process gates `electron-updater`'s install-on-quit behaviour:

- **In-flight transaction check.** Before quitting for install, Main asserts no DB transaction is open on the singleton connection. Trivially true under `better-sqlite3`'s synchronous model, but the assertion remains so the property survives any future move toward async / pooled connections.
- **WAL checkpoint.** If the DB is operating in WAL mode (live or future), Main runs `PRAGMA wal_checkpoint(TRUNCATE)` before quitting for install. This guarantees the next-version binary opens a clean main DB file with no separate WAL the new schema-detection might misread.
- **Quit-then-install ordering.** Main releases the DB connection (`db.close()`) before triggering the installer relaunch. The OS file lock is dropped explicitly; the installer does not race a still-open handle.

### 7. Audit trail

Every step in the safety stack writes to the audit ledger (ADR-502) under a dedicated `update.*` category:

- `update.backup.created` (path, schema version, byte size)
- `update.migration.started` (from, to)
- `update.migration.succeeded` (from, to, row deltas per touched table)
- `update.migration.failed` (from, to, error class) — followed by a `update.backup.restored` if the support path is taken
- `update.backup.rotated` (path)
- `update.refused.older-than-min` / `update.refused.newer-than-max`

The ledger is part of the local-first data set (ADR-302 / ADR-502); it survives uninstall + reinstall, so the forensic trail does not depend on the user retaining a debug log.

### 8. Cloud / sync interaction (forward-pointing)

The local invariants above are necessary but not sufficient once ADR-303 (E2EE sync) is active. Two follow-ups inherit from this ADR:

- The sync queue's wire events are tagged with the originating schema version. A device on schema `N` receiving an event from schema `N+1` does not replay blind — it either upgrades its schema first, queues the event, or rejects.
- Encrypted backups (ADR-303) embed the schema version in the envelope. Restore refuses if the schema version is unknown to the receiving binary.

These commitments live here, in this ADR, to ensure they are not invented from scratch when sync work begins.

## Consequences

### Positive

- A bad migration is recoverable. The backup-then-migrate-in-transaction stack defeats the realistic single-fault scenarios (bug in migration, crash mid-migration, IO error mid-migration).
- The roll-forward stance of ADR-204 becomes safe to commit. Without this ADR, roll-forward on a clinical app would be reckless.
- The `disk > max` schema gate makes manual downgrade fail-closed rather than fail-corrupt.
- Audit ledger entries make every update operation explicable after the fact. A support engineer can reconstruct exactly what happened on a user's device.
- Sync (ADR-303) and recovery (ADR-306) inherit clear invariants instead of inventing per-feature data-safety stories.

### Negative

- Pre-migration backup costs disk space. Bounded (N = 3, each at most the DB size) but real on small disks. Acceptable price; rotation makes it self-limiting.
- Every migration carries authoring overhead — fixture + assertion set + review checklist. Slows individual migration changes; this is the intended trade-off.
- Schema version gates create a "you must install vK before vM" failure mode for users who skip very large version ranges. Documented and discoverable via the error surface; bounded by how aggressively `minSupportedSchema` is raised.

### Neutral

- Backups are encrypted under the same KEK/DEK as the live DB (SQLCipher file copy). No new key material. ADR-307 lock semantics apply to backups identically.
- The audit ledger growth from `update.*` events is small (a handful per update) and bounded.

## Considered Options

- **No pre-migration backup; rely on transactional DDL only** — _Rejected_: defends against crash mid-migration but not against a buggy migration that commits a wrong result. A clinical-grade app cannot ship without the bug case covered.
- **Backup to a separate device / cloud** — _Rejected for this ADR_: violates ADR-301 (PHI on-device boundary) unless E2EE-wrapped, which is the job of ADR-303 (sync + backup). Local-disk backup is the layer this ADR commits; cloud-backup is orthogonal and additive when ADR-303 ships.
- **Allow downgrade migrations (reverse path)** — _Rejected_: each migration would need a hand-authored reverse, doubling the surface area and creating a class of latent bugs no test will catch (because nobody runs the reverse path until incident time). Roll-forward + restore-from-backup is simpler and at least as safe.
- **Run migrations in the renderer / a worker** — _Rejected_: Main owns authority (ADR-101 / ADR-102); the DB connection lives in Main. Migrations follow.
- **Skip the schema-version-too-high gate** — _Rejected_: under roll-forward, this is the only line of defence against a user who manually re-installs an older binary and silently re-mutates a newer DB.
- **One mega-migration per release vs. one migration per intent** — _Mega rejected_: failure isolation, fixture authoring, and review legibility all favour small per-intent migrations chained in order. The trade-off is more files; pay it.

## Open Items

- **O179** — Backup retention policy under disk pressure. Current: N = 3 most recent. If disk is genuinely full, the backup-create step fails, blocking the update. Should the app instead surface a "free space first" UX and offer to rotate older backups out earlier? Decide before the first migration ships in a release.
- **O180** — Backup restore UX. The "downgrade to a backup" path is described here as a support flow. At what point (if ever) does this become a user-visible "Restore previous version" button — guarded by what? Tied to ADR-306 (recovery flows).
- **O181** — Migration fixture authoring guide. Conventions for synthetic-DB fixtures: how big, how diverse, what schemas they target, where they live in the repo. Lands before the first non-trivial migration is authored.
- **O182** — `user_version` collisions with SQLCipher-internal pragmas. Verify no conflict between `PRAGMA user_version` and SQLCipher's pragma surface; document the namespace if any care is required.
- **O183** — Schema version wire-tagging for sync (ADR-303). Concrete event-envelope shape, including how a sync event from a strictly-newer schema is held without being lost. Lands when sync transport begins design.
- **O184** — Encrypted-backup schema version embedding (ADR-303 / ADR-306). The cloud-backup envelope must carry schema version + minimum binary version required to restore. Lands with backup format spec.
- **O185** — CI test gate for installer-side data-touch. Concrete test harness for the v1-install / v2-upgrade fingerprint-equality assertion (§1). Needs runners with both Windows and Debian environments. Stub now, wire when Phase A (release pipeline) lands.
