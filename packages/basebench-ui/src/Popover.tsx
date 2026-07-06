/**
 * Popover — thin portal surface that positions children at the fixed
 * coordinates computed by usePopover.
 *
 * Consumers:
 *   1. Call usePopover() to get { isOpen, position, setPopoverElement, open, close }.
 *   2. Pass isOpen + position + setPopoverElement to this component.
 *   3. Render content as children.
 *
 * This wrapper only handles portaling + positioning. All focus/dismiss
 * mechanics live in usePopover.
 */

import { createPortal } from 'react-dom';
import type { PopoverPosition } from './use-popover';
import './Popover.css';

interface PopoverProps {
  isOpen: boolean;
  position: PopoverPosition | null;
  /** Attach to the popover root so usePopover can measure + focus it. */
  setPopoverElement: (el: HTMLElement | null) => void;
  children: React.ReactNode;
  /** Extra class names for the shell div. */
  className?: string;
  role?: string;
  'aria-label'?: string;
  tabIndex?: number;
}

export default function Popover({
  isOpen,
  position,
  setPopoverElement,
  children,
  className,
  role,
  'aria-label': ariaLabel,
  tabIndex = -1,
}: PopoverProps) {
  if (!isOpen || !position) return null;

  const shell = (
    <div
      ref={setPopoverElement}
      className={['popover-shell', className].filter(Boolean).join(' ')}
      style={{ left: position.left, top: position.top }}
      role={role}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      data-flipped-up={position.flippedUp}
    >
      {children}
    </div>
  );

  return createPortal(shell, document.body);
}
