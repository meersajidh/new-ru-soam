/** Shared password input with inline eye-toggle. */

import './PasswordInput.css';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
}

export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete = 'current-password',
  name,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="pw-wrap">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        className="setup-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
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
