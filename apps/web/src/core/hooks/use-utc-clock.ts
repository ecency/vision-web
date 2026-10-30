"use client";

import { useEffect, useRef, useState } from "react";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * The time, updated on every UTC minute boundary, for anything tied to the 00:00 UTC
 * reset (day leaderboard, daily quests, free spin). `onDayChange` runs once when the UTC day
 * changes while the component is mounted, so it can reload what reset.
 *
 * Null until mounted: server HTML can be served later from a cache, so whatever
 * renders a time from this renders it from the browser's clock only.
 */
export function useUtcClock(onDayChange?: () => void): number | null {
  const [now, setNow] = useState<number | null>(null);
  const onDayChangeRef = useRef(onDayChange);

  useEffect(() => {
    onDayChangeRef.current = onDayChange;
  }, [onDayChange]);

  useEffect(() => {
    let day: number | null = null;
    const tick = () => {
      const t = Date.now();
      const today = Math.floor(t / DAY_MS);
      if (day !== null && today !== day) {
        onDayChangeRef.current?.();
      }
      day = today;
      setNow(t);
    };
    // Each tick lands on the next minute boundary, not 60 s after mount, so the
    // reset is seen at 00:00:00 UTC however far into a minute the page opened.
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      id = setTimeout(() => {
        tick();
        schedule();
      }, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    tick();
    schedule();
    return () => clearTimeout(id);
  }, []);

  return now;
}
