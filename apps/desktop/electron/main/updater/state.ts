/**
 * Update state machine types and transition helpers.
 * Pure data — no side effects, no electron imports.
 */

import type { UpdateState } from '../../shared/update.js';

export type { UpdateState };

export function makeIdle(): UpdateState {
  return { status: 'idle' };
}

export function makeChecking(): UpdateState {
  return { status: 'checking' };
}

export function makeAvailable(version: string, releaseDate: string | null): UpdateState {
  return { status: 'available', version, releaseDate };
}

export function makeDownloading(
  version: string,
  percent: number,
  bytesPerSecond: number,
  transferred: number,
  total: number,
): UpdateState {
  return { status: 'downloading', version, percent, bytesPerSecond, transferred, total };
}

export function makeReady(version: string): UpdateState {
  return { status: 'ready', version };
}

export function makeError(message: string): UpdateState {
  return { status: 'error', message };
}
