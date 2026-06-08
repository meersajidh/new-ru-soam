/**
 * Renderer-singleton value store for pending aspect focus requests.
 *
 * Replaces the racy viewFocusBus pub/sub. Stores the latest request so
 * AuxSideBar can read it as a prop on fresh mount (no race with subscribe).
 *
 * `nonce` increments on every request — lets a repeated click on the same
 * sectionId re-fire the focusNonce effect in BundleViewIframe.
 */

export interface AspectFocusRequest {
  readonly sectionId: string;
  readonly nonce: number;
}

let _current: AspectFocusRequest | null = null;
let _n = 0;
const _listeners = new Set<() => void>();

export const aspectFocus = {
  request(sectionId: string): void {
    _current = { sectionId, nonce: ++_n };
    for (const l of _listeners) l();
  },
  get(): AspectFocusRequest | null {
    return _current;
  },
  subscribe(l: () => void): () => void {
    _listeners.add(l);
    return () => {
      _listeners.delete(l);
    };
  },
};
