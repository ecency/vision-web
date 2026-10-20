"use client";

import { useInViewport } from "react-in-viewport";
import { useEffect, useRef } from "react";

interface Props {
  onBottom: () => any;
  /**
   * Stop loading just because the sentinel is on screen; load only when the
   * user scrolls down (wheel, touch or a scroll key), at most once per
   * GESTURE_COOLDOWN_MS. For a list whose last pages showed nothing, see
   * useAutoPagingPaused.
   */
  paused?: boolean;
}

/**
 * A wheel fling or a finger drag fires dozens of events a second, so this is
 * what keeps a paused list at one page per deliberate scroll. Timed rather than
 * re-armed on a parent re-render, so a failed fetch is retried by the next
 * scroll instead of waiting for a re-render that never comes.
 */
const GESTURE_COOLDOWN_MS = 1000;
const SCROLL_KEYS = ["ArrowDown", "PageDown", "End", " "];

/** A gesture aimed at something other than the page: a dialog, a field, a button. */
function isElsewhere(target: EventTarget | null, isKey: boolean) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[role="dialog"], [aria-modal="true"]')) return true;
  if (!isKey) return false;
  return (
    (target as HTMLElement).isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
  );
}

export function DetectBottom({ onBottom, paused = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastGestureAt = useRef(0);
  const { inViewport } = useInViewport(ref, { rootMargin: "0px 0px 200px 0px" });

  useEffect(() => {
    if (!inViewport) return;
    if (!paused) {
      onBottom();
      return;
    }

    const onGesture = (target: EventTarget | null, isKey = false) => {
      if (isElsewhere(target, isKey)) return;
      const now = Date.now();
      if (now - lastGestureAt.current < GESTURE_COOLDOWN_MS) return;
      lastGestureAt.current = now;
      onBottom();
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
    const onTouch = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY !== undefined && y !== undefined && touchY - y > 10) onGesture(e.target);
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.includes(e.key)) onGesture(e.target, true);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("keydown", onKey);
    };
  }, [inViewport, onBottom, paused]);

  // Class lets list surfaces detect "nothing here but the sentinel" via :has().
  return <div ref={ref} className="detect-bottom" />;
}
