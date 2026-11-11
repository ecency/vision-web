"use client";

import i18next from "i18next";
import { Button } from "@ui/button";
import { checkSvg } from "@ui/svg";
import { useGlobalStore } from "@/core/global-store";

export function RecoverSuccessStep() {
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);
  return (
    <div className="text-center bg-blue-dark-sky-040 dark:bg-dark-default rounded-2xl p-6">
      <div className="size-10 mx-auto mb-4 bg-blue-dark-sky rounded-full text-white flex items-center justify-center">
        {checkSvg}
      </div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.success.title")}</h2>
      <p className="text-sm mb-4">{i18next.t("recover-account.success.verified")}</p>
      <Button onClick={() => toggleUIProp("login")}>{i18next.t("recover-account.success.login")}</Button>
    </div>
  );
}
