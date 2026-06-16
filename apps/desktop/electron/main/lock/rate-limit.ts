/**
 * Backoff state machine for failed unlock attempts — per workspace.
 *
 * Persisted to lock-attempts.json so brute force can't bypass via restart.
 * The file is plaintext and unauthenticated — its purpose is friction, not crypto.
 *
 * Schedule per ADR-307 §"Rate limiting on failed unlock":
 *   Attempts 1-5: none
 *   Attempt 6: 1 minute
 *   Attempt 7: 5 minutes
 *   Attempt 8: 15 minutes
 *   Attempt 9+: 15 minutes (cap)
 *
 * No permanent lockout — recovery-code path is always reachable.
 *
 * All functions take a workspaceId per the multi-workspace storage layout.
 */

import fs from 'fs';
import { ensureWorkspaceDir } from '../workspace/paths.js';
import { rateLimitPath } from './paths.js';

interface RateLimitState {
  count: number;
  lastAttemptAt: string; // ISO-8601
  backoffUntil: string | null; // ISO-8601 | null
}

const FAST_ATTEMPT_LIMIT = 5;
const BACKOFF_SCHEDULE_MS = [
  60_000,      // attempt 6: 1 minute
  300_000,     // attempt 7: 5 minutes
  900_000,     // attempt 8: 15 minutes
];
const BACKOFF_CAP_MS = 900_000; // 15 minutes

function read(workspaceId: string): RateLimitState {
  const p = rateLimitPath(workspaceId);
  if (!fs.existsSync(p)) return { count: 0, lastAttemptAt: new Date().toISOString(), backoffUntil: null };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as RateLimitState;
  } catch {
    return { count: 0, lastAttemptAt: new Date().toISOString(), backoffUntil: null };
  }
}

function write(workspaceId: string, state: RateLimitState): void {
  ensureWorkspaceDir(workspaceId);
  fs.writeFileSync(rateLimitPath(workspaceId), JSON.stringify(state, null, 2), 'utf8');
}

function backoffMsForCount(count: number): number {
  // count is the total after this failure
  if (count <= FAST_ATTEMPT_LIMIT) return 0;
  const idx = count - FAST_ATTEMPT_LIMIT - 1; // 0-based index into schedule
  if (idx < BACKOFF_SCHEDULE_MS.length) return BACKOFF_SCHEDULE_MS[idx] as number;
  return BACKOFF_CAP_MS;
}

export interface AttemptInfo {
  attemptsRemaining: number;
  backoffUntilMs?: number;
}

/** Check whether a new attempt is currently allowed. */
export function canAttempt(workspaceId: string): { allowed: boolean; backoffUntilMs?: number } {
  const state = read(workspaceId);
  if (!state.backoffUntil) return { allowed: true };
  const backoffUntilMs = new Date(state.backoffUntil).getTime();
  if (Date.now() >= backoffUntilMs) return { allowed: true };
  return { allowed: false, backoffUntilMs };
}

/** Record a failed attempt. Returns the new back-off state. */
export function recordFailure(workspaceId: string): AttemptInfo {
  const state = read(workspaceId);
  const newCount = state.count + 1;
  const backoffMs = backoffMsForCount(newCount);
  const now = Date.now();
  const backoffUntilMs = backoffMs > 0 ? now + backoffMs : undefined;
  const backoffUntil = backoffUntilMs !== undefined ? new Date(backoffUntilMs).toISOString() : null;
  write(workspaceId, { count: newCount, lastAttemptAt: new Date(now).toISOString(), backoffUntil });

  const attemptsRemaining = Math.max(0, FAST_ATTEMPT_LIMIT - newCount);
  return { attemptsRemaining, backoffUntilMs };
}

/** Record a successful unlock — reset counter. */
export function recordSuccess(workspaceId: string): void {
  const p = rateLimitPath(workspaceId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
