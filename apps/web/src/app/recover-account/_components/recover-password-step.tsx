"use client";

import { useState } from "react";
import i18next from "i18next";
import { Button } from "@ui/button";
import { useDownloadKeys } from "@/features/wallet/hooks/use-download-keys";

interface Props {
  username: string;
  masterPassword: string;
  onContinue: () => void;
}

export function RecoverPasswordStep({ username, masterPassword, onContinue }: Props) {
  const [downloaded, setDownloaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const download = useDownloadKeys(masterPassword, username);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.password.title")}</h2>
      <p className="text-sm opacity-75 mb-4">{i18next.t("recover-account.password.hint")}</p>
      <div className="font-mono text-sm break-all rounded-xl bg-gray-100 dark:bg-dark-default p-3 mb-4 select-all">
        {masterPassword}
      </div>
      <Button
        className="w-full mb-4"
        appearance="secondary"
        onClick={() => {
          download();
          setDownloaded(true);
        }}
      >
        {i18next.t("recover-account.password.download")}
      </Button>
      <label className="flex items-start gap-2 text-sm mb-4 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>{i18next.t("recover-account.password.saved-confirm")}</span>
      </label>
      <Button className="w-full" disabled={!downloaded || !confirmed} onClick={onContinue}>
        {i18next.t("recover-account.password.continue")}
      </Button>
    </div>
  );
}
