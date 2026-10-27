"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@ui/button";
import { UilFire } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { getQuestsQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import * as ls from "@/utils/local-storage";

/** Set once the user opens /perks — clears the one-time discovery dot. */
export const PERKS_SEEN_KEY = "perks_seen";

export function NavbarPerksButton({ subdued = false }: { subdued?: boolean }) {
  const label = i18next.t("user-nav.perks");
  const { activeUser } = useActiveAccount();

  // Ambient streak indicator — the only place in the app that subscribes to the
  // quests query outside the /perks page. `getQuestsQueryOptions` is disabled
  // when there's no username, so logged-out users just get the plain button.
  const { data: quests } = useQuery(getQuestsQueryOptions(activeUser?.username));
  const streak = quests?.streak;

  // One-time discovery dot: shown until the user opens /perks for the first
  // time. Defaults to "seen" so SSR / the first client render show no dot
  // (avoids a hydration mismatch); the real value is read after mount.
  const [everSeenPerks, setEverSeenPerks] = useState(true);
  useEffect(() => {
    setEverSeenPerks(ls.get(PERKS_SEEN_KEY, false) === true);
  }, []);

  // Reward / at-risk only: a real, self-clearing reason to look — an active
  // streak about to break, or a never-opened perks hub. No "new day" nag.
  const showDot = !!activeUser && ((streak?.at_risk ?? false) || !everSeenPerks);

  const streakLabel =
    streak && streak.current > 0
      ? i18next.t("perks.quests.streak", { n: streak.current })
      : undefined;

  const button =
    streak && streak.current > 0 ? (
      <Button
        href="/perks"
        appearance={subdued ? "gray-link" : "primary"}
        aria-label={
          subdued ? i18next.t("navbar.perks-streak", { label, streak: streakLabel }) : streakLabel
        }
        title={streak.at_risk ? i18next.t("perks.quests.streak-at-risk") : streakLabel}
        className={clsx(
          "font-semibold flex items-center gap-1 whitespace-nowrap text-sm",
          streak.at_risk && "text-orange-500"
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          {subdued ? (
            <UilFire className="size-4" aria-hidden="true" />
          ) : (
            <span aria-hidden>🔥</span>
          )}
          {/* A streak is earned, so show the full count; cap only past 3 digits. */}
          <span>{streak.current > 999 ? "999+" : streak.current}</span>
        </span>
      </Button>
    ) : (
      <Button
        href="/perks"
        appearance={subdued ? "gray-link" : "primary"}
        icon={<UilFire />}
        aria-label={label}
        title={label}
        className="font-semibold flex whitespace-nowrap text-sm"
      />
    );

  if (!showDot) {
    return button;
  }

  return (
    <span className="relative inline-flex">
      {button}
      <span
        aria-hidden
        className="perks-badge-dot pointer-events-none absolute top-0.5 right-0.5 size-1.5 rounded-full bg-red-500"
      />
    </span>
  );
}
