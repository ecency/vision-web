"use client";

import { FormattedCurrency } from "@/features/shared";
import {
  getAccountFullQueryOptions,
  getDynamicPropsQueryOptions,
  getPointsQueryOptions
} from "@ecency/sdk";
import { pendingPayoutsQueryOptions } from "./pending-payouts-query";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { parseAsset, vestsToHp, formatNumber } from "@/utils";
import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import i18next from "i18next";
import { ProfileWalletCollectAllButton } from "./profile-wallet-collect-all-button";

export function ProfileWalletPendingEarnings() {
  const { username: rawUsername } = useParams();
  const username = (rawUsername as string).replace(/%40/g, "");

  const { data: accountData } = useQuery({
    ...getAccountFullQueryOptions(username),
    enabled: Boolean(username),
  });
  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());
  const { data: pointsData } = useQuery({
    ...getPointsQueryOptions(username),
    enabled: Boolean(username),
  });

  // Recent posts and comments, for the earnings still inside their payout
  // window. Only the payout fields are kept: see pendingPayoutsQueryOptions for
  // what the whole entries were costing to produce one number.
  const { data: recentPosts } = useQuery({
    ...pendingPayoutsQueryOptions(username, "posts"),
    enabled: Boolean(username),
  });
  const { data: recentComments } = useQuery({
    ...pendingPayoutsQueryOptions(username, "comments"),
    enabled: Boolean(username),
  });

  const rewards = useMemo(() => {
    if (!accountData) return null;

    const props = dynamicProps ?? DEFAULT_DYNAMIC_PROPS;
    const hiveAmount = parseAsset(accountData.reward_hive_balance ?? "0.000 HIVE").amount;
    const hbdAmount = parseAsset(accountData.reward_hbd_balance ?? "0.000 HBD").amount;
    const vestsAmount = parseAsset(accountData.reward_vesting_balance ?? "0.000000 VESTS").amount;
    const hpAmount = vestsToHp(vestsAmount, props.hivePerMVests);

    const pricePerHive = props.base / props.quote;
    const hiveFiat = hiveAmount * pricePerHive;
    const hbdFiat = hbdAmount;
    const hpFiat = hpAmount * pricePerHive;
    const totalFiat = hiveFiat + hbdFiat + hpFiat;

    const pendingPoints = pointsData?.uPoints
      ? Number.parseFloat(pointsData.uPoints)
      : 0;

    return {
      hiveAmount,
      hbdAmount,
      hpAmount,
      totalFiat,
      pendingPoints: Number.isFinite(pendingPoints) ? pendingPoints : 0,
      hasRewards: totalFiat > 0,
      hasPoints: pendingPoints > 0,
    };
  }, [accountData, dynamicProps, pointsData]);

  // Calculate potential earnings from active posts and comments (within 7-day payout window)
  const potentialEarnings = useMemo(() => {
    const allContent = [...(recentPosts ?? []), ...(recentComments ?? [])];
    if (allContent.length === 0) return 0;

    const now = new Date();
    return allContent.reduce((sum, entry) => {
      const payoutAt = new Date(entry.payout_at);
      if (payoutAt > now) {
        const pending = parseAsset(entry.pending_payout_value).amount;
        return sum + pending;
      }
      return sum;
    }, 0);
  }, [recentPosts, recentComments]);

  const hasAnything = rewards?.hasRewards || rewards?.hasPoints || potentialEarnings > 0;

  if (!hasAnything) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      {rewards && (rewards.hasRewards || rewards.hasPoints) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {i18next.t("wallet.claimable-label", { defaultValue: "Ready to collect:" })}
          </span>
          {rewards.hasRewards && (
            <span>
              <FormattedCurrency value={rewards.totalFiat} fixAt={2} />
              <span className="ml-1 opacity-60">
                ({formatNumber(rewards.hpAmount, 1)} HP
                {rewards.hbdAmount > 0 ? ` + ${formatNumber(rewards.hbdAmount, 2)} HBD` : ""}
                {rewards.hiveAmount > 0 ? ` + ${formatNumber(rewards.hiveAmount, 2)} HIVE` : ""})
              </span>
            </span>
          )}
          {rewards.hasPoints && (
            <span>{formatNumber(rewards.pendingPoints, 1)} Points</span>
          )}
          <ProfileWalletCollectAllButton />
        </div>
      )}
      {potentialEarnings > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {i18next.t("wallet.potential-label", { defaultValue: "Pending earnings:" })}
          </span>
          <span>
            <FormattedCurrency value={potentialEarnings} fixAt={2} />
            <span className="ml-1 opacity-60">
              {i18next.t("wallet.potential-hint", { defaultValue: "from active posts and comments" })}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
