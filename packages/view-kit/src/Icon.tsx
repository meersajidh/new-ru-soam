import { CODICON_PATHS } from './codicon-paths.js';

interface IconProps {
  /** Codicon name (e.g. `'calendar'`, `'sync'`, `'close'`). */
  name: string;
  /**
   * Width and height in pixels.
   * @default 13
   */
  size?: number;
  /** Additional CSS class names for the outer <svg> element. */
  className?: string;
}

/**
 * Inline-SVG codicon icon component (ADR-413 Am1).
 *
 * Renders a 16×16 viewBox SVG scaled to `size` pixels. Uses `fill="currentColor"`
 * so colour is inherited from the surrounding text / CSS. Unknown names render
 * an empty SVG placeholder of the same dimensions.
 *
 * No dependency on `window.codicon` — path data is bundled via codicon-paths.ts.
 */
export function Icon({ name, size = 13, className }: IconProps) {
  const entry = CODICON_PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {entry
        ? entry.paths.map((pathSpec, i) => (
            <path
              key={i}
              d={pathSpec.d}
              fillRule={pathSpec.fillRule}
              clipRule={pathSpec.fillRule}
            />
          ))
        : null}
    </svg>
  );
}
