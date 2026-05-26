import './Button.css';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // default: 'ghost'
  size?: ButtonSize; // default: 'md'
}

export function Button({ variant = 'ghost', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cn('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)}
      {...rest}
    />
  );
}
