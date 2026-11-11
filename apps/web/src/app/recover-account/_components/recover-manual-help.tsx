import i18next from "i18next";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { recoveryErrorMessage } from "@/features/account-recovery/recovery-errors";
import { RecoverStartOver } from "./recover-error";

/** Town Square chat, where the team answers help questions. */
const SUPPORT_CHAT = "/chats/hive-125125/channel";
/** The chat needs a login, so locked-out users also get an email contact. */
const SUPPORT_EMAIL = "hello@ecency.com";

interface Props {
  code: string;
  username: string;
  onRestart: () => void;
}

export function RecoverManualHelp({ code, username, onRestart }: Props) {
  // Only the account's own recovery account can recover it, so name it.
  const otherRecovery = code === "not_ecency_recovery" && !!username;
  const { data } = useQuery({
    ...getAccountFullQueryOptions(username),
    enabled: otherRecovery,
    retry: false
  });
  const recoveryAccount = otherRecovery ? data?.recovery_account : undefined;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.manual.title")}</h2>
      {recoveryAccount ? (
        <p className="text-sm mb-4">
          {i18next.t("recover-account.manual.other-recovery", { account: recoveryAccount })}
        </p>
      ) : (
        <>
          {code && <p className="text-sm mb-2">{recoveryErrorMessage(code)}</p>}
          <p className="text-sm opacity-75 mb-4">{i18next.t("recover-account.manual.hint")}</p>
        </>
      )}
      <Link href={SUPPORT_CHAT} className="text-blue-dark-sky text-sm">
        {i18next.t("recover-account.manual.contact")}
      </Link>
      <p className="text-sm opacity-75 mt-2">
        {i18next.t("recover-account.manual.no-login")}{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(i18next.t("recover-account.manual.email-subject"))}`}
          className="text-blue-dark-sky"
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
      <div>
        <RecoverStartOver onRestart={onRestart} />
      </div>
    </div>
  );
}
