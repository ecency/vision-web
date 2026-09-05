"use client";

import { useSyncExternalStore } from "react";
import { TICKER_MS } from "./consts";

/**
 * One 60 s clock shared by every window badge on the page. Badges subscribe
 * here as their own memo children, so a countdown re-renders the badge alone.
 */
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function start() {
  if (timer) return;
  // A fresh clock for the first subscriber: the module may have been imported
  // long before the page rendered its first badge.
  now = Date.now();
  timer = setInterval(() => {
    now = Date.now();
    listeners.forEach((l) => l());
  }, TICKER_MS);
}

function stop() {
  if (timer && listeners.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    stop();
  };
}

function getSnapshot() {
  return now;
}

function getServerSnapshot() {
  return now;
}

export function useCurationTicker(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test-only: force the shared clock forward and notify subscribers. */
export function advanceCurationTickerForTests(ms: number) {
  now += ms;
  listeners.forEach((l) => l());
}
