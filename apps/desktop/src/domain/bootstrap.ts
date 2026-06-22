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
import { ProductConfigServiceId, ContextKeyServiceId, EditorServiceId, CommandServiceId, ScheduleViewStateServiceId, ActiveEventServiceId } from '../platform/services/ids';
import { PRODUCT_TAGLINE, DELETE_WARNING_ADDENDUM } from './product';
import { showClientErase } from './clientEraseState';
import { requestOpenPhiSafetyPopover } from '../workbench/parts/phi-safety-events';
import { registerScheduleCalRevBump } from '../platform/view-mode/schedule-cal-rev';

export function domainBootstrap(registry: ServiceRegistry): void {
  const productConfig = registry.get(ProductConfigServiceId);
  productConfig.configure({
    tagline: PRODUCT_TAGLINE,
    deleteWarningAddendum: DELETE_WARNING_ADDENDUM,
  });

  // Shared helper — mutates patient status via the Main-resident record.patient cap.
  // ctx is the menu context forwarded from the roster iframe (untrusted shape).
  // PHI never enters Bundle Host (ADR-410/504); cap call goes through window.soam only.
  async function setPatientStatus(ctx: unknown, status: 'active' | 'inactive' | 'archived'): Promise<void> {
    const clientId = (ctx as Record<string, unknown>)?.clientId;
    if (typeof clientId !== 'string' || clientId.length === 0) {
      console.warn('[practice] setStatus: missing or invalid clientId in ctx', ctx);
      return;
    }
    const proxy = await window.soam.bindCommand('record.patient', '1.0');
    try {
      await proxy.call('setStatus', clientId, status);
    } catch (err) {
      console.error('[practice] setStatus failed:', err);
    } finally {
      proxy.dispose();
    }
  }

  const commands = registry.get(CommandServiceId);
  commands.register(
    'ru-soam-practice.roster.setActive',
    'Set Active',
    (ctx: unknown) => setPatientStatus(ctx, 'active'),
    { category: 'Practice' },
  );
  commands.register(
    'ru-soam-practice.roster.setInactive',
    'Set Inactive',
    (ctx: unknown) => setPatientStatus(ctx, 'inactive'),
    { category: 'Practice' },
  );
  commands.register(
    'ru-soam-practice.roster.archive',
    'Archive Client',
    (ctx: unknown) => setPatientStatus(ctx, 'archived'),
    { category: 'Practice' },
  );

  // Shared helper — sets lifecycle stage via Main-resident record.patient cap.
  // PHI never enters Bundle Host (ADR-410/504).
  async function setPatientStage(ctx: unknown, stage: string): Promise<void> {
    const clientId = (ctx as Record<string, unknown>)?.clientId;
    if (typeof clientId !== 'string' || clientId.length === 0) {
      console.warn('[practice] setStage: missing or invalid clientId in ctx', ctx);
      return;
    }
    const proxy = await window.soam.bindCommand('record.patient', '1.0');
    try {
      await proxy.call('setStage', clientId, stage);
    } catch (err) {
      console.error('[practice] setStage failed:', err);
    } finally {
      proxy.dispose();
    }
  }

  commands.register(
    'ru-soam-practice.lifecycle.setReferral',
    'Set Stage: Referral',
    (ctx: unknown) => setPatientStage(ctx, 'referral'),
    { category: 'Practice' },
  );
  commands.register(
    'ru-soam-practice.lifecycle.setIntake',
    'Set Stage: Intake',
    (ctx: unknown) => setPatientStage(ctx, 'intake'),
    { category: 'Practice' },
  );
  commands.register(
    'ru-soam-practice.lifecycle.setActive',
    'Set Stage: Active',
    (ctx: unknown) => setPatientStage(ctx, 'active'),
    { category: 'Practice' },
  );
  commands.register(
    'ru-soam-practice.lifecycle.setOnHold',
    'Set Stage: On Hold',
    (ctx: unknown) => setPatientStage(ctx, 'on_hold'),
    { category: 'Practice' },
  );
  commands.register(
    'ru-soam-practice.lifecycle.setDischarged',
    'Set Stage: Discharged',
    (ctx: unknown) => setPatientStage(ctx, 'discharged'),
    { category: 'Practice' },
  );

  // Edit client record — opens the create/edit form in edit-mode for this client.
  // PHI never enters Bundle Host: resolves the bundle's `form` view URL and opens
  // it as an editor (the form binds record.patient itself via the view bridge).
  // Mirrors how the roster opens views (request.openEditor → platform.views.resolve
  // → editor.open), but driven from a renderer-domain context-menu command.
  commands.register(
    'ru-soam-practice.record.edit',
    'Edit Client Record…',
    async (ctx: unknown) => {
      const clientId = (ctx as Record<string, unknown>)?.clientId;
      if (typeof clientId !== 'string' || clientId.length === 0) {
        console.warn('[practice] edit: missing or invalid clientId in ctx', ctx);
        return;
      }
      const views = await window.soam.bindCapability('platform.views', '1.0');
      try {
        const res = (await views.call('resolve', 'ru-soam-practice', 'form')) as {
          found?: boolean;
          url?: string;
        };
        if (res?.found && res.url) {
          registry.get(EditorServiceId).open(res.url + '?id=' + clientId, {
            title: 'Edit Client',
            entityId: clientId,
          });
        } else {
          console.error('[practice] edit: form view not found');
        }
      } catch (err) {
        console.error('[practice] edit failed:', err);
      } finally {
        views.dispose();
      }
    },
    { category: 'Practice' },
  );

  // Erase client record — DPDP right-to-erasure.
  // PHI never enters Bundle Host: command shows a renderer-level confirmation
  // dialog (ClientEraseDialog); actual deletes execute in FP-Host via store.write.
  commands.register(
    'ru-soam-practice.record.erase',
    'Erase Client Record…',
    (ctx: unknown) => {
      const c = ctx as Record<string, unknown>;
      const clientId = c?.clientId;
      const displayName = c?.displayName;
      if (typeof clientId !== 'string' || clientId.length === 0) {
        console.warn('[practice] erase: missing clientId in ctx', ctx);
        return;
      }
      // displayName may be absent when triggered from context-menu (only clientId
      // is in the menu ctx). If absent, fall back to a generic label so the
      // typed-confirmation still works (user types what they see).
      const name = typeof displayName === 'string' && displayName.length > 0
        ? displayName
        : 'this client';
      showClientErase(clientId, name);
    },
    { category: 'Practice' },
  );

  // ── Schedule renderer-domain commands ────────────────────────────────────
  // These run in the renderer (not FP-Host) so they can call EditorService directly.
  // PHI never enters Bundle Host: cap calls go through window.soam only.
  // ctx is the untrusted forwarded menu context object from the calendar nav iframe.

  function bumpScheduleCalRev(): void {
    const svc = registry.get(ScheduleViewStateServiceId);
    const s = svc.getState();
    svc.setState({ view: s.view, calRev: s.calRev + 1, classFilter: s.classFilter });
  }

  // Register the shared bump fn so external modules (PhiSafetyPopover, ClientEraseDialog)
  // can call bumpScheduleCalRev() without importing the service registry.
  registerScheduleCalRevBump(bumpScheduleCalRev);

  commands.register(
    'ru-soam-schedule.calendar.edit',
    'Edit Calendar…',
    async (ctx: unknown) => {
      const c = ctx as Record<string, unknown>;
      const calendarId = c?.calendarId;
      if (typeof calendarId !== 'string' || calendarId.length === 0) {
        console.warn('[schedule] edit: missing or invalid calendarId in ctx', ctx);
        return;
      }
      const views = await window.soam.bindCapability('platform.views', '1.0');
      try {
        const res = (await views.call('resolve', 'ru-soam-schedule', 'calendar-setup')) as {
          found?: boolean;
          url?: string;
        };
        if (res?.found && res.url) {
          registry.get(EditorServiceId).open(res.url + '?mode=edit&id=' + calendarId, {
            title: 'Edit calendar',
            entityId: 'cal-edit-' + calendarId,
          });
        } else {
          console.error('[schedule] edit: calendar-setup view not found');
        }
      } catch (err) {
        console.error('[schedule] edit failed:', err);
      } finally {
        views.dispose();
      }
    },
    { category: 'Schedule' },
  );

  commands.register(
    'ru-soam-schedule.calendar.delete',
    'Delete Calendar',
    async (ctx: unknown) => {
      const c = ctx as Record<string, unknown>;
      const calendarId = c?.calendarId;
      if (typeof calendarId !== 'string' || calendarId.length === 0) {
        console.warn('[schedule] delete: missing or invalid calendarId in ctx', ctx);
        return;
      }
      const proxy = await window.soam.bindCommand('schedule.calendar', '1.0');
      try {
        await proxy.call('removeCalendar', calendarId);
        bumpScheduleCalRev();
      } catch (err) {
        console.error('[schedule] delete failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Schedule' },
  );

  commands.register(
    'ru-soam-schedule.calendar.reconnect',
    'Reconnect Account',
    async (ctx: unknown) => {
      const c = ctx as Record<string, unknown>;
      const accountId = c?.accountId;
      if (typeof accountId !== 'string' || accountId.length === 0) {
        console.warn('[schedule] reconnect: missing or invalid accountId in ctx', ctx);
        return;
      }
      const proxy = await window.soam.bindCommand('schedule.calendar', '1.0');
      try {
        await proxy.call('reconnectAccount', accountId);
        bumpScheduleCalRev();
      } catch (err) {
        console.error('[schedule] reconnect failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Schedule' },
  );

  commands.register(
    'ru-soam-schedule.account.disconnect',
    'Disconnect Account',
    async (ctx: unknown) => {
      const c = ctx as Record<string, unknown>;
      const accountId = c?.accountId;
      if (typeof accountId !== 'string' || accountId.length === 0) {
        console.warn('[schedule] account.disconnect: missing or invalid accountId in ctx', ctx);
        return;
      }
      const proxy = await window.soam.bindCommand('schedule.calendar', '1.0');
      try {
        await proxy.call('disconnectAccount', accountId);
        bumpScheduleCalRev();
      } catch (err) {
        console.error('[schedule] account.disconnect failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Schedule' },
  );

  commands.register(
    'ru-soam-schedule.account.reconnect',
    'Reconnect Account',
    async (ctx: unknown) => {
      const c = ctx as Record<string, unknown>;
      const accountId = c?.accountId;
      if (typeof accountId !== 'string' || accountId.length === 0) {
        console.warn('[schedule] account.reconnect: missing or invalid accountId in ctx', ctx);
        return;
      }
      const proxy = await window.soam.bindCommand('schedule.calendar', '1.0');
      try {
        await proxy.call('reconnectAccount', accountId);
        bumpScheduleCalRev();
      } catch (err) {
        console.error('[schedule] account.reconnect failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Schedule' },
  );

  commands.register(
    'ru-soam-schedule.account.delete',
    'Delete Account',
    async (ctx: unknown) => {
      const c = ctx as Record<string, unknown>;
      const accountId = c?.accountId;
      if (typeof accountId !== 'string' || accountId.length === 0) {
        console.warn('[schedule] account.delete: missing or invalid accountId in ctx', ctx);
        return;
      }
      const proxy = await window.soam.bindCommand('schedule.calendar', '1.0');
      try {
        await proxy.call('deleteAccount', accountId);
        bumpScheduleCalRev();
      } catch (err) {
        console.error('[schedule] account.delete failed:', err);
      } finally {
        proxy.dispose();
      }
    },
    { category: 'Schedule' },
  );

  // ── PHI Safety Score — open popover command (ADR-313 Am1, P-D) ────────────
  // The popover is owned by the StatusBar React tree. The command dispatches a
  // custom DOM event that the mounted PhiSafetyPopover component picks up.
  commands.register(
    'workbench.phi-safety.show',
    'PHI Safety Score: Show',
    () => requestOpenPhiSafetyPopover(),
    { category: 'View' },
  );

  // Wire editor active-instance changes → patient.activeId / record.activeId context keys.
  // Reads entityId from the active EditorInstance (set by EditorService.open({entityId})).
  // These are domain-reserved keys (ADR-407); only domain code may write them.
  // The base shell Parts (AuxSideBar, Panel) read them generically via record.activeId.
  // ADR-106: domain code owns the mapping; base shell stays domain-free.
  const contextKeys = registry.get(ContextKeyServiceId);
  const editor = registry.get(EditorServiceId);

  // Seed initial values so context keys exist from boot.
  contextKeys.set('patient.activeId', '');
  contextKeys.set('record.activeId', '');

  // schedule.activeEvent — true when the Schedule tab is focused AND an event is selected.
  // Used by the aux viewContainer when-clause for event-detail.html.
  // Domain-reserved schedule.* namespace; only domain code writes it.
  const activeEventSvc = registry.get(ActiveEventServiceId);
  contextKeys.set('schedule.activeEvent', false);

  // Unified context sync — called on both editor focus changes and active-event changes.
  // Keeps patient.activeId / record.activeId / schedule.activeEvent mutually consistent.
  //
  // Rules:
  //   patient.activeId / record.activeId — only non-empty for Practice record tabs
  //     (resource contains 'ru-soam-practice/'). Schedule and other tabs yield ''.
  //     This prevents the Practice aux container from shadowing Schedule's event-detail
  //     container when the Schedule tab is focused (symptom: "Client not found: schedule").
  //
  //   schedule.activeEvent — true only when the Schedule calendar tab is focused
  //     (resource contains 'ru-soam-schedule/schedule.html') AND an event is selected.
  //     Switching to a Practice tab drops schedule.activeEvent regardless of registration
  //     order between the two aux containers.
  //
  // ADR-106: domain code owns this mapping; base shell stays domain-free.
  function syncContext(): void {
    const gid = editor.getFocusedGroupId();
    const group = gid ? editor.getGroup(gid) : undefined;
    const inst = group?.activeTabId ? group.tabs.find((t) => t.id === group.activeTabId) : undefined;
    const res = inst?.resource ?? '';

    // Only adopt entityId as patient id for Practice record tabs.
    const isPatientTab = res.includes('ru-soam-practice/');
    const patientId = isPatientTab ? (inst?.entityId ?? '') : '';
    contextKeys.set('patient.activeId', patientId);
    contextKeys.set('record.activeId', patientId);

    // schedule.activeEvent: focused tab must be the Schedule calendar view.
    const scheduleFocused = res.includes('ru-soam-schedule/schedule.html');

    // When the schedule tab loses focus (or is closed), clear any stale active event
    // so event-detail.html doesn't persist a stale selection across remount/tab-switch.
    // setActiveEvent(null) fires onDidChange → syncContext again; second call is
    // a no-op because scheduleFocused is still false and activeEvent is now null.
    if (!scheduleFocused && activeEventSvc.getActiveEvent() !== null) {
      activeEventSvc.setActiveEvent(null);
      // Context key will be set to false on the recursive syncContext call above.
      return;
    }

    contextKeys.set('schedule.activeEvent', scheduleFocused && activeEventSvc.getActiveEvent() !== null);
  }

  // Subscribe and sync for the app lifetime.
  // The disposables intentionally live for the whole session (no teardown
  // needed — domainBootstrap is called once at composition root init).
  activeEventSvc.onDidChange(() => syncContext());
  editor.onDidChange(syncContext);
  // Sync once immediately in case editor already has a focused tab.
  syncContext();
}
