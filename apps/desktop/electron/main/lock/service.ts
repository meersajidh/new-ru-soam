/**
 * LockService — per-workspace Phase-9 state machine for workspace lock/unlock.
 *
 * Instantiated per active workspace: new LockService(workspaceId).
 * The singleton export at the bottom of the v1 file is removed — instances
 * are created by the bootstrap layer (main/index.ts) and dev-provision.ts.
 *
 * Implements the full ADR-307 lifecycle:
 *   fresh -> setup-pending -> locked -> unlocked <-> locked
 *
 * The KEK is held only in process memory between unlock and relock.
 * It is never persisted to disk or the keychain in plaintext.
 *
 * This class follows the disposable pattern (docs/Guides/disposable-pattern.md).
 */

import { randomBytes } from 'crypto';
import { deriveWrapKey as argon2DeriveWrapKey } from '../crypto/kdf-passphrase.js';
import { deriveWrapKey as hkdfDeriveWrapKey } from '../crypto/kdf-recovery.js';
import * as recoveryCode from '../crypto/recovery-code.js';
import {
  buildKekWrapAad,
  wrapKeyToEnvelope,
  unwrapKeyFromEnvelope,
  encryptToEnvelope,
  decryptFromEnvelope,
  EMPTY_AAD,
  type Envelope,
} from '../crypto/envelope.js';
import { readMetadata, writeMetadata, metadataExists, type Metadata } from './storage.js';
import { canAttempt, recordFailure, recordSuccess } from './rate-limit.js';
import { writeIdentity, readIdentity } from '../workspace/identity.js';
import { workspaceRegistry } from '../workspace/registry.js';
import type {
  LockState,
  UnlockResult,
  RecoveryUnlockResult,
  SetupGenerateResult,
  SetupAcknowledgeResult,
} from '../../shared/lock-protocol.js';

export interface Disposable {
  dispose(): void;
}

type LockChangeListener = (state: LockState) => void;

/** Fixed canary plaintext for KEK verification. */
const CANARY_PLAINTEXT = Buffer.from('ru-soam-kek-canary-v1', 'utf8');

/** KDF params written to lock.json (frozen per ADR-307). */
const KDF_PARAMS = {
  algo: 'argon2id' as const,
  m: 67108864, // 64 MiB expressed in bytes (for documentation; Argon2 lib uses KiB internally)
  t: 3,
  p: 1,
  outLen: 32,
};

const SALT_BYTES = 16; // 128-bit salts
const KEK_BYTES = 32;  // 256-bit KEK
const SETUP_TTL_MS = 10 * 60 * 1000; // 10-minute staged setup TTL

interface StagedSetup {
  kek: Buffer;
  salt_p: Buffer;
  salt_r: Buffer;
  wrapped_KEK_passphrase: Envelope;
  wrapped_KEK_recovery: Envelope;
  verifier: Envelope;
  recoveryWords: string[];
  expiresAt: number;
}

export class LockService {
  private _kek: Buffer | null = null;
  private _mustResetPassphrase = false;
  private _staged: StagedSetup | null = null;
  private _setupInProgress = false;
  private readonly _listeners = new Set<LockChangeListener>();
  private readonly _workspaceId: string;

  constructor(workspaceId: string) {
    this._workspaceId = workspaceId;
  }

  // ── State ──────────────────────────────────────────────────────────────────

  getState(): LockState {
    const setupComplete = metadataExists(this._workspaceId);
    const locked = this._kek === null;
    return { locked, setupComplete, mustResetPassphrase: this._mustResetPassphrase };
  }

  isLocked(): boolean {
    return this._kek === null;
  }

  /**
   * Internal: returns the in-memory KEK handle for use by encryption call sites.
   * Not exposed via IPC — only accessible to Main-process modules.
   */
  kekHandle(): Buffer | null {
    return this._kek;
  }

  // ── Unlock ─────────────────────────────────────────────────────────────────

  async unlock(passphrase: string): Promise<UnlockResult> {
    if (!metadataExists(this._workspaceId)) {
      return { ok: false, code: 'not-set-up' };
    }

    const check = canAttempt(this._workspaceId);
    if (!check.allowed) {
      return { ok: false, code: 'rate-limited', backoffUntilMs: check.backoffUntilMs! };
    }

    const meta = readMetadata(this._workspaceId);
    if (!meta) return { ok: false, code: 'not-set-up' };

    const salt_p = Buffer.from(meta.salt_p, 'base64');
    let wrapKey: Buffer | null = null;
    try {
      wrapKey = Buffer.from(await argon2DeriveWrapKey(passphrase, salt_p));
      let kek: Buffer | null = null;
      try {
        kek = unwrapKeyFromEnvelope(wrapKey, meta.wrapped_KEK_passphrase);
      } catch {
        // Decryption failed — bad passphrase
        wrapKey.fill(0);
        wrapKey = null;
        const info = recordFailure(this._workspaceId);
        const result: UnlockResult = {
          ok: false,
          code: 'bad-passphrase',
          attemptsRemaining: info.attemptsRemaining,
          ...(info.backoffUntilMs !== undefined ? { backoffUntilMs: info.backoffUntilMs } : {}),
        };
        return result;
      }

      // Verify canary
      try {
        const canary = decryptFromEnvelope(kek, meta.verifier);
        if (!canary.equals(CANARY_PLAINTEXT)) {
          kek.fill(0);
          wrapKey.fill(0);
          const info = recordFailure(this._workspaceId);
          return {
            ok: false,
            code: 'bad-passphrase',
            attemptsRemaining: info.attemptsRemaining,
          };
        }
      } catch {
        kek.fill(0);
        wrapKey.fill(0);
        const info = recordFailure(this._workspaceId);
        return {
          ok: false,
          code: 'bad-passphrase',
          attemptsRemaining: info.attemptsRemaining,
        };
      }

      wrapKey.fill(0);
      wrapKey = null;
      this._kek = kek;
      this._mustResetPassphrase = false;
      recordSuccess(this._workspaceId);
      workspaceRegistry.bumpLastSignedIn(this._workspaceId);
      this._emit();
      return { ok: true };
    } finally {
      if (wrapKey) wrapKey.fill(0);
    }
  }

  async unlockWithRecoveryCode(words: string[]): Promise<RecoveryUnlockResult> {
    if (!metadataExists(this._workspaceId)) {
      return { ok: false, code: 'not-set-up' };
    }

    const meta = readMetadata(this._workspaceId);
    if (!meta) return { ok: false, code: 'not-set-up' };

    let recoveryBytes: Uint8Array | null = null;
    let wrapKey: Buffer | null = null;
    try {
      try {
        recoveryBytes = recoveryCode.parse(words);
      } catch {
        return { ok: false, code: 'bad-recovery-code' };
      }

      const salt_r = Buffer.from(meta.salt_r, 'base64');
      wrapKey = hkdfDeriveWrapKey(recoveryBytes, salt_r);
      // Zero recovery bytes after deriving the wrap-key
      recoveryBytes.fill(0);
      recoveryBytes = null;

      let kek: Buffer | null = null;
      try {
        kek = unwrapKeyFromEnvelope(wrapKey, meta.wrapped_KEK_recovery);
      } catch {
        wrapKey.fill(0);
        return { ok: false, code: 'bad-recovery-code' };
      }

      // Verify canary
      try {
        const canary = decryptFromEnvelope(kek, meta.verifier);
        if (!canary.equals(CANARY_PLAINTEXT)) {
          kek.fill(0);
          wrapKey.fill(0);
          return { ok: false, code: 'bad-recovery-code' };
        }
      } catch {
        kek.fill(0);
        wrapKey.fill(0);
        return { ok: false, code: 'bad-recovery-code' };
      }

      wrapKey.fill(0);
      wrapKey = null;
      this._kek = kek;
      this._mustResetPassphrase = true;
      recordSuccess(this._workspaceId);
      this._emit();
      return { ok: true, mustResetPassphrase: true };
    } finally {
      if (wrapKey) wrapKey.fill(0);
      if (recoveryBytes) {
        // Uint8Array — fill with zeros
        recoveryBytes.fill(0);
      }
    }
  }

  // ── Passphrase management ──────────────────────────────────────────────────

  async setPassphraseAfterRecovery(newPassphrase: string): Promise<UnlockResult> {
    if (this._kek === null) return { ok: false, code: 'not-set-up' };
    if (!this._mustResetPassphrase) {
      return { ok: false, code: 'no-recovery-pending' };
    }

    const meta = readMetadata(this._workspaceId);
    if (!meta) return { ok: false, code: 'not-set-up' };

    const newSalt_p = randomBytes(SALT_BYTES);
    let newWrapKey: Buffer | null = null;
    try {
      newWrapKey = Buffer.from(await argon2DeriveWrapKey(newPassphrase, newSalt_p));
      const aad = buildKekWrapAad('kek-wrap-passphrase', this._workspaceId);
      const newWrappedKEKPassphrase = wrapKeyToEnvelope(newWrapKey, this._kek, aad);
      newWrapKey.fill(0);
      newWrapKey = null;

      writeMetadata(this._workspaceId, {
        ...meta,
        salt_p: newSalt_p.toString('base64'),
        wrapped_KEK_passphrase: newWrappedKEKPassphrase,
      });
      this._mustResetPassphrase = false;
      this._emit();
      return { ok: true };
    } finally {
      if (newWrapKey) newWrapKey.fill(0);
    }
  }

  async changePassphrase(current: string, next: string): Promise<UnlockResult> {
    if (this._kek === null) return { ok: false, code: 'not-set-up' };

    const meta = readMetadata(this._workspaceId);
    if (!meta) return { ok: false, code: 'not-set-up' };

    const check = canAttempt(this._workspaceId);
    if (!check.allowed) {
      return { ok: false, code: 'rate-limited', backoffUntilMs: check.backoffUntilMs! };
    }

    // Verify current passphrase by re-derive + unwrap
    const salt_p = Buffer.from(meta.salt_p, 'base64');
    let currentWrapKey: Buffer | null = null;
    let nextWrapKey: Buffer | null = null;
    try {
      currentWrapKey = Buffer.from(await argon2DeriveWrapKey(current, salt_p));
      try {
        const verifyKek = unwrapKeyFromEnvelope(currentWrapKey, meta.wrapped_KEK_passphrase);
        verifyKek.fill(0);
      } catch {
        currentWrapKey.fill(0);
        const info = recordFailure(this._workspaceId);
        return {
          ok: false,
          code: 'bad-passphrase',
          attemptsRemaining: info.attemptsRemaining,
        };
      }
      currentWrapKey.fill(0);
      currentWrapKey = null;

      // Derive new wrap-key and re-wrap the in-memory KEK
      const newSalt_p = randomBytes(SALT_BYTES);
      nextWrapKey = Buffer.from(await argon2DeriveWrapKey(next, newSalt_p));
      const newWrappedKEKPassphrase = wrapKeyToEnvelope(nextWrapKey, this._kek, buildKekWrapAad('kek-wrap-passphrase', this._workspaceId));
      nextWrapKey.fill(0);
      nextWrapKey = null;

      writeMetadata(this._workspaceId, {
        ...meta,
        salt_p: newSalt_p.toString('base64'),
        wrapped_KEK_passphrase: newWrappedKEKPassphrase,
      });
      return { ok: true };
    } finally {
      if (currentWrapKey) currentWrapKey.fill(0);
      if (nextWrapKey) nextWrapKey.fill(0);
    }
  }

  // ── Relock ─────────────────────────────────────────────────────────────────

  relock(): void {
    if (this._kek) {
      this._kek.fill(0);
      this._kek = null;
    }
    this._mustResetPassphrase = false;
    this._emit();
  }

  // ── Setup ceremony ─────────────────────────────────────────────────────────

  /**
   * Stage the setup ceremony (generate KEK + wrap keys + recovery code).
   *
   * @param passphrase       User-supplied passphrase.
   * @param recoveryBytes    Optional pre-supplied entropy (16 bytes). Default = random.
   *                         DEV-ONLY hook: only dev-provision passes this parameter.
   */
  async setupGenerate(passphrase: string, recoveryBytes?: Uint8Array): Promise<SetupGenerateResult> {
    if (metadataExists(this._workspaceId)) {
      return { ok: false, code: 'already-set-up' };
    }
    // Serialize concurrent setup attempts
    if (this._setupInProgress) {
      return { ok: false, code: 'already-set-up' };
    }
    this._setupInProgress = true;

    let wrapKeyP: Buffer | null = null;
    let wrapKeyR: Buffer | null = null;
    let kek: Buffer | null = null;
    let internalRecoveryBytes: Uint8Array | null = null;
    try {
      const salt_p = randomBytes(SALT_BYTES);
      const salt_r = randomBytes(SALT_BYTES);

      kek = randomBytes(KEK_BYTES);

      // Use caller-supplied recovery bytes (DEV-ONLY) or generate fresh ones
      let words: string[];
      if (recoveryBytes) {
        internalRecoveryBytes = recoveryBytes;
        // Generate BIP-39 words from the supplied bytes
        words = recoveryCode.entropyToWords(recoveryBytes);
      } else {
        const generated = recoveryCode.generate();
        words = generated.words;
        internalRecoveryBytes = generated.bytes;
      }

      wrapKeyP = Buffer.from(await argon2DeriveWrapKey(passphrase, salt_p));
      wrapKeyR = hkdfDeriveWrapKey(internalRecoveryBytes, salt_r);
      // Zero the recovery bytes after deriving the wrap-key (best-effort)
      internalRecoveryBytes.fill(0);
      internalRecoveryBytes = null;

      const aadP = buildKekWrapAad('kek-wrap-passphrase', this._workspaceId);
      const aadR = buildKekWrapAad('kek-wrap-recovery', this._workspaceId);

      const wrapped_KEK_passphrase = wrapKeyToEnvelope(wrapKeyP, kek, aadP);
      const wrapped_KEK_recovery = wrapKeyToEnvelope(wrapKeyR, kek, aadR);

      wrapKeyP.fill(0);
      wrapKeyP = null;
      wrapKeyR.fill(0);
      wrapKeyR = null;

      const verifier = encryptToEnvelope(kek, CANARY_PLAINTEXT, EMPTY_AAD);

      // Stage — do NOT persist yet
      this._staged = {
        kek,
        salt_p,
        salt_r,
        wrapped_KEK_passphrase,
        wrapped_KEK_recovery,
        verifier,
        recoveryWords: words,
        expiresAt: Date.now() + SETUP_TTL_MS,
      };
      kek = null; // owned by staged

      return { ok: true, recoveryCode: words };
    } finally {
      this._setupInProgress = false;
      if (wrapKeyP) wrapKeyP.fill(0);
      if (wrapKeyR) wrapKeyR.fill(0);
      if (kek) kek.fill(0);
      if (internalRecoveryBytes) internalRecoveryBytes.fill(0);
    }
  }

  /**
   * Commit the staged setup ceremony.
   *
   * Writes lock.json, identity.envelope, bumps lastSignedIn, sets active workspace pointer.
   */
  setupAcknowledge(args: { identity: { email: string; googleId?: string } }): SetupAcknowledgeResult {
    if (!this._staged) {
      return { ok: false, code: 'not-generated' };
    }
    if (Date.now() > this._staged.expiresAt) {
      // Expire the staged state
      this._staged.kek.fill(0);
      this._staged = null;
      return { ok: false, code: 'expired' };
    }

    // Check again — concurrent generate+acknowledge between checks
    if (metadataExists(this._workspaceId)) {
      this._staged.kek.fill(0);
      this._staged = null;
      return { ok: false, code: 'not-generated' };
    }

    const meta: Metadata = {
      version: 1,
      kdf: KDF_PARAMS,
      salt_p: this._staged.salt_p.toString('base64'),
      salt_r: this._staged.salt_r.toString('base64'),
      wrapped_KEK_passphrase: this._staged.wrapped_KEK_passphrase,
      wrapped_KEK_recovery: this._staged.wrapped_KEK_recovery,
      verifier: this._staged.verifier,
      createdAt: new Date().toISOString(),
    };
    writeMetadata(this._workspaceId, meta);

    // Promote KEK to live
    this._kek = this._staged.kek;
    this._staged = null;
    this._mustResetPassphrase = false;

    // Persist identity envelope
    writeIdentity(this._workspaceId, this._kek, args.identity);

    // Bump lastSignedIn
    workspaceRegistry.bumpLastSignedIn(this._workspaceId);

    this._emit();
    return { ok: true };
  }

  // ── Identity ───────────────────────────────────────────────────────────────

  /**
   * Decrypt and return the workspace identity.
   * Returns null if locked, not set up, or decryption fails.
   */
  getIdentity(): { email: string } | null {
    if (this._kek === null) return null;
    return readIdentity(this._workspaceId, this._kek);
  }

  // ── Event subscription ─────────────────────────────────────────────────────

  onDidChange(listener: LockChangeListener): Disposable {
    this._listeners.add(listener);
    let disposed = false;
    const listeners = this._listeners;
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        listeners.delete(listener);
      },
    };
  }

  private _emit(): void {
    const state = this.getState();
    for (const listener of [...this._listeners]) {
      listener(state);
    }
  }
}

