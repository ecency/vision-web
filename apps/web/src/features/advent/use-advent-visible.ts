"use client";

import { useEffect, useState } from "react";
import { adventPhase } from "./season";

/// Whether the Advent Calendar is on today (29 November to 31 December, UTC).
/// Decided in the browser after it mounts, so a page cached on another day
/// still shows the right thing; it checks again every hour the tab stays open.
export function useAdventVisible() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const check = () => setOn(adventPhase(Date.now()) !== "hidden");
    check();
    const id = setInterval(check, 3_600_000);
    return () => clearInterval(id);
  }, []);
  return on;
}
