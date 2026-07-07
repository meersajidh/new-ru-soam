/**
 * ClientEraseDialog — DPDP right-to-erasure confirmation.
 *
 * Gated by typing the client's display name exactly (irreversible).
 * Mirrors DeleteWorkspaceDialog pattern (ADR-417 PHI pattern: renderer-domain
 * command; PHI/clientId never enters Bundle Host).
 *
 * Future home: data-rights area in Consent & Legal aspect (Phase 2).
 */

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { useModalKeys, Dialog, Button, TextInput, FormField, Icon } from '@basebench/ui';
import { useService } from '../platform/services/hooks';
import { EditorServiceId, ScheduleViewStateServiceId } from '../platform/services/ids';
import {
  getClientEraseState,
  clearClientErase,
  subscribeClientErase,
} from './clientEraseState';
import { DELETE_WARNING_ADDENDUM } from './product';
import './ClientEraseDialog.css';

function ClientEraseDialogInner({
  clientId,
  displayName,
  onClose,
}: {
  clientId: string;
  displayName: string;
  onClose: () => void;
}) {
  const editor = useService(EditorServiceId);
  const scheduleViewState = useService(ScheduleViewStateServiceId);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useModalKeys(onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const nameMatch = nameInput.trim() === displayName;
  const canSubmit = nameMatch && !loading;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setNameError('');
    setGeneralError('');

    try {
      const proxy = await window.soam.bindCommand('record.patient', '1.0');
      try {
        await proxy.call('erase', clientId);
      } finally {
        proxy.dispose();
      }

      // Close any open editor tabs for this client (by entityId).
      for (const group of editor.getGroups()) {
        for (const tab of group.tabs) {
          if (tab.entityId === clientId) {
            editor.close(tab.id);
          }
        }
      }

      // Bump calRev so the open schedule calendar re-classifies events for this
      // client (erased client can no longer be PROBABLE/CLIENT — falls to unclassified).
      scheduleViewState.bumpCalRev();

      onClose();
    } catch (err) {
      setGeneralError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={true} onClose={onClose} width={440} aria-labelledby="client-erase-title">
      <div className="client-erase-header">
        <div className="client-erase-icon" aria-hidden="true">
          <Icon name="trash" size={22} />
        </div>
        <h2 id="client-erase-title" className="client-erase-title">
          Erase client record
        </h2>
      </div>

      <div className="client-erase-warning" role="alert">
        <p className="client-erase-warning-headline">This cannot be undone.</p>
        <p className="client-erase-warning-body">
          Erasing <strong>&ldquo;{displayName}&rdquo;</strong> permanently deletes all
          demographic, profile, and lifecycle data stored for this client. This is an
          irreversible DPDP right-to-erasure action. An audit event will be recorded.{' '}
          {DELETE_WARNING_ADDENDUM}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField
          label={`Type the client name to confirm: "${displayName}"`}
          htmlFor="ce-name"
          error={nameError || null}
        >
          <TextInput
            id="ce-name"
            ref={inputRef}
            type="text"
            value={nameInput}
            onChange={(e) => {
              setNameInput(e.target.value);
              setNameError('');
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>

        {generalError && (
          <p className="text-xs text-error m-0 flex items-center gap-1.5">{generalError}</p>
        )}

        <div className="setup-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!canSubmit}>
            {loading ? 'Erasing…' : 'Erase client'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function ClientEraseDialog() {
  const state = useSyncExternalStore(subscribeClientErase, getClientEraseState);

  if (!state) return null;

  return (
    <ClientEraseDialogInner
      clientId={state.clientId}
      displayName={state.displayName}
      onClose={clearClientErase}
    />
  );
}
