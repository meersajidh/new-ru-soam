/**
 * Icon — the single inline-SVG icon component (ADR-421 F3, D5).
 *
 * ONE component for BOTH render surfaces (shell app:// and view:// iframes).
 * Renders inline SVG via the mounted source (Phosphor today) resolved through
 * icon-registry. Inline SVG is CSP-clean in the sandboxed view origin (no
 * runtime <style>, no network) — the reason the former two-Icon split (font in
 * shell, SVG in views) is dissolved.
 *
 * Colour inherits via `currentColor` (Phosphor default). Size defaults to the
 * ambient font-size (`1em`) when omitted — matching the old codicon-font
 * behaviour, so call sites that relied on font-size still size correctly.
 * aria-hidden by default (decorative); pass `title` for a labelled icon.
 */
import type { IconWeight } from '@phosphor-icons/react';
import { resolveIcon } from './icon-registry';

export interface IconProps {
  /** Semantic icon id — resolved via icon-registry (never a raw glyph name). */
  name: string;
  /** Size in px. Omit to inherit the ambient font-size (`1em`). */
  size?: number;
  /** Phosphor weight; overrides the registry entry's default. */
  weight?: IconWeight;
  /** Extra CSS class names forwarded to the <svg>. */
  className?: string;
  /** Accessible label; only provide when the icon is NOT decorative. */
  title?: string;
}

export function Icon({ name, size, weight, className, title }: IconProps) {
  const entry = resolveIcon(name);
  const Glyph = entry.icon;
  return (
    <Glyph
      size={size}
      weight={weight ?? entry.weight ?? 'regular'}
      mirrored={entry.mirrored}
      className={className}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    />
  );
}
