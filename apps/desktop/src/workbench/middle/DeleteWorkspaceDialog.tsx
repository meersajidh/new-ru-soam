/**
 * DeleteWorkspaceDialog — irreversible workspace self-delete confirmation.
 *
 * Gated by typing the workspace nickname exactly. Workspace is already
 * unlocked — passphrase re-entry is confirmation theatre, not a control
 * (ADR-403 §"Workspace deletion (self)").
 *
 * On success the renderer routes automatically — driven by workspace.changed /
 * lock.changed events emitted from Main. This dialog just closes itself and
 * lets the event flow take over.
 *
 * Per ADR-403 §"Workspace deletion (self)": self-delete only, no audit emit.
 */

import { useState, useRef, useEffect } from 'react';
import { useModalKeys, Dialog, Button, TextInput, FormField } from '@basebench/ui';
import { useService } from '../../platform/services/hooks';
import { ProductConfigServiceId } from '../../platform/services/ids';
import './DeleteWorkspaceDialog.css';

interface Props {
  nickname: string;
  onClose: () => void;
}

export default function DeleteWorkspaceDialog({ nickname, onClose }: Props) {
  const productConfig = useService(ProductConfigServiceId);
  const { deleteWarningAddendum } = productConfig.get();
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const nicknameRef = useRef<HTMLInputElement>(null);

  useModalKeys(onClose);

  useEffect(() => {
    nicknameRef.current?.focus();
  }, []);

  const nicknameMatch = nicknameInput.trim() === nickname;
  const canSubmit = nicknameMatch && !loading;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setNicknameError('');
    setGeneralError('');

    try {
      const result = await window.soam.workspace.delete({
        nicknameConfirm: nicknameInput,
      });

      if (result.ok) {
        // Routing handled by workspace.changed / lock.changed events from Main.
        onClose();
        return;
      }

      switch (result.code) {
        case 'nickname-mismatch':
          setNicknameError('Name does not match. Check capitalisation and spacing.');
          setNicknameInput('');
          break;
        case 'locked':
          setGeneralError('Account is locked. Unlock first.');
          break;
        case 'not-active':
          setGeneralError('No active account.');
          break;
        default:
          setGeneralError(result.message ?? 'An unexpected error occurred. Please try again.');
      }
    } catch (err) {
      setGeneralError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      width={440}
      aria-labelledby="delete-workspace-title"
    >
      <div className="delete-workspace-header">
        <div className="delete-workspace-icon" aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>
        <h2 id="delete-workspace-title" className="delete-workspace-title">
          Delete account
        </h2>
      </div>

      <div className="delete-workspace-warning" role="alert">
        <p className="delete-workspace-warning-headline">This cannot be undone.</p>
        <p className="delete-workspace-warning-body">
          Deleting <strong>&ldquo;{nickname}&rdquo;</strong> permanently removes all records,
          notes, and session data stored in this account. Your recovery code will no longer
          work.{deleteWarningAddendum ? ` ${deleteWarningAddendum}` : ''}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField
          label={`Type the account name to confirm: "${nickname}"`}
          htmlFor="dw-nickname"
          error={nicknameError || null}
        >
          <TextInput
            id="dw-nickname"
            ref={nicknameRef}
            type="text"
            value={nicknameInput}
            onChange={(e) => {
              setNicknameInput(e.target.value);
              setNicknameError('');
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
          <Button
            type="submit"
            variant="danger"
            disabled={!canSubmit}
          >
            {loading ? 'Deleting…' : 'Delete account'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
