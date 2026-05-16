import type { RuEditActiveState, RuEditHandle } from '@ru-soam/editor';
import {
  runRedo,
  runUndo,
  setHeading,
  toggleCode,
  toggleEm,
  toggleStrong,
  toggleUnderline,
  wrapInBulletList,
  wrapInOrderedList,
} from '@ru-soam/editor';

interface Props {
  /** Late-bound handle accessor — toolbar renders before the editor mounts. */
  readonly getHandle: () => RuEditHandle | null;
  /** Current active state snapshot; null before the editor mounts. */
  readonly active: RuEditActiveState | null;
}

interface ButtonSpec {
  readonly label: string;
  readonly title: string;
  readonly run: (h: RuEditHandle) => boolean;
  readonly isActive?: (s: RuEditActiveState) => boolean;
  readonly isDisabled?: (s: RuEditActiveState) => boolean;
}

const SPECS: ReadonlyArray<readonly [string, ReadonlyArray<ButtonSpec>]> = [
  ['inline', [
    { label: 'B', title: 'Bold (Mod-B)', run: toggleStrong, isActive: (s) => s.marks.strong },
    { label: 'I', title: 'Italic (Mod-I)', run: toggleEm, isActive: (s) => s.marks.em },
    { label: 'U', title: 'Underline (Mod-U)', run: toggleUnderline, isActive: (s) => s.marks.underline },
    { label: '<>', title: 'Code (Mod-`)', run: toggleCode, isActive: (s) => s.marks.code },
  ]],
  ['heading', [
    { label: 'H1', title: 'Heading 1 (Mod-1)', run: (h) => setHeading(h, 1), isActive: (s) => s.headingLevel === 1 },
    { label: 'H2', title: 'Heading 2 (Mod-2)', run: (h) => setHeading(h, 2), isActive: (s) => s.headingLevel === 2 },
    { label: 'H3', title: 'Heading 3 (Mod-3)', run: (h) => setHeading(h, 3), isActive: (s) => s.headingLevel === 3 },
  ]],
  ['list', [
    { label: '• List', title: 'Bullet list', run: wrapInBulletList, isActive: (s) => s.inBulletList },
    { label: '1. List', title: 'Ordered list', run: wrapInOrderedList, isActive: (s) => s.inOrderedList },
  ]],
  ['history', [
    { label: 'Undo', title: 'Undo (Mod-Z)', run: runUndo, isDisabled: (s) => !s.canUndo },
    { label: 'Redo', title: 'Redo (Mod-Shift-Z)', run: runRedo, isDisabled: (s) => !s.canRedo },
  ]],
];

export default function RuEditToolbar({ getHandle, active }: Props) {
  const onClick = (spec: ButtonSpec) => (e: React.MouseEvent) => {
    e.preventDefault();
    const h = getHandle();
    if (!h) return;
    spec.run(h);
  };

  return (
    <div className="ru-edit-toolbar" role="toolbar" aria-label="RuEdit toolbar">
      {SPECS.map(([group, specs]) => (
        <div key={group} className="ru-edit-toolbar-group">
          {specs.map((s) => {
            const isActive = !!(active && s.isActive?.(active));
            const isDisabled = !!(active && s.isDisabled?.(active));
            const cls = `ru-edit-toolbar-btn${isActive ? ' is-active' : ''}`;
            return (
              <button
                key={s.label}
                type="button"
                title={s.title}
                className={cls}
                aria-pressed={s.isActive ? isActive : undefined}
                disabled={isDisabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClick(s)}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
