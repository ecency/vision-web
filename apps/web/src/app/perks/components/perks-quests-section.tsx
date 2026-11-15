"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { isProMember } from "@/features/pro";
import { error, success } from "@/features/shared";
import { Button, TabItem } from "@/features/ui";
import { getAccessToken, useCountdown } from "@/utils";
import {
  getGameStatusCheckQueryOptions,
  getProMembersQueryOptions,
  getQuestsQueryOptions,
  QUEST_CATALOG,
  STREAK_FREEZE_MAX_OWNED,
  STREAK_FREEZE_PRICE,
  useBuyStreakFreeze,
  type QuestTier
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import {
  UilArrowUp,
  UilCheckCircle,
  UilComment,
  UilPen,
  UilRefresh,
  UilSpin
} from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import i18next from "i18next";
import { ReactNode, useMemo, useState } from "react";
import { PerksQuestItem } from "./perks-quest-item";

// Map the SDK catalog's icon hints to confirmed-available Unicons.
const ICONS: Record<string, ReactNode> = {
  "check-circle": <UilCheckCircle className="size-6" />,
  pencil: <UilPen className="size-6" />,
  comment: <UilComment className="size-6" />,
  "chevron-up-circle": <UilArrowUp className="size-6" />,
  repeat: <UilRefresh className="size-6" />,
  gift: <UilSpin className="size-6" />
};

const TIERS: QuestTier[] = ["daily", "weekly", "monthly"];

// Seeded with the real reset time (the parent key-remounts it when the value arrives) so the
// interval ticks down correctly. Seeding useCountdown with 0 + a deferred setTime races its
// self-terminating interval on slow loads and freezes the timer.
function QuestsResetCountdown({ seconds }: { seconds: number }) {
  const [time] = useCountdown(seconds);
  const h = Math.floor(time / 3600);
  const m = Math.floor((time % 3600) / 60);
  return <>{i18next.t("perks.quests.resets-in", { time: `${h}h ${m}m` })}</>;
}

export function PerksQuestsSection() {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const code = getAccessToken(username ?? "");

  const { data: quests } = useQuery(getQuestsQueryOptions(username));
  const { data: spin } = useQuery(getGameStatusCheckQueryOptions(username, code, "spin"));
  // Pro members get streak freezes for free, so do not quote them the Points price.
  // Until the roster has loaded (or when it failed with no earlier data) nobody is quoted a
  // price and the purchase is disabled, so nobody is charged without seeing the price. A failed
  // background refetch keeps the last roster, so the label stays.
  const { data: proMembers } = useQuery(getProMembersQueryOptions());
  const rosterLoaded = proMembers !== undefined;
  const isPro = isProMember(proMembers?.members, username);

  const [tier, setTier] = useState<QuestTier>("daily");
  const [showTopup, setShowTopup] = useState(false);

  const { mutateAsync: buyFreeze, isPending: isBuyingFreeze } = useBuyStreakFreeze(
    username,
    code
  );

  const handleBuyFreeze = async () => {
    try {
      await buyFreeze();
      setShowTopup(false);
      success(i18next.t("perks.quests.freeze-bought"));
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 402) {
        setShowTopup(true);
        error(i18next.t("perks.quests.freeze-insufficient"));
      } else if (status !== 409) {
        // 409 = already at max; the button hides once the count refetches.
        error(i18next.t("perks.quests.freeze-error"));
      }
    }
  };

  // Index the backend progress arrays by quest id, per tier.
  const byTier = useMemo(
    () => ({
      daily: Object.fromEntries((quests?.daily ?? []).map((q) => [q.id, q])),
      weekly: Object.fromEntries((quests?.weekly ?? []).map((q) => [q.id, q])),
      monthly: Object.fromEntries((quests?.monthly ?? []).map((q) => [q.id, q]))
    }),
    [quests]
  );

  const entries = useMemo(() => QUEST_CATALOG.filter((q) => q.tier === tier), [tier]);

  const streak = quests?.streak;

  const scrollToSpin = () =>
    document.getElementById("perks-spin")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="reading-surface border rounded-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 pb-0">
        <div>
          <div className="text-lg font-bold">{i18next.t("perks.quests.title")}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {i18next.t("perks.quests.subtitle")}
          </div>
        </div>
        {streak && streak.current > 0 && (
          <div className="flex flex-col items-start sm:items-end gap-1.5">
            <div
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                streak.at_risk
                  ? "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300"
                  : "bg-blue-duck-egg dark:bg-gray-800 text-blue-dark-sky"
              )}
              title={streak.at_risk ? i18next.t("perks.quests.streak-at-risk") : undefined}
            >
              <span aria-hidden>🔥</span>
              {i18next.t("perks.quests.streak", { n: streak.current })}
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {(streak.freezes_owned ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400"
                  title={i18next.t("perks.quests.freeze-explain")}
                >
                  <span aria-hidden>❄️</span>
                  {i18next.t("perks.quests.freezes", { n: streak.freezes_owned })}
                </span>
              )}
              {(streak.freezes_owned ?? 0) < STREAK_FREEZE_MAX_OWNED && (
                <Button
                  size="xs"
                  outline={true}
                  onClick={handleBuyFreeze}
                  isLoading={isBuyingFreeze}
                  disabled={isBuyingFreeze || !rosterLoaded}
                >
                  {!rosterLoaded
                    ? i18next.t("perks.quests.buy-freeze-neutral")
                    : isPro
                      ? i18next.t("perks.quests.buy-freeze-free")
                      : i18next.t("perks.quests.buy-freeze", { price: STREAK_FREEZE_PRICE })}
                </Button>
              )}
              {showTopup && (
                <Button size="xs" appearance="link" href="/perks/points" target="_blank">
                  {i18next.t("perks.quests.get-points")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-b mt-2 px-2">
        <div className="flex">
          {TIERS.map((t, i) => (
            <TabItem
              key={t}
              i={i}
              name={t}
              title={i18next.t(`perks.quests.${t}`)}
              isSelected={tier === t}
              onSelect={() => setTier(t)}
            />
          ))}
        </div>
        {tier === "daily" && quests?.period?.day_resets_in_secs ? (
          <div className="text-xs text-gray-500 pr-2">
            <QuestsResetCountdown
              key={quests.period.day_resets_in_secs}
              seconds={quests.period.day_resets_in_secs}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
        {entries.map((e) => {
          if (e.id === "spin") {
            const hasData = typeof spin?.remaining === "number" || !!spin?.wait_secs;
            const available = typeof spin?.remaining === "number" && spin.remaining > 0;
            return (
              <PerksQuestItem
                key={`${tier}-spin`}
                icon={ICONS[e.icon]}
                title={i18next.t("perks.quests.spin.title")}
                progress={available || !hasData ? 0 : 1}
                goal={1}
                completed={hasData && !available}
                hint={available ? i18next.t("perks.quests.available") : undefined}
                onClick={scrollToSpin}
              />
            );
          }

          const item = (byTier[tier] as Record<string, { progress: number; cap?: number }>)[e.id];
          const progress = item?.progress ?? 0;
          return (
            <PerksQuestItem
              key={`${tier}-${e.id}`}
              icon={ICONS[e.icon]}
              title={i18next.t(`perks.quests.${e.i18nKey}.title`)}
              progress={progress}
              goal={e.goal}
              completed={progress >= e.goal}
              cap={item?.cap}
            />
          );
        })}
      </div>
    </div>
  );
}
