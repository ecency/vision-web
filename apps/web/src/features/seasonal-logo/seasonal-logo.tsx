"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";
import defaults from "@/defaults";
import { readLocale } from "./locale";
import { pickIcon, ymd } from "./seasonal";

/// The logo for today in this browser: chosen after load, by the reader's own
/// date and language settings, so the server's HTML (which a cache may keep for
/// days) always has the everyday logo. It changes again at the reader's midnight.
export function useSeasonalLogo(): string {
  const [src, setSrc] = useState(defaults.logo);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const now = new Date();
      const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
      const { region, language } = readLocale(languages);
      const icon = pickIcon(ymd(now.getFullYear(), now.getMonth() + 1, now.getDate()), region, language);
      setSrc(icon === "Default" ? defaults.logo : `/assets/seasonal-logo/${icon}.svg`);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, midnight.getTime() - now.getTime() + 1000);
    };
    update();
    return () => clearTimeout(timer);
  }, []);
  return src;
}

/// The navbar's Ecency logo, in the day's celebration skin when there is one.
export function SeasonalLogo(props: Omit<ImageProps, "src">) {
  return <Image {...props} src={useSeasonalLogo()} />;
}
