import { useEffect, useRef } from "react";
import i18next from "i18next";
import { Button } from "@ui/button";
import { useGlobalStore } from "@/core/global-store";
import type { ChatAccountInactiveError } from "@/features/chat/chat-session-errors";

interface Props {
  error: ChatAccountInactiveError;
  onRetry: () => void;
}

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-blue-dark-sky focus-visible:ring-offset-2";

/**
 * The chat pages' answer to a bootstrap this tab refused: another tab made
 * another account active, or logged out (#2023). Not a lost login, so not
 * the session expired screen.
 *
 * With no account active it offers the login dialog directly: this tab's
 * store still holds an account, so LoginRequired would render nothing. A
 * login ends in setActiveUser, which makes that account the browser's
 * active one again; when the dialog closes the bootstrap is asked again.
 */
export function ChatAccountInactiveNotice({ error, onRetry }: Props) {
  const noAccount = error.reason === "no-account";
  const showLogin = useGlobalStore((state) => state.login);
  const toggleUiProp = useGlobalStore((state) => state.toggleUiProp);

  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;
  const loginWasOpen = useRef(false);
  useEffect(() => {
    if (showLogin) {
      loginWasOpen.current = true;
    } else if (loginWasOpen.current) {
      loginWasOpen.current = false;
      onRetryRef.current();
    }
  }, [showLogin]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div role="status" className="text-center text-sm text-[--text-muted]">
        {i18next.t(noAccount ? "chat.no-account-active" : "chat.other-account-active")}
      </div>
      <div className="flex items-center justify-center gap-2">
        {noAccount && (
          <Button size="sm" className={FOCUS_RING} onClick={() => toggleUiProp("login", true)}>
            {i18next.t("g.login")}
          </Button>
        )}
        <Button size="sm" outline className={FOCUS_RING} onClick={onRetry}>
          {i18next.t("g.retry")}
        </Button>
      </div>
    </div>
  );
}
