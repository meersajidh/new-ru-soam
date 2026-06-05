/**
 * Module-level store for the ClientEraseDialog.
 *
 * The erase command (bootstrap.ts) calls showClientErase() to surface the
 * confirmation dialog from a renderer-domain command, keeping PHI out of
 * the Bundle Host (ADR-410 / ADR-417 PHI pattern).
 *
 * Future home: a data-rights area in Consent & Legal aspect (Phase 2).
 */

export interface ClientEraseState {
  clientId: string;
  displayName: string;
}

type Listener = () => void;

let _state: ClientEraseState | null = null;
const _listeners = new Set<Listener>();

function notify(): void {
  for (const l of _listeners) l();
}

/** Trigger the erase dialog for a client. */
export function showClientErase(clientId: string, displayName: string): void {
  _state = { clientId, displayName };
  notify();
}

/** Clear the dialog (called by ClientEraseDialog on close). */
export function clearClientErase(): void {
  _state = null;
  notify();
}

/** Read current state. */
export function getClientEraseState(): ClientEraseState | null {
  return _state;
}

/** Subscribe to state changes (React useSyncExternalStore compatible). */
export function subscribeClientErase(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
