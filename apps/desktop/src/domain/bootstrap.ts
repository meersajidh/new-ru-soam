/**
 * Domain bootstrap (ADR-106 — composition seam).
 *
 * Called ONLY from the single composition-root file (src/App.tsx).
 * Registers domain product values into the base injection point so that
 * base shell components receive correct product copy without importing
 * domain modules directly.
 *
 * This module is the ONLY file in src/domain/** that the composition root
 * imports. All other domain modules are internal.
 */

import type { ServiceRegistry } from '../platform/services/registry';
import { ProductConfigServiceId, ContextKeyServiceId, EditorServiceId, CommandServiceId } from '../platform/services/ids';
import { PRODUCT_TAGLINE, DELETE_WARNING_ADDENDUM } from './product';

export function domainBootstrap(registry: ServiceRegistry): void {
  const productConfig = registry.get(ProductConfigServiceId);
  productConfig.configure({
    tagline: PRODUCT_TAGLINE,
    deleteWarningAddendum: DELETE_WARNING_ADDENDUM,
  });

  // Wire editor active-instance changes → patient.activeId / record.activeId context keys.
  // Reads entityId from the active EditorInstance (set by EditorService.open({entityId})).
  // These are domain-reserved keys (ADR-407); only domain code may write them.
  // The base shell Parts (AuxSideBar, Panel) read them generically via record.activeId.
  // ADR-106: domain code owns the mapping; base shell stays domain-free.
  const commands = registry.get(CommandServiceId);
  commands.register(
    'ru-soam-practice.roster.reveal',
    'Reveal Client',
    (clientId: unknown) => { console.log('[practice] roster context action: reveal', clientId); },
    { category: 'Practice' },
  );

  const contextKeys = registry.get(ContextKeyServiceId);
  const editor = registry.get(EditorServiceId);

  // Seed initial values so context keys exist from boot.
  contextKeys.set('patient.activeId', '');
  contextKeys.set('record.activeId', '');

  function syncPatientContext(): void {
    const gid = editor.getFocusedGroupId();
    const group = gid ? editor.getGroup(gid) : undefined;
    const inst = group?.activeTabId ? group.tabs.find((t) => t.id === group.activeTabId) : undefined;
    // Read entityId directly — no URL parsing needed (stable-resource entity-binding pattern).
    const patientId = inst?.entityId ?? '';
    contextKeys.set('patient.activeId', patientId);
    contextKeys.set('record.activeId', patientId);
  }

  // Subscribe and sync for the app lifetime.
  // The disposable intentionally lives for the whole session (no teardown
  // needed — domainBootstrap is called once at composition root init).
  editor.onDidChange(syncPatientContext);
  // Sync once immediately in case editor already has a focused tab.
  syncPatientContext();
}
