/**
 * AccountSelect — themed listbox for the sign-in account picker.
 *
 * A recipe composing the standard Base UI Select compound over domain data
 * (WorkspaceMeta → {value, label}). Public props unchanged so LoginModal needs
 * no edits. Trigger is full-width to sit flush with the passphrase field; base
 * styling (rounded-3xl bg-input/50) matches the shared Input primitive.
 */

import type { WorkspaceMeta } from '../../../electron/shared/lock-protocol';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@basebench/ui';

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
  const items = accounts.map((a) => ({ value: a.workspaceId, label: a.nickname }));

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => {
        if (v != null) onChange(v as string);
      }}
    >
      <SelectTrigger id={id} ref={triggerRef} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.workspaceId} value={a.workspaceId}>
            {a.nickname}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
