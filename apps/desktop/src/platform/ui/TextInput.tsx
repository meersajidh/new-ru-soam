import './TextInput.css';
import { cn } from './cn';

type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function TextInput({ className, ref, ...rest }: TextInputProps) {
  return <input ref={ref} className={cn('text-input', className)} {...rest} />;
}
