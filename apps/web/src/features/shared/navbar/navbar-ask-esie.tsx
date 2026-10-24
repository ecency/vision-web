"use client";

import { useHydrated } from "@/api/queries";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ASK_ESIE_HREF } from "@/features/chat/official-accounts";
import { ESIE_MOODS } from "@ui/esie/esie-moods.generated";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import Link from "next/link";

/**
 * Opens the chat with Esie, the AI helper. Esie answers in chat, which needs a login,
 * so logged-out visitors do not see it.
 */
export function NavbarAskEsie() {
  const { activeUser } = useActiveAccount();
  const hydrated = useHydrated();

  if (!hydrated || !activeUser) return null;

  const label = i18next.t("navbar.ask-esie");
  return (
    <Tooltip content={label}>
      <Link
        href={ASK_ESIE_HREF}
        aria-label={label}
        data-ask-esie
        className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-1 text-sm font-semibold text-gray-600 hover:bg-gray-100 hover:text-blue-dark-sky dark:text-gray-400 dark:hover:bg-dark-default xl:pr-3"
      >
        <img
          src={ESIE_MOODS.avatar.src}
          width={28}
          height={28}
          alt=""
          aria-hidden
          draggable={false}
          className="size-7 rounded-full bg-blue-duck-egg dark:bg-dark-default"
        />
        <span className="hidden xl:inline">{label}</span>
      </Link>
    </Tooltip>
  );
}
