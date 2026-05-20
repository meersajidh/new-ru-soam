import { cn } from './cn';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-fg-secondary block"
        style={{ letterSpacing: '0.02em' }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-error m-0 flex items-center gap-1.5">{error}</p>
      )}
    </div>
  );
}
