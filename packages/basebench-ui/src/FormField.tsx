import { Field } from '@base-ui/react/field';
import { cn } from './cn';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

/**
 * FormField — a recipe over the Base UI `Field` primitive (ADR-421 F4 4e).
 *
 * Composes `Field.Root` / `Field.Label` / `Field.Error` (standard primitives,
 * no bespoke wrapper API beyond the stable label+control+error shape used by
 * ~9 call sites). `invalid` drives Root validity; `Field.Error match` force-shows
 * the caller-supplied string with Base UI's accessible error wiring. Control is
 * caller-supplied `children` associated via explicit `htmlFor`/`id`.
 */
export function FormField({ label, htmlFor, error, children, className }: FormFieldProps) {
  return (
    <Field.Root invalid={Boolean(error)} className={cn('flex flex-col gap-1.5', className)}>
      <Field.Label
        htmlFor={htmlFor}
        className="block text-xs font-semibold tracking-[0.02em] text-muted-foreground"
      >
        {label}
      </Field.Label>
      {children}
      {error && (
        <Field.Error match className="m-0 flex items-center gap-1.5 text-xs text-destructive">
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}
