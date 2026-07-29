"use client";

import { useEffect } from "react";
import { useGlobalStore } from "@/core/global-store";
import { applyThemeClass } from "@/utils/apply-theme-class";

export function Theme() {
  const theme = useGlobalStore((state) => state.theme);

  useEffect(() => {
    if (["day", "night"].includes(theme)) {
      applyThemeClass(theme);
    }
  }, [theme]);

  return <></>;
}
