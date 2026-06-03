import { ipcMain } from 'electron';
import {
  SOAM_CALL_CHANNEL,
  CapErr,
  type CapabilityCallRequest,
  type CapabilityCallResponse,
} from '../../shared/ipc-protocol';
import { invokeCapability } from '../capability/registry';
import { isPlatformSender } from './sender-validate';

/**
 * Install the single Renderer → Main IPC handler.
 *
 * Per ADR-202, the Renderer's surface is one channel — `soam:call`. Every
 * capability method invocation crosses through here. Sender validation runs
 * before any registry lookup; unregistered senders are rejected at the door.
 */
export function installSoamChannel(): void {
  ipcMain.handle(
    SOAM_CALL_CHANNEL,
    async (event, raw: CapabilityCallRequest): Promise<CapabilityCallResponse> => {
      if (!isPlatformSender(event)) {
        return {
          id: raw.id,
          ok: false,
          error: { code: CapErr.SenderRejected, message: 'Sender not allowlisted' },
        };
      }

      const result = await invokeCapability(raw.capability, raw.version, raw.method, raw.args, {
        expectKind: raw.expectKind,
      });
      if (result.ok) {
        return { id: raw.id, ok: true, data: result.value.data };
      }
      return { id: raw.id, ok: false, error: result.value };
    },
  );
}
