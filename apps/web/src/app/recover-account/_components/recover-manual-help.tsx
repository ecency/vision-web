import i18next from "i18next";
import { recoveryErrorMessage } from "@/features/account-recovery/recovery-errors";
import { RecoverStartOver } from "./recover-error";

const SUPPORT_URL = "https://discord.me/ecency";

export function RecoverManualHelp({ code, onRestart }: { code: string; onRestart: () => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.manual.title")}</h2>
      {code && <p className="text-sm mb-2">{recoveryErrorMessage(code)}</p>}
      <p className="text-sm opacity-75 mb-4">{i18next.t("recover-account.manual.hint")}</p>
      <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-blue-dark-sky text-sm">
        {i18next.t("recover-account.manual.contact")}
      </a>
      <div>
        <RecoverStartOver onRestart={onRestart} />
      </div>
    </div>
  );
}
