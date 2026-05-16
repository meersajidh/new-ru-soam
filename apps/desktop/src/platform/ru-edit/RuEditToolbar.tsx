import type { RuEditHandle } from '@ru-soam/editor';
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
}

interface ButtonSpec {
  readonly label: string;
  readonly title: string;
  readonly run: (h: RuEditHandle) => boolean;
}

const SPECS: ReadonlyArray<readonly [string, ReadonlyArray<ButtonSpec>]> = [
  ['inline', [
    { label: 'B', title: 'Bold (Mod-B)', run: toggleStrong },
    { label: 'I', title: 'Italic (Mod-I)', run: toggleEm },
    { label: 'U', title: 'Underline (Mod-U)', run: toggleUnderline },
    { label: '<>', title: 'Code (Mod-`)', run: toggleCode },
  ]],
  ['heading', [
    { label: 'H1', title: 'Heading 1 (Mod-1)', run: (h) => setHeading(h, 1) },
    { label: 'H2', title: 'Heading 2 (Mod-2)', run: (h) => setHeading(h, 2) },
    { label: 'H3', title: 'Heading 3 (Mod-3)', run: (h) => setHeading(h, 3) },
  ]],
  ['list', [
    { label: '• List', title: 'Bullet list', run: wrapInBulletList },
    { label: '1. List', title: 'Ordered list', run: wrapInOrderedList },
  ]],
  ['history', [
    { label: 'Undo', title: 'Undo (Mod-Z)', run: runUndo },
    { label: 'Redo', title: 'Redo (Mod-Shift-Z)', run: runRedo },
  ]],
];

export default function RuEditToolbar({ getHandle }: Props) {
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
          {specs.map((s) => (
            <button
              key={s.label}
              type="button"
              title={s.title}
              className="ru-edit-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClick(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
