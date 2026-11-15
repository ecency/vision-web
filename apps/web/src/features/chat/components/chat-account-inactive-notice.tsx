import i18next from "i18next";
import { Button } from "@ui/button";
import { LoginRequired } from "@/features/shared";
import type { ChatAccountInactiveError } from "@/features/chat/chat-session-errors";

interface Props {
  error: ChatAccountInactiveError;
  onRetry: () => void;
}

/**
 * The chat pages' answer to a bootstrap this tab refused: another tab made
 * another account active, or logged out (#2023). Not a lost login, so not
 * the session expired screen. With no account active a Retry cannot work,
 * so it offers the login instead, as the logged out chat pages do.
 */
export function ChatAccountInactiveNotice({ error, onRetry }: Props) {
  const noAccount = error.reason === "no-account";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div role="status" className="text-center text-sm text-[--text-muted]">
        {i18next.t(noAccount ? "chat.no-account-active" : "chat.other-account-active")}
      </div>
      {noAccount ? (
        <LoginRequired />
      ) : (
        <Button
          size="sm"
          outline
          className="focus-visible:ring-2 focus-visible:ring-blue-dark-sky focus-visible:ring-offset-2"
          onClick={onRetry}
        >
          {i18next.t("g.retry")}
        </Button>
      )}
    </div>
  );
}
