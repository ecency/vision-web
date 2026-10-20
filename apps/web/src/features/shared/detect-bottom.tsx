"use client";

import { useInViewport } from "react-in-viewport";
import { useEffect, useRef } from "react";
import useLatest from "react-use/lib/useLatest";

interface Props {
  onBottom: () => any;
  /**
   * Stop loading just because the sentinel is on screen; load only when the
   * user scrolls down (wheel, finger swipe or a scroll key) at the bottom, at
   * most once per GESTURE_COOLDOWN_MS. For a list whose last pages showed
   * nothing, see useAutoPagingPaused.
   */
  paused?: boolean;
}

/**
 * A wheel fling or a finger drag fires dozens of events a second, so this is
 * what keeps a paused list at one page per deliberate scroll. Timed rather than
 * re-armed on a parent re-render, so a failed fetch is retried by the next
 * scroll instead of waiting for a re-render that never comes. Also how long a
 * gesture made just before the sentinel came into view still counts: the
 * scroll that brings it on screen is the request for more.
 */
const GESTURE_COOLDOWN_MS = 1000;
const SCROLL_KEYS = ["ArrowDown", "PageDown", "End", " "];
const NOT_THE_PAGE =
  'input, textarea, select, button, [contenteditable=""], [contenteditable="true"], [role="button"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [role="combobox"]';
const IN_A_DIALOG = '[role="dialog"], [aria-modal="true"]';

/** A gesture aimed at something other than the page: a dialog, a field, a control. */
function isElsewhere(target: EventTarget | null, isKey: boolean): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(IN_A_DIALOG)) return true;
  return isKey && !!target.closest(NOT_THE_PAGE);
}

export function DetectBottom({ onBottom, paused = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { inViewport } = useInViewport(ref, { rootMargin: "0px 0px 200px 0px" });
  // Read from the listeners, which stay put across renders so that a gesture
  // in progress (a touch drag, a cooldown) is not reset by a parent re-render.
  const onBottomRef = useLatest(onBottom);
  const inViewportRef = useLatest(inViewport);
  const lastLoadAt = useRef(0);
  const lastGestureAt = useRef(0);

  const loadForGesture = () => {
    const now = Date.now();
    if (now - lastLoadAt.current < GESTURE_COOLDOWN_MS) return;
    lastLoadAt.current = now;
    lastGestureAt.current = 0;
    onBottomRef.current();
  };
  const loadForGestureRef = useLatest(loadForGesture);

  useEffect(() => {
    if (!inViewport) return;
    if (!paused) {
      onBottom();
      return;
    }
    // The gesture that scrolled the sentinel into view.
    if (Date.now() - lastGestureAt.current < GESTURE_COOLDOWN_MS) {
      loadForGestureRef.current();
    }
  }, [inViewport, onBottom, paused, loadForGestureRef]);

  useEffect(() => {
    if (!paused) return;

    const onGesture = (target: EventTarget | null, isKey = false) => {
      if (isElsewhere(target, isKey)) return;
      if (inViewportRef.current) {
        loadForGestureRef.current();
      } else {
        lastGestureAt.current = Date.now();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) onGesture(e.target);
    };
    // A finger moving up scrolls the page down; anything else (re-reading
    // upward, a sideways swipe in a carousel) is not asking for more.
    let touchY: number | undefined;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY !== undefined && y !== undefined && touchY - y > 10) onGesture(e.target);
    };
    const onKey = (e: KeyboardEvent) => {
      // Shift+Space scrolls up; a handled key (a menu item's Space) or a
      // shortcut is not a scroll at all.
      if (e.defaultPrevented || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      if (SCROLL_KEYS.includes(e.key)) onGesture(e.target, true);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [paused, inViewportRef, loadForGestureRef]);

  // Class lets list surfaces detect "nothing here but the sentinel" via :has().
  return <div ref={ref} className="detect-bottom" />;
}
