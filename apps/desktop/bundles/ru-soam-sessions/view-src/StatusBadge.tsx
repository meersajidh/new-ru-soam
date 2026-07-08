// Session/meeting status badge — ONE canonical look across the Sessions views
// (meetings list + meeting-record). Recipe over the base @basebench/ui Badge
// primitive: base gives the shadcn shape (h-5, rounded-3xl, px), this maps the
// domain status vocabulary → a colour class. Unifies the two previously-divergent
// bespoke `.status-badge` impls (ADR-421 F5·2).
import { Badge } from '@basebench/ui';

const STATUS: Record<string, { cls: string; label: string }> = {
  scheduled: { cls: 'bg-primary/12 text-primary', label: 'Scheduled' },
  completed: { cls: 'bg-muted text-muted-foreground', label: 'Completed' },
  cancelled: { cls: 'bg-destructive/10 text-destructive', label: 'Cancelled' },
  no_show: { cls: 'bg-warning/12 text-warning', label: 'No-show' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? STATUS.scheduled;
  return (
    <Badge className={`border-transparent ${s.cls}${className ? ` ${className}` : ''}`}>
      {s.label}
    </Badge>
  );
}
