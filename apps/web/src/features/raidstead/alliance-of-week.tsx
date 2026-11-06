"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import i18next from "i18next";
import { LEAGUES } from "@ecency/raidstead";
import { EcencyConfigManager } from "@/config";
import { ensureRaidsteadLoaded } from "@/features/i18n/raidstead";
import { useWeekWinners } from "./week";

/// On a community's page: it was a Raidstead Alliance of the Week, for the week
/// after. Nothing at all otherwise, or while the game server cannot say. Where
/// Raidstead is turned off the game server is not asked at all.
export function AllianceOfWeekBadge({ community }: { community: string }) {
  return (
    <EcencyConfigManager.Conditional condition={({ visionFeatures }) => visionFeatures.raidstead.enabled}>
      <Badge community={community} />
    </EcencyConfigManager.Conditional>
  );
}

function Badge({ community }: { community: string }) {
  const week = useWeekWinners();
  const league = week ? LEAGUES.find((l) => week.winners[l]?.community === community) : undefined;
  // the game's strings load only for a winner
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!league) return;
    let live = true;
    Promise.resolve()
      .then(() => ensureRaidsteadLoaded())
      .then(
        () => live && setReady(true),
        () => undefined
      );
    return () => {
      live = false;
    };
  }, [league]);
  if (!week || !league || !ready) return null;
  const t = (key: string, values?: Record<string, unknown>) => i18next.t(`raidstead.${key}`, values);
  return (
    <Link
      href="/raidstead"
      className="mt-3 flex flex-col gap-0.5 rounded-xl border border-[--border-color] px-3 py-2 text-sm no-underline hover:no-underline"
    >
      <b>{t("aotw.badge")}</b>
      <small className="opacity-75">
        {t("aotw.badge-desc", { week: week.week, league: t(`profile.leagues.${league}`) })}
      </small>
    </Link>
  );
}
