/**
 * Icon — shell-wide codicon icon component.
 *
 * Renders a <i class="codicon codicon-<glyph>"> element.
 * Codicons are font-based: size = font-size (not width/height).
 * aria-hidden by default — icons are decorative; parent elements own the label.
 */
import '@vscode/codicons/dist/codicon.css';
import { resolveIconGlyph } from './icon-registry';

export interface IconProps {
  /** Semantic icon id — resolved via icon-registry to a codicon glyph. */
  name: string;
  /** Font size in px. Codicons size via font-size, not width/height. */
  size?: number;
  /** Extra CSS class names forwarded to the <i> element. */
  className?: string;
  /** Accessible title; only provide when icon is NOT decorative. */
  title?: string;
}

export function Icon({ name, size, className, title }: IconProps) {
  const glyph = resolveIconGlyph(name);
  const classes = ['codicon', `codicon-${glyph}`, className].filter(Boolean).join(' ');

  return (
    // Alignment handled by the base `.codicon` rule (display:inline-block,
    // text-align:center, line-height:1); inline fontSize overrides the 16px
    // shorthand (no !important) to preserve per-call-site sizing.
    <i
      className={classes}
      style={size !== undefined ? { fontSize: size } : undefined}
      aria-hidden={title ? undefined : true}
      title={title}
    />
  );
}
