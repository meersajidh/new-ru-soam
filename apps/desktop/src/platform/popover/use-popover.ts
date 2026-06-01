/**
 * usePopover — headless hook owning all popover mechanics:
 *   - anchor-relative positioning with viewport clamp + edge-flip
 *     (supports BOTTOM-anchored upward opens — e.g. StatusBar)
 *   - outside-click dismiss (capture-phase mousedown)
 *   - Esc dismiss
 *   - focus capture on open + restore-to-trigger on close
 *
 * Consumer renders its own content in a portal. Attach the returned
 * `setPopoverElement` as the element's ref callback so the hook can measure,
 * focus, and detect outside-clicks against it.
 *
 * Anchor union mirrors menu-service showContextMenu: HTMLElement or {x,y} coords.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type PopoverAnchor = HTMLElement | { x: number; y: number };

export interface PopoverPosition {
  left: number;
  top: number;
  /** true when popover flipped upward (anchored below content) */
  flippedUp: boolean;
}

export interface UsePopoverOptions {
  /**
   * Estimated popover height for initial edge-flip + clamp.
   * The hook re-measures after mount via ResizeObserver for subsequent repositions.
   */
  estimatedHeight?: number;
  /** Estimated popover width. Default 220. */
  estimatedWidth?: number;
  /** Minimum gap from viewport edges (px). Default 6. */
  edgeMargin?: number;
  /**
   * Placement strategy for element-anchored popovers.
   * - 'bottom-start' (default): left-aligned, below anchor, flips up when no room.
   * - 'right-end': to the right of anchor, bottom-aligned (grows upward), flips left
   *   when no room to the right.
   * Coord-anchors ({x,y}) always use bottom-start regardless.
   */
  placement?: 'bottom-start' | 'right-end';
  /**
   * Extra gap (px) between anchor edge and popover for 'right-end' placement.
   * Default 0.
   */
  gap?: number;
  onClose?: () => void;
}

export interface UsePopoverReturn {
  isOpen: boolean;
  position: PopoverPosition | null;
  /**
   * Attach this as the ref callback on the popover root element.
   * The hook uses it for measurement, focus capture, and outside-click detection.
   */
  setPopoverElement: (el: HTMLElement | null) => void;
  /** Open popover anchored at the given element or coords. */
  open: (anchor: PopoverAnchor) => void;
  /** Close and restore focus to the element that was focused before open. */
  close: () => void;
  /** Portal target — always document.body. */
  portalTarget: Element;
}

function resolveAnchorRect(anchor: PopoverAnchor): DOMRect {
  if (anchor instanceof HTMLElement) {
    return anchor.getBoundingClientRect();
  }
  return new DOMRect(anchor.x, anchor.y, 0, 0);
}

function computePosition(
  anchorRect: DOMRect,
  popoverW: number,
  popoverH: number,
  edgeMargin: number,
): PopoverPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.left;
  if (left + popoverW > vw - edgeMargin) {
    left = Math.max(edgeMargin, vw - popoverW - edgeMargin);
  }
  left = Math.max(edgeMargin, left);

  const spaceBelow = vh - anchorRect.bottom - edgeMargin;
  const spaceAbove = anchorRect.top - edgeMargin;
  let top: number;
  let flippedUp: boolean;

  if (spaceBelow >= popoverH || spaceBelow >= spaceAbove) {
    top = anchorRect.bottom;
    flippedUp = false;
  } else {
    top = anchorRect.top - popoverH;
    flippedUp = true;
  }
  top = Math.max(edgeMargin, Math.min(top, vh - popoverH - edgeMargin));

  return { left, top, flippedUp };
}

/**
 * 'right-end' placement: popover opens to the RIGHT of the anchor, bottom-aligned
 * (grows upward). Falls back to the LEFT side when there's insufficient room to the right.
 * Applies viewport clamping on both axes.
 */
function computePositionRightEnd(
  anchorRect: DOMRect,
  popoverW: number,
  popoverH: number,
  edgeMargin: number,
  gap: number,
): PopoverPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer right side
  const spaceRight = vw - anchorRect.right - gap - edgeMargin;
  let left: number;
  if (spaceRight >= popoverW) {
    left = anchorRect.right + gap;
  } else {
    // Flip to the left of the anchor
    left = anchorRect.left - gap - popoverW;
  }
  left = Math.max(edgeMargin, Math.min(left, vw - popoverW - edgeMargin));

  // Bottom-align: popover bottom ~= anchor bottom (grows upward)
  let top = anchorRect.bottom - popoverH;
  top = Math.max(edgeMargin, Math.min(top, vh - popoverH - edgeMargin));

  return { left, top, flippedUp: true };
}

export function usePopover(options: UsePopoverOptions = {}): UsePopoverReturn {
  const {
    estimatedHeight = 200,
    estimatedWidth = 220,
    edgeMargin = 6,
    placement = 'bottom-start',
    gap = 0,
  } = options;

  // Use refs so option identities don't force re-registration of effects
  const onCloseRef = useRef(options.onClose);
  useEffect(() => {
    onCloseRef.current = options.onClose;
  });
  const placementRef = useRef(placement);
  const gapRef = useRef(gap);
  useEffect(() => {
    placementRef.current = placement;
    gapRef.current = gap;
  });

  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  // Internal refs — not exposed directly to avoid immutability violations
  const anchorRef = useRef<PopoverAnchor | null>(null);
  const popoverElRef = useRef<HTMLElement | null>(null);
  const prevFocusRef = useRef<Element | null>(null);
  const measuredW = useRef(estimatedWidth);
  const measuredH = useRef(estimatedHeight);

  const reposition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = resolveAnchorRect(anchorRef.current);
    let pos: PopoverPosition;
    if (placementRef.current === 'right-end' && anchorRef.current instanceof HTMLElement) {
      pos = computePositionRightEnd(
        rect,
        measuredW.current,
        measuredH.current,
        edgeMargin,
        gapRef.current,
      );
    } else {
      pos = computePosition(rect, measuredW.current, measuredH.current, edgeMargin);
    }
    setPosition(pos);
  }, [edgeMargin]);

  const close = useCallback(() => {
    setIsOpen(false);
    setPosition(null);
    anchorRef.current = null;
    onCloseRef.current?.();
    const el = prevFocusRef.current;
    prevFocusRef.current = null;
    if (el instanceof HTMLElement) el.focus();
  }, []);

  const open = useCallback(
    (anchor: PopoverAnchor) => {
      prevFocusRef.current = document.activeElement;
      anchorRef.current = anchor;
      measuredW.current = estimatedWidth;
      measuredH.current = estimatedHeight;
      const rect = resolveAnchorRect(anchor);
      let pos: PopoverPosition;
      if (placementRef.current === 'right-end' && anchor instanceof HTMLElement) {
        pos = computePositionRightEnd(rect, measuredW.current, measuredH.current, edgeMargin, gapRef.current);
      } else {
        pos = computePosition(rect, measuredW.current, measuredH.current, edgeMargin);
      }
      setPosition(pos);
      setIsOpen(true);
    },
    [estimatedWidth, estimatedHeight, edgeMargin],
  );

  // Callback ref — consumers attach this to their popover root element
  const setPopoverElement = useCallback((el: HTMLElement | null) => {
    popoverElRef.current = el;
  }, []);

  // Re-measure and reposition when popover element renders/resizes
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverElRef.current;
    if (!el) return;
    const measureAndRepos = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        measuredW.current = rect.width;
        measuredH.current = rect.height;
        reposition();
      }
    };
    const ro = new ResizeObserver(measureAndRepos);
    ro.observe(el);
    requestAnimationFrame(measureAndRepos);
    return () => ro.disconnect();
  }, [isOpen, reposition]);

  // Focus popover on open
  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      popoverElRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  // Esc dismiss
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, close]);

  // Outside-click dismiss
  // For element-anchored popovers the trigger button is outside the popover list.
  // Clicking the trigger while open fires capture-phase mousedown → close(), then
  // the trigger's own onClick (which reads isOpen to toggle) sees it already closed
  // and reopens. Fix: when anchor is an HTMLElement, let the anchor's own onClick
  // own the toggle — don't close if the click target is inside the anchor element.
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (anchorRef.current instanceof HTMLElement && anchorRef.current.contains(e.target as Node)) {
        return; // let trigger's onClick handle toggle
      }
      if (popoverElRef.current && !popoverElRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [isOpen, close]);

  // Iframe-click dismiss via window blur.
  // Sandboxed bundle iframes swallow mousedown — the parent document never sees it,
  // so the capture-phase handler above never fires. When the user clicks into an
  // iframe the parent window loses focus (blur). Use that as the dismiss signal.
  // This does NOT fire spuriously on open: the rAF-delayed focus() call that moves
  // focus INTO the popover list is a same-document focus transfer, not a window blur.
  useEffect(() => {
    if (!isOpen) return;
    function handleWindowBlur() {
      close();
    }
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [isOpen, close]);

  // Focus-restore on unmount (for dismiss paths that bypass close(), e.g.
  // MenuHost unmounting ContextMenu on item-select via closeOpenMenu).
  // Guard: close() already nulls prevFocusRef, so this only fires when
  // close() was NOT the dismiss path.
  useEffect(() => {
    return () => {
      const el = prevFocusRef.current;
      if (el instanceof HTMLElement) {
        prevFocusRef.current = null;
        el.focus();
      }
    };
  }, []);

  return {
    isOpen,
    position,
    setPopoverElement,
    open,
    close,
    portalTarget: document.body,
  };
}
