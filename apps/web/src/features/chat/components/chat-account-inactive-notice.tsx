import i18next from "i18next";
import type { ChatAccountInactiveError } from "@/features/chat/chat-session-errors";

interface Props {
  error: ChatAccountInactiveError;
  onRetry: () => void;
}

/**
 * The chat pages' answer to a bootstrap this tab refused: another tab made
 * another account active, or logged out (#2023). Not a lost login, so not
 * the session expired screen.
 */
export function ChatAccountInactiveNotice({ error, onRetry }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div className="text-center text-sm text-[--text-muted]">
        {i18next.t(
          error.reason === "no-account" ? "chat.no-account-active" : "chat.other-account-active"
        )}
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-[--border-color] bg-[--surface-color] px-4 py-2 text-sm hover:bg-[--hover-color]"
      >
        {i18next.t("g.retry")}
      </button>
    </div>
  );
}
