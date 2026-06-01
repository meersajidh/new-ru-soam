/**
 * AccountSelect — themed listbox replacing a native <select> for the sign-in
 * account picker. Thin wrapper over the shared <Select> primitive.
 *
 * Public props unchanged so LoginModal needs no edits.
 */

import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import Select from '../../platform/popover/Select';
import './AccountSelect.css';

interface AccountSelectProps {
  id?: string;
  accounts: WorkspaceMeta[];
  /** Selected workspaceId. */
  value: string;
  onChange: (workspaceId: string) => void;
  /** Forwarded to the trigger button for programmatic focus. */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  triggerRef,
}: AccountSelectProps) {
  return (
    <div className="account-select">
      <Select
        id={id}
        items={accounts.map((a) => ({ id: a.workspaceId, label: a.nickname }))}
        value={value}
        onChange={onChange}
        triggerRef={triggerRef}
        aria-label="Account"
        className="account-select__trigger"
      />
    </div>
  );
}
