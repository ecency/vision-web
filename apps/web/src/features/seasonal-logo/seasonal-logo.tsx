"use client";

import Image, { type ImageProps } from "next/image";
import { useSyncExternalStore } from "react";
import defaults from "@/defaults";
import { readLocale } from "./locale";
import { pickIcon, ymd } from "./seasonal";

// Today's logo, shared by every logo on the page: one timer, and a logo that
// mounts later (the sidebar opening) paints the day's skin from its first frame.
// The server's HTML (which a cache may keep for days) always has the everyday
// logo; the browser picks the skin after load, by the reader's own date and
// language settings, again at the reader's midnight and whenever the tab comes
// back (a sleeping computer holds timers back).

let current = defaults.logo;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function today(): string {
  // a deployment with its own logo keeps it every day
  if (process.env.NEXT_PUBLIC_APP_LOGO) return defaults.logo;
  const now = new Date();
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const { region, language } = readLocale(languages);
  const icon = pickIcon(ymd(now.getFullYear(), now.getMonth() + 1, now.getDate()), region, language);
  return icon === "Default" ? defaults.logo : `/assets/seasonal-logo/${icon}.svg`;
}

function refresh() {
  const next = today();
  if (next !== current) {
    current = next;
    listeners.forEach((l) => l());
  }
  clearTimeout(timer);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 1000);
}

const onVisible = () => {
  if (document.visibilityState === "visible") refresh();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisible);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/// The logo for today in this browser (see above).
export function useSeasonalLogo(): string {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => defaults.logo
  );
}

/// The navbar's Ecency logo, in the day's celebration skin when there is one.
export function SeasonalLogo(props: Omit<ImageProps, "src">) {
  return <Image {...props} src={useSeasonalLogo()} />;
}
