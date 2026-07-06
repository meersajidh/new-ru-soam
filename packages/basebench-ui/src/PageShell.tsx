import './PageShell.css';
import { cn } from './cn';

interface PageShellProps {
  topbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PageShell({ topbar, children, className }: PageShellProps) {
  return (
    <div className={cn('page-shell', className)}>
      {topbar !== undefined && <div className="page-shell-topbar">{topbar}</div>}
      {children}
    </div>
  );
}
