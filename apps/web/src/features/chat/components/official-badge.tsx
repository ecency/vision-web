import clsx from "clsx";
import i18next from "i18next";
import { isOfficialChatAccount } from "../official-accounts";

interface Props {
  username?: string | null;
  className?: string;
}

/**
 * Marks an account Ecency runs (Esie, @ecency), so people can tell it apart from lookalikes.
 * A text label, not a seal, so it never reads as the Pro badge.
 */
export function OfficialBadge({ username, className }: Props) {
  if (!isOfficialChatAccount(username)) return null;

  const label = i18next.t("chat.official-badge");
  return (
    <span
      title={i18next.t("chat.official-badge-title")}
      data-official-badge
      className={clsx(
        "inline-flex shrink-0 items-center rounded bg-blue-dark-sky px-1 py-px text-[10px] font-semibold leading-tight text-white",
        className
      )}
    >
      {label}
    </span>
  );
}
