/** Shared password input with inline eye-toggle. */

import './PasswordInput.css';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextInput } from '../ui/TextInput';

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
  /** Forwarded to the underlying <input> for programmatic focus. */
  inputRef?: React.Ref<HTMLInputElement>;
}

export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete = 'current-password',
  name,
  inputRef,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="pw-wrap">
      <TextInput
        ref={inputRef}
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className="pr-[42px]"
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
        aria-pressed={show}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
