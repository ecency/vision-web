"use client";

import i18next from "i18next";
import { useGlobalStore } from "@/core/global-store";

export function LandingSignInLink() {
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);

  return (
    <button
      type="button"
      className="cursor-pointer text-gray-700 dark:text-gray-light hover:underline"
      onClick={() => toggleUIProp("login")}
    >
      {i18next.t("landing-page.sign-in")}
    </button>
  );
}
