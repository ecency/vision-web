"use client";

import { useEffect, useState } from "react";
import { ADVENT_HIDE_AT, ADVENT_SHOW_FROM, adventPhase } from "./season";

/// How long until the Advent Calendar shows or hides itself, from `now`; null
/// when neither is still to come.
export function msToNextChange(now: number): number | null {
  const next = [ADVENT_SHOW_FROM, ADVENT_HIDE_AT].find((t) => t > now);
  return next === undefined ? null : next - now;
}

/// Whether the Advent Calendar is on today (25 November to 31 December, UTC).
/// Decided in the browser after it mounts, so a page cached on another day
/// still shows the right thing, and checked again right at the moment it shows
/// or hides itself while the tab stays open.
export function useAdventVisible() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const now = Date.now();
      setOn(adventPhase(now) !== "hidden");
      const wait = msToNextChange(now);
      // a timer cannot wait longer than about 24 days; check again by then
      if (wait !== null) timer = setTimeout(check, Math.min(wait + 50, 2 ** 31 - 1));
    };
    check();
    return () => clearTimeout(timer);
  }, []);
  return on;
}
