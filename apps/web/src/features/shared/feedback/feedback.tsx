"use client";

import { FeedbackMessage } from "./feedback-message";
import { FeedbackObject } from "./feedback-events";
import { useMountTransition } from "@/core/hooks";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMount, useSet, useUnmount } from "react-use";
interface FeedbackItemProps {
  feedback: FeedbackObject;
  live: boolean;
  onClose: () => void;
  onExited: () => void;
}

// Each toast owns its exit transition: `live` turns false when the toast is
// dismissed (close button or auto-expiry), the exit classes play for 150ms,
// then `mounted` flips false and the parent drops the item from the store.
function FeedbackItem({ feedback, live, onClose, onExited }: FeedbackItemProps) {
  const { mounted, open } = useMountTransition(live, 150);

  // Read onExited through a ref so the effect fires exactly once per
  // mounted→false transition — the parent recreates the lambda every render,
  // and a toast arriving during another's exit window would otherwise re-run
  // the effect and double-remove from the store.
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (!mounted) {
      onExitedRef.current();
    }
  }, [mounted]);

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={clsx(
        // Entrance stays the pure CSS keyframe; the transition below only
        // becomes visible on exit (the keyframe overrides it while running).
        "feedback-item-enter transition-[opacity,transform] duration-150 motion-reduce:transition-none",
        open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      )}
    >
      <FeedbackMessage feedback={feedback} onClose={onClose} />
    </div>
  );
}

// Feedback is mounted on every route, so its toast entrance must stay a pure
// CSS keyframe (see _index.scss) with zero JS on the global critical path.
// Exit is a 150ms fade + slide-down driven per-item by useMountTransition.
export function Feedback() {
  const [set, { add, remove }] = useSet(new Set<FeedbackObject>());
  const [closing, { add: markClosing, remove: unmarkClosing }] = useSet(new Set<string>());
  const queue = useMemo(() => Array.from(set), [set]);

  const onFeedback = useCallback(
    (e: Event) => add((e as CustomEvent).detail as FeedbackObject),
    [add]
  );

  useMount(() => window.addEventListener("ecency-feedback", onFeedback));
  useUnmount(() => window.removeEventListener("ecency-feedback", onFeedback));
  return (
    <div className="feedback-container">
      {queue.map((item) => (
        <FeedbackItem
          key={item.id}
          feedback={item}
          live={!closing.has(item.id)}
          onClose={() => markClosing(item.id)}
          onExited={() => {
            remove(item);
            unmarkClosing(item.id);
          }}
        />
      ))}
    </div>
  );
}
