/**
 * Icon registry — semantic-id → glyph mapping (ADR-421 F3, D5).
 *
 * ONE multi-source registry, both render surfaces. Each entry names a SOURCE
 * (the icon set the glyph comes from) + the glyph itself. **Phosphor is the
 * primary — and, today, only mounted — source** (`@phosphor-icons/react`).
 * Codicon / Fluent remain *mountable*: add a source branch to `IconEntry` +
 * `resolveIcon` and register its glyphs — no call-site change. The `source:`
 * name-prefix seam (`resolveIcon('phosphor:gear')`) is reserved for forcing a
 * specific source on collision; only `phosphor` is valid now.
 *
 * This is the ONE place to touch when swapping/curating icons. Call sites pass
 * a stable semantic id (e.g. `settings`, `shield-check`) — never a raw glyph.
 *
 * NOTE: Phosphor v2.1 uses `*Icon`-suffixed component exports (`GearIcon`); the
 * bare names (`Gear`) are deprecated aliases — always import the suffixed form.
 */
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretUpIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  SidebarSimpleIcon,
  SquareHalfBottomIcon,
  MinusIcon,
  SquareIcon,
  XIcon,
  CheckIcon,
  CopyIcon,
  PlusIcon,
  FloppyDiskIcon,
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  TrashIcon,
  PushPinIcon,
  FlagIcon,
  ChecksIcon,
  LinkIcon,
  ArrowSquareOutIcon,
  SplitHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
  LockIcon,
  LockOpenIcon,
  KeyIcon,
  SignOutIcon,
  ShieldIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  WarningIcon,
  InfoIcon,
  CheckCircleIcon,
  FileIcon,
  FilePlusIcon,
  FileTextIcon,
  NotePencilIcon,
  FolderIcon,
  FoldersIcon,
  TrayIcon,
  StackIcon,
  BriefcaseIcon,
  BookOpenIcon,
  ClipboardTextIcon,
  ListChecksIcon,
  ChartBarIcon,
  SquaresFourIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  GlobeIcon,
  ScalesIcon,
  StethoscopeIcon,
  PulseIcon,
  HouseIcon,
  HashIcon,
  TreeStructureIcon,
  VideoCameraIcon,
  CloudIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CloudSlashIcon,
  SunIcon,
  MoonIcon,
  BroadcastIcon,
  BellIcon,
  BellRingingIcon,
  CircleIcon,
  QuestionIcon,
  GearIcon,
  KeyReturnIcon,
  CurrencyInrIcon,
  TranslateIcon,
  PillIcon,
  ShieldWarningIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  PencilSimpleIcon,
  DownloadSimpleIcon,
  TargetIcon,
} from '@phosphor-icons/react';

/** Semantic icon id used at every call site (the stable vocabulary). */
export type SemanticIconId = string;

/**
 * A resolved icon. `source` discriminates which set the glyph belongs to —
 * `phosphor` is the only mounted source today; adding `codicon`/`fluent` means
 * a new variant here + a branch in <Icon>. `weight`/`mirrored` are per-entry
 * Phosphor defaults (e.g. filled radio circles, right-side panel).
 */
export interface IconEntry {
  source: 'phosphor';
  icon: PhosphorIcon;
  weight?: IconWeight;
  mirrored?: boolean;
}

function ph(icon: PhosphorIcon, opts?: { weight?: IconWeight; mirrored?: boolean }): IconEntry {
  return { source: 'phosphor', icon, weight: opts?.weight, mirrored: opts?.mirrored };
}

const REGISTRY: Record<SemanticIconId, IconEntry> = {
  // Navigation / chevrons
  'arrow-left': ph(ArrowLeftIcon),
  'arrow-right': ph(ArrowRightIcon),
  'chevron-up': ph(CaretUpIcon),
  'chevron-down': ph(CaretDownIcon),
  'chevron-left': ph(CaretLeftIcon),
  'chevron-right': ph(CaretRightIcon),
  search: ph(MagnifyingGlassIcon),

  // Panel layout toggles (right = left mirrored; bottom = half-bottom square)
  'panel-left': ph(SidebarSimpleIcon),
  'panel-right': ph(SidebarSimpleIcon, { mirrored: true }),
  'panel-bottom': ph(SquareHalfBottomIcon),

  // Window chrome
  'window-minimize': ph(MinusIcon),
  'window-maximize': ph(SquareIcon),
  'window-close': ph(XIcon),

  // Actions
  check: ph(CheckIcon),
  close: ph(XIcon),
  copy: ph(CopyIcon),
  add: ph(PlusIcon),
  edit: ph(PencilSimpleIcon),
  save: ph(FloppyDiskIcon),
  refresh: ph(ArrowClockwiseIcon),
  sync: ph(ArrowsClockwiseIcon),
  trash: ph(TrashIcon),
  pin: ph(PushPinIcon),
  flag: ph(FlagIcon),
  'check-all': ph(ChecksIcon),
  link: ph(LinkIcon),
  'link-external': ph(ArrowSquareOutIcon),
  'open-in-window': ph(ArrowSquareOutIcon),
  'split-horizontal': ph(SplitHorizontalIcon),

  // Visibility
  eye: ph(EyeIcon),
  'eye-off': ph(EyeSlashIcon),

  // Security / auth
  lock: ph(LockIcon),
  unlock: ph(LockOpenIcon),
  key: ph(KeyIcon),
  'sign-out': ph(SignOutIcon),
  shield: ph(ShieldIcon),
  'shield-check': ph(ShieldCheckIcon),

  // Status / severity
  error: ph(WarningCircleIcon),
  warning: ph(WarningIcon),
  info: ph(InfoIcon),
  pass: ph(CheckCircleIcon),

  // Files / data
  file: ph(FileIcon),
  'file-add': ph(FilePlusIcon),
  'file-text': ph(FileTextIcon),
  note: ph(NotePencilIcon),
  folder: ph(FolderIcon),
  files: ph(FoldersIcon),
  inbox: ph(TrayIcon),
  layers: ph(StackIcon, { weight: 'fill' }),
  briefcase: ph(BriefcaseIcon),
  'book-open': ph(BookOpenIcon),
  'clipboard-list': ph(ClipboardTextIcon),
  'check-square': ph(ListChecksIcon),
  'bar-chart-2': ph(ChartBarIcon),
  'layout-grid': ph(SquaresFourIcon),

  // People
  person: ph(UserIcon),
  'person-add': ph(UserPlusIcon),
  users: ph(UsersIcon),

  // Domain
  calendar: ph(CalendarIcon, { weight: 'fill' }),
  clock: ph(ClockIcon),
  clockface: ph(ClockIcon),
  location: ph(MapPinIcon),
  globe: ph(GlobeIcon),
  law: ph(ScalesIcon),
  stethoscope: ph(StethoscopeIcon),
  activity: ph(PulseIcon),
  home: ph(HouseIcon),
  hash: ph(HashIcon),
  'group-by-ref-type': ph(TreeStructureIcon),
  video: ph(VideoCameraIcon),

  // Cloud
  cloud: ph(CloudIcon),
  'cloud-download': ph(CloudArrowDownIcon),
  'cloud-upload': ph(CloudArrowUpIcon),
  'cloud-disconnected': ph(CloudSlashIcon),

  // Theme
  'theme-light': ph(SunIcon),
  'theme-dark': ph(MoonIcon),

  // Telemetry mode indicators
  'telemetry-off': ph(EyeSlashIcon),
  'telemetry-online-only': ph(PulseIcon),
  'telemetry-on': ph(BroadcastIcon),

  // Bell
  bell: ph(BellIcon),
  'bell-dot': ph(BellRingingIcon),

  // Radio / status circles (fill = selected/active state)
  'circle-large-outline': ph(CircleIcon),
  'circle-large-filled': ph(CircleIcon, { weight: 'fill' }),
  'circle-filled': ph(CircleIcon, { weight: 'fill' }),
  'circle-dot': ph(CircleIcon, { weight: 'fill' }),
  dot: ph(CircleIcon, { weight: 'fill' }),

  // Clinical / domain (Practice overview)
  rupee: ph(CurrencyInrIcon),
  translate: ph(TranslateIcon),
  pill: ph(PillIcon),
  'shield-warning': ph(ShieldWarningIcon),

  // Attendee-response badges (schedule responseIcon)
  thumbsup: ph(ThumbsUpIcon),
  thumbsdown: ph(ThumbsDownIcon),
  question: ph(QuestionIcon),

  // Status-bar producers (anchored-ids / boot)
  download: ph(DownloadSimpleIcon),
  moon: ph(MoonIcon),
  target: ph(TargetIcon),
  'triangle-alert': ph(WarningIcon),

  // Misc
  help: ph(QuestionIcon),
  settings: ph(GearIcon),
  newline: ph(KeyReturnIcon),
};

const FALLBACK: IconEntry = ph(QuestionIcon);

/**
 * Resolve a semantic icon id to a glyph entry. Unknown ids fall back to
 * `Question` so the UI never breaks silently. A `source:` prefix (e.g.
 * `phosphor:gear`) forces a source — reserved seam; only `phosphor` today.
 */
export function resolveIcon(name: SemanticIconId): IconEntry {
  const colon = name.indexOf(':');
  const id = colon === -1 ? name : name.slice(colon + 1);
  return REGISTRY[id] ?? FALLBACK;
}
