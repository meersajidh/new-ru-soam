// ClassBadge — event-classification pill (domain recipe over @basebench/ui Badge).
// Lives in the bundle (ADR-106: classification is a domain concept; base Badge
// stays domain-agnostic). Unifies the agenda EventCard + hover-popover pills
// that both rendered the old .event-kind-badge. Grid chips (tg-*, month-*) keep
// their bespoke geometry — they fill grid cells, not pill-shaped.
import { Badge } from '@basebench/ui';
import { classClass, classLabel } from './schedule-lib';

type Ev = Parameters<typeof classClass>[0];

// Per-class tint (color + border + bg), mirroring the retired .event-kind-badge
// classification modifiers.
const CLS_TINT: Record<string, string> = {
  'cls-client': 'border-success/40 bg-success/8 text-success',
  'cls-not': 'border-border/60 bg-background/40 text-muted-foreground opacity-60',
  'cls-personal': 'border-info/40 bg-info/8 text-info',
  'cls-unclassified': 'border-border/80 bg-background/60 text-muted-foreground',
};

export function ClassBadge({ ev, className }: { ev?: Ev; className?: string }) {
  const tint = CLS_TINT[classClass(ev)] ?? CLS_TINT['cls-unclassified'];
  return (
    <Badge
      variant="outline"
      size="xs"
      className={`rounded-full px-2 py-[3px] text-4xs font-bold tracking-[0.06em] uppercase ${tint}${className ? ` ${className}` : ''}`}
    >
      {classLabel(ev)}
    </Badge>
  );
}
