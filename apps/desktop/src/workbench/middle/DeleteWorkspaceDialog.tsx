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
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  FormField,
  Icon,
} from '@basebench/ui';
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <div className="delete-workspace-header">
          <div className="delete-workspace-icon" aria-hidden="true">
            <Icon name="trash" size={22} />
          </div>
          <DialogTitle className="delete-workspace-title">Delete account</DialogTitle>
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
          <Input
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

        <DialogFooter className="mt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!canSubmit}
          >
            {loading ? 'Deleting…' : 'Delete account'}
          </Button>
        </DialogFooter>
      </form>
      </DialogContent>
    </Dialog>
  );
}
