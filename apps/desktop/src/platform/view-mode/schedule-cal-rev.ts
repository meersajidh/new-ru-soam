/**
 * schedule-cal-rev — shared cross-module calRev bump helper.
 *
 * bootstrap.ts registers the actual bump function once at boot.
 * Any renderer module (PhiSafetyPopover, ClientEraseDialog, etc.) can call
 * bumpScheduleCalRev() without importing the service registry.
 *
 * Pattern mirrors phi-safety-events.ts / requestOpenPhiSafetyPopover.
 */

type BumpFn = () => void;

let _bump: BumpFn | null = null;

/** Called once by domainBootstrap to wire the real bump implementation. */
export function registerScheduleCalRevBump(fn: BumpFn): void {
  _bump = fn;
}

/**
 * Increment `calRev` on the ScheduleViewStateService.
 * No-op if bootstrap has not yet registered the bump fn (safe to call early).
 */
export function bumpScheduleCalRev(): void {
  _bump?.();
}
