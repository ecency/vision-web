import i18next from "i18next";
import { recoveryErrorMessage } from "@/features/account-recovery/recovery-errors";

export function RecoverError({ code, detail }: { code?: string; detail?: string }) {
  if (!code) return null;
  return (
    <div role="alert" className="text-red text-sm my-3 px-1">
      <div>{recoveryErrorMessage(code)}</div>
      {detail && <div className="opacity-75 mt-1 break-words">{detail}</div>}
    </div>
  );
}

export function RecoverStartOver({ onRestart }: { onRestart: () => void }) {
  return (
    <button type="button" className="text-blue-dark-sky text-sm mt-2" onClick={onRestart}>
      {i18next.t("recover-account.start-over")}
    </button>
  );
}
