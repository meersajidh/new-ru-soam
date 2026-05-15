import type { ILayoutService } from '../layout/layout-service';
import { SlotId } from '../layout/slots';

// Phase 2 local keybindings. Replaced by KeybindingService in Phase 3.
export function installBasicShortcuts(layout: ILayoutService): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (!e.ctrlKey || e.metaKey || e.shiftKey) return;

    if (!e.altKey && e.key === 'b') {
      e.preventDefault();
      layout.toggleVisibility(SlotId.PrimarySideBar);
    } else if (!e.altKey && e.key === 'j') {
      e.preventDefault();
      layout.toggleVisibility(SlotId.Panel);
    } else if (e.altKey && e.key === 'b') {
      e.preventDefault();
      layout.toggleVisibility(SlotId.AuxSideBar);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
