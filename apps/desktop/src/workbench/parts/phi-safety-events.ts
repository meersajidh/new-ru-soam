/**
 * PHI Safety Score — cross-module event helpers.
 * Separated from PhiSafetyPopover.tsx so the popover file exports only
 * React components (required by eslint-plugin-react-refresh).
 */

/**
 * Programmatically open the PHI Safety popover. Called by the
 * `workbench.phi-safety.show` command registered in bootstrap.ts.
 * Dispatches a custom DOM event that the mounted PhiSafetyPopover picks up.
 */
export function requestOpenPhiSafetyPopover(): void {
  window.dispatchEvent(new CustomEvent('phi-safety:open'));
}
