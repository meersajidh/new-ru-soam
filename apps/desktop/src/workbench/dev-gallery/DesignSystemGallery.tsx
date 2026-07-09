// The design-system gallery (ADR-421 F6) — opens as an editor tab via the
// `devtool://design-system` resource (renderEditor branch in EditorGroup.tsx),
// launched by the dev-only "Developer: Open Design System Gallery" command.
//
// Discoverability = the Storybook replacement (docs/Guides/design-system.md §5).
// Renders every @basebench/ui primitive in the REAL renderer: real tokens, real
// DI, real fonts, live class-axis toggles (mode × font-set × font-scale). This is
// the first place to look before building new UI. Dev-only (command + protocol gated).
//
// It deliberately styles itself from the base-luma token contract only (no bespoke
// palette) so the page IS the system rendered truthfully — the specimen and its
// frame share one identity.
import { useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  FormField,
  Icon,
  Input,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@basebench/ui';
import { useService } from '../../platform/services/hooks';
import { FontServiceId, FontScaleServiceId, ThemeServiceId } from '../../platform/services/ids';
import type { FontScale } from '../../platform/font/font-scale-service';

// ── Building blocks ──────────────────────────────────────────────────────────

/** Re-render this tree whenever `subscribe` fires. */
function useServiceSignal(subscribe: (cb: () => void) => () => void): void {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), [subscribe]);
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-4xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

/** One primitive panel: numbered marker, title, import line, live specimen. */
function Panel({
  index,
  title,
  importLine,
  children,
}: {
  index: string;
  title: string;
  importLine: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs font-semibold text-muted-foreground/70">{index}</span>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <code className="ml-auto rounded-md bg-muted px-2 py-1 font-mono text-2xs text-muted-foreground">
          {importLine}
        </code>
      </header>
      <div className="rounded-2xl border border-border bg-card p-6">{children}</div>
    </section>
  );
}

/** Labelled specimen cell — the mono label reads like a spec sheet. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-3xs uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Segmented axis control, styled from the token contract. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Axis toolbar ─────────────────────────────────────────────────────────────

function AxisToolbar() {
  const themeSvc = useService(ThemeServiceId);
  const fontSvc = useService(FontServiceId);
  const scaleSvc = useService(FontScaleServiceId);

  useServiceSignal(themeSvc.onDarkModeChange.bind(themeSvc));
  useServiceSignal(fontSvc.onFontSetChange.bind(fontSvc));
  useServiceSignal(scaleSvc.onDidChange.bind(scaleSvc));

  const dark = themeSvc.isDark();
  const fontSets = fontSvc.list();
  const activeFont = fontSvc.getActive().id;
  const scale = scaleSvc.getScale();
  const scales: FontScale[] = [1, 1.1, 1.2];

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <div className="flex items-center gap-2.5">
        <Eyebrow>Mode</Eyebrow>
        <Segmented
          value={dark ? 'dark' : 'light'}
          onChange={(v) => themeSvc.setDarkMode(v === 'dark')}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Eyebrow>Font set</Eyebrow>
        <Segmented
          value={activeFont}
          onChange={(v) => fontSvc.setFontSet(v)}
          options={fontSets.map((f) => ({ value: f.id, label: f.label }))}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Eyebrow>Scale</Eyebrow>
        <Segmented
          value={scale}
          onChange={(v) => scaleSvc.setScale(v)}
          options={scales.map((s) => ({ value: s, label: `${Math.round(s * 100)}%` }))}
        />
      </div>
    </div>
  );
}

// ── Primitive panels ─────────────────────────────────────────────────────────

const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;

function ButtonsPanel() {
  return (
    <Panel index="01" title="Button" importLine="import { Button } from '@basebench/ui'">
      <div className="flex flex-col gap-5">
        <Cell label="variant">
          {BUTTON_VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </Cell>
        <Cell label="size">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add">
            <Icon name="file-add" size={16} />
          </Button>
        </Cell>
        <Cell label="with icon / disabled">
          <Button>
            <Icon name="cloud-upload" size={15} /> Publish
          </Button>
          <Button variant="outline">
            <Icon name="link-external" size={15} /> Open
          </Button>
          <Button disabled>Disabled</Button>
        </Cell>
      </div>
    </Panel>
  );
}

const BADGE_VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost'] as const;

function BadgesPanel() {
  return (
    <Panel index="02" title="Badge" importLine="import { Badge } from '@basebench/ui'">
      <div className="flex flex-col gap-5">
        <Cell label="variant">
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </Cell>
        <Cell label="size — default · sm · xs">
          <Badge size="default">default</Badge>
          <Badge size="sm">sm</Badge>
          <Badge size="xs">xs</Badge>
        </Cell>
        <Cell label="tinted (className over outline)">
          <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
            <Icon name="shield-check" size={12} /> Verified
          </Badge>
          <Badge variant="outline" className="border-info/40 bg-info/10 text-info">
            Info
          </Badge>
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
            <Icon name="triangle-alert" size={12} /> Attention
          </Badge>
        </Cell>
        <p className="max-w-prose text-xs text-muted-foreground">
          Domain badges (session status, event classification) are recipes over this base in each
          bundle&rsquo;s <code className="font-mono">view-src</code>, not shared primitives — the base
          stays domain-agnostic (ADR-106).
        </p>
      </div>
    </Panel>
  );
}

function CardPanel() {
  return (
    <Panel index="03" title="Card" importLine="import { Card, CardHeader, … } from '@basebench/ui'">
      <Card size="sm" className="max-w-sm rounded-2xl">
        <CardHeader>
          <CardTitle>Next session</CardTitle>
          <CardDescription>Thu 04 Jun · 11:00 · tele-session</CardDescription>
          <CardAction>
            <Badge variant="outline" size="sm">
              online
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sleep improving on sertraline. Mood reactive, no intent — continue BA homework.
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm">
            <Icon name="open-in-window" size={14} /> Open prep
          </Button>
        </CardFooter>
      </Card>
    </Panel>
  );
}

function FormPanel() {
  const [name, setName] = useState('Anindita Bhattacharya');
  const [code, setCode] = useState('');
  return (
    <Panel index="04" title="Input · FormField" importLine="import { Input, FormField } from '@basebench/ui'">
      <div className="grid max-w-xl gap-5 sm:grid-cols-2">
        <FormField label="Display name" htmlFor="gal-name">
          <Input id="gal-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField
          label="Client code"
          htmlFor="gal-code"
          error={code.length > 0 && code.length < 3 ? 'At least 3 characters.' : null}
        >
          <Input
            id="gal-code"
            value={code}
            placeholder="e.g. AB-04"
            onChange={(e) => setCode(e.target.value)}
          />
        </FormField>
      </div>
    </Panel>
  );
}

function OverlaysPanel() {
  const [checked, setChecked] = useState(true);
  const [density, setDensity] = useState('comfortable');
  const [fruit, setFruit] = useState<string | null>('apple');
  const fruits = [
    { value: 'apple', label: 'Apple' },
    { value: 'orange', label: 'Orange' },
    { value: 'pear', label: 'Pear' },
  ];
  return (
    <Panel index="05" title="Overlays" importLine="Dialog · DropdownMenu · Popover · Select">
      <div className="flex flex-col gap-5">
        <Cell label="Dialog">
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="outline">
                  <Icon name="open-in-window" size={15} /> Open dialog
                </Button>
              }
            />
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle>Discharge client?</DialogTitle>
                <DialogDescription>
                  This moves the record to the discharged lifecycle stage. You can reactivate later.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost">Cancel</Button>} />
                <DialogClose render={<Button variant="destructive">Discharge</Button>} />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Cell>

        <Cell label="DropdownMenu">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline">
                  Actions <Icon name="chevron-down" size={14} />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Record</DropdownMenuLabel>
              <DropdownMenuItem>
                <Icon name="file-text" size={14} /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Icon name="person-add" size={14} /> Add to circle
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
                Show archived
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Density</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Cell>

        <Cell label="Popover">
          <Popover>
            <PopoverTrigger render={<Button variant="outline">Open popover</Button>} />
            <PopoverContent className="w-72">
              <PopoverHeader>
                <PopoverTitle>PHI safety</PopoverTitle>
                <PopoverDescription>
                  Read-only provider data, no cloud sync — reading your own calendar locally is not
                  egress.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </Cell>

        <Cell label="Select">
          <div className="w-56">
            <Select items={fruits} value={fruit} onValueChange={(v) => setFruit(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fruits.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Cell>
      </div>
    </Panel>
  );
}

const ICON_SAMPLE = [
  'shield-check',
  'shield-warning',
  'triangle-alert',
  'bell-dot',
  'check',
  'check-all',
  'circle-filled',
  'file-text',
  'file-add',
  'clipboard-list',
  'book-open',
  'person-add',
  'group-by-ref-type',
  'link-external',
  'open-in-window',
  'cloud-upload',
  'cloud-download',
  'cloud-disconnected',
  'eye-off',
  'bar-chart-2',
  'layout-grid',
  'panel-left',
  'panel-right',
  'panel-bottom',
  'split-horizontal',
  'sign-out',
  'theme-light',
  'theme-dark',
  'chevron-down',
  'arrow-right',
];

function IconsPanel() {
  return (
    <Panel index="06" title="Icon" importLine="import { Icon } from '@basebench/ui'">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {ICON_SAMPLE.map((name) => (
          <div
            key={name}
            className="flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2 py-3 text-center"
          >
            <Icon name={name} size={20} className="text-foreground" />
            <span className="w-full truncate font-mono text-3xs text-muted-foreground" title={name}>
              {name}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export default function DesignSystemGallery() {
  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8 text-center text-sm text-muted-foreground">
        The design-system gallery is a development-only route.
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-6 py-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Design system</h1>
            <span className="font-mono text-2xs text-muted-foreground">
              @basebench/ui · base-luma
            </span>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            Every base primitive, rendered in the real renderer under the live token contract. Toggle
            the class axes and watch the whole page follow — the specimen and its frame share one
            identity. Look here before building new UI.
          </p>
          <AxisToolbar />
        </div>
      </header>
      <main className="mx-auto flex max-w-[1120px] flex-col gap-12 px-6 py-10">
        <ButtonsPanel />
        <BadgesPanel />
        <CardPanel />
        <FormPanel />
        <OverlaysPanel />
        <IconsPanel />
      </main>
    </div>
  );
}
