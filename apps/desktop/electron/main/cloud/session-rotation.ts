/**
 * Proactive session-rotation timing — pure math (ADR-311).
 *
 * Extracted from session-service.ts (O517 B1) so the rotation-delay clamp can be
 * unit-tested without the timer / IO it drives. Security-adjacent: this decides
 * how long before expiry a refresh token rotates, so a regression here silently
 * shifts (or defeats) proactive rotation.
 */

/**
 * Minimum delay before proactive rotation fires, even when expiresIn is very short.
 * Prevents rapid-fire retries on tokens that expire in < 60 s (unusual but safe).
 */
export const MIN_ROTATION_DELAY_MS = 30_000;

/**
 * How far before expiry to rotate (seconds). Fires at expiresIn - ROTATION_LEAD_SEC.
 * Server access JWTs are currently 15 min (900 s); we rotate at 840 s = 60 s before expiry.
 */
export const ROTATION_LEAD_SEC = 60;

/**
 * Milliseconds until the next proactive rotation should fire.
 *
 * Rotate ROTATION_LEAD_SEC seconds before the token expires, but never sooner
 * than MIN_ROTATION_DELAY_MS — a short-lived token still gets a floor so we do
 * not spin. Total function: negative or tiny `expiresInSec` clamps to the floor.
 *
 * @param expiresInSec  Token lifetime in seconds (server-reported `expires_in`).
 * @returns Delay in milliseconds.
 */
export function rotationDelayMs(expiresInSec: number): number {
  return Math.max((expiresInSec - ROTATION_LEAD_SEC) * 1000, MIN_ROTATION_DELAY_MS);
}
