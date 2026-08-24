"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  dateToFormatted,
  dateToFormattedUtc,
  dateToFullRelative,
  dateToRelative,
} from "@/utils";

// ONE shared, ref-counted ticker for all relative TimeLabels. Previously the
// feed threaded a `now` prop down and bumped it every 30s, which busted
// React.memo on every card (a recurring long task). Here each relative TimeLabel
// subscribes to a single module-level 60s interval via useSyncExternalStore, so
// only the small <span>s re-render on a tick — not the cards — and there is
// exactly one interval (started on first subscriber, cleared on last) with no
// per-component interval leak across client navigations.
const tickListeners = new Set<() => void>();
let tickInterval: ReturnType<typeof setInterval> | null = null;
let tickVersion = 0;

function subscribeTick(cb: () => void) {
  tickListeners.add(cb);
  if (!tickInterval) {
    tickInterval = setInterval(() => {
      tickVersion += 1;
      tickListeners.forEach((l) => l());
    }, 60000);
  }
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0 && tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  };
}
const getTickSnapshot = () => tickVersion;
const noopSubscribe = () => () => {};
const getZero = () => 0;

// Subscribe to the shared ticker only when the label is time-relative (absolute
// dates never change, so they never tick / re-render).
function useTick(active: boolean): number {
  return useSyncExternalStore(
    active ? subscribeTick : noopSubscribe,
    active ? getTickSnapshot : getZero,
    getZero
  );
}

type Mode = "relative" | "fullRelative" | "absolute";

interface Props {
  created: string | undefined;
  refresh?: number;
  /**
   * Display mode after client mount:
   * - "relative" (default): short form, e.g. "5h"
   * - "fullRelative": long form, e.g. "5 hours ago"
   * - "absolute": formatted date using `format`
   *
   * Relative modes render their value from the first SSR paint: a relative
   * form is the difference of two instants, so it is timezone-independent
   * and safe to compute server-side (#1662). The mount effect re-computes it
   * so an edge-cached page self-corrects; `suppressHydrationWarning` on the
   * span absorbs the boundary case where the two sides disagree by one unit.
   *
   * For "absolute" the first paint stays a UTC numeric string (a local
   * format depends on the viewer's timezone and locale, which the server
   * cannot know) and swaps after mount.
   */
  mode?: Mode;
  /** dayjs format token used when `mode` is "absolute". Defaults to "LLLL". */
  format?: string;
  className?: string;
}

export function TimeLabel({
  created,
  refresh,
  mode = "relative",
  format = "LLLL",
  className = "date",
}: Props) {
  const [display, setDisplay] = useState<string | null>(() => {
    // SERVER-ONLY initializer, deliberately. The client must start at null:
    // with suppressHydrationWarning React keeps the server text in the DOM on
    // a mismatch while its vdom holds the client-rendered value, so if the
    // client initializer computed its own (possibly newer) relative value,
    // the mount effect's setDisplay() would bail out on state equality and
    // the stale server text would stay visible until the NEXT unit change
    // (a day, even a month). Starting at null makes the mount effect a real
    // state transition whose vdom diff (UTC fallback -> relative) always
    // writes the text node.
    if (typeof window !== "undefined") return null;
    if (mode === "fullRelative") return dateToFullRelative(created);
    if (mode === "relative") return dateToRelative(created);
    return null;
  });
  const [localFormatted, setLocalFormatted] = useState<string | null>(null);

  // Self-tick: re-runs the formatting effect ~once a minute for relative modes,
  // so timestamps stay fresh without the parent re-rendering the whole card.
  const tick = useTick(mode === "relative" || mode === "fullRelative");

  // Numeric UTC fallback; memoized so feeds full of labels parse each date
  // once per value instead of on every render.
  const ssrSafe = useMemo(() => dateToFormattedUtc(created), [created]);

  useEffect(() => {
    setLocalFormatted(dateToFormatted(created));
    if (mode === "absolute") setDisplay(dateToFormatted(created, format));
    else if (mode === "fullRelative") setDisplay(dateToFullRelative(created));
    else setDisplay(dateToRelative(created));
    // `refresh` is still honored (waves drives its own ticker); `tick` is the
    // shared self-ticker.
  }, [created, refresh, mode, format, tick]);

  return (
    <span className={className} title={localFormatted ?? ssrSafe} suppressHydrationWarning>
      {display ?? ssrSafe}
    </span>
  );
}

/**
 * String form of {@link TimeLabel} for cases where a React node won't fit —
 * attribute values, i18next interpolation. Returns "" before mount and the
 * formatted value after, so SSR HTML has an empty slot that fills in on the
 * client. Use this when SSR/client text divergence would cause a hydration
 * mismatch (timezone-dependent dates, locale-dependent formats).
 */
export function useFormattedDate(
  value: string | undefined,
  mode: Mode = "relative",
  format: string = "LLLL",
  refresh?: number
): string {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!value) {
      setText("");
      return;
    }
    if (mode === "absolute") setText(dateToFormatted(value, format));
    else if (mode === "fullRelative") setText(dateToFullRelative(value));
    else setText(dateToRelative(value));
  }, [value, mode, format, refresh]);

  return text;
}
