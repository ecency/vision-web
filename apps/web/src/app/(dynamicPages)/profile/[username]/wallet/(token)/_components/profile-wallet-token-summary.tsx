import i18next from "i18next";
import { type ReactNode } from "react";

import { useGlobalStore } from "@/core/global-store";
import { FormattedCurrency } from "@/features/shared";
import { Badge } from "@/features/ui";
import { useGetTokenLogoImage } from "@/features/wallet";
import { formatApr } from "@/utils";
import { formatAssetBalance } from "@/features/wallet/utils/format-asset-balance";
import { getAccountWalletAssetInfoQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { useParams, usePathname } from "next/navigation";
import { HiveEngineClaimRewardsButton } from "../[token]/_components/hive-engine-claim-rewards-button";
import {
  ProfileWalletClaimPointsButton,
  useProfileWalletPointsClaimState,
} from "./profile-wallet-claim-points-button";
import {
  ProfileWalletHpClaimRewardsButton,
  useProfileWalletHpClaimState,
} from "./profile-wallet-hp-claim-rewards-button";
import {
  ProfileWalletHbdClaimRewardsButton,
  useProfileWalletHbdClaimState,
} from "./profile-wallet-hbd-claim-rewards-button";
import {
  ProfileWalletHiveClaimRewardsButton,
  useProfileWalletHiveClaimState,
} from "./profile-wallet-hive-claim-rewards-button";
import { ProfileWalletHbdInterest } from "./profile-wallet-hbd-interest";

function format(value: number) {
  return formatAssetBalance(value);
}

export function ProfileWalletTokenSummary() {
  const { token, username } = useParams();

  const pathname = usePathname();
  const tokenWithFallback =
    (token as string)?.toUpperCase() ?? pathname.split("/")[3]?.toUpperCase();

  const cleanUsername = typeof username === "string" ? username.replace(/%40/g, "") : "";
  const currency = useGlobalStore((state) => state.currency);

  const { hasPendingPoints } =
    useProfileWalletPointsClaimState(
      cleanUsername,
      tokenWithFallback === "POINTS"
    );

  const { hasRewards: hasHpRewards } =
    useProfileWalletHpClaimState(
      cleanUsername,
      tokenWithFallback === "HP"
    );

  const { hasRewards: hasHbdRewards } =
    useProfileWalletHbdClaimState(
      cleanUsername,
      tokenWithFallback === "HBD"
    );

  const { hasRewards: hasHiveRewards } =
    useProfileWalletHiveClaimState(
      cleanUsername,
      tokenWithFallback === "HIVE"
    );

  const { data, isFetching } = useQuery(
    getAccountWalletAssetInfoQueryOptions(cleanUsername, tokenWithFallback, { refetch: false, currency: currency || "usd" })
  );

  const logo = useGetTokenLogoImage(cleanUsername, tokenWithFallback);

  const parts = data?.parts ?? [];
  const liquidBalance =
    parts.find((part) => part.name === "liquid")?.balance ??
    parts.find((part) => part.name === "current")?.balance ??
    parts.find((part) => part.name === "account")?.balance ??
    data?.accountBalance ??
    0;
  const stakedBalance = parts.find((part) => part.name === "staked")?.balance ?? 0;
  const savingsBalance = parts.find((part) => part.name === "savings")?.balance ?? 0;
  const hasStakedBalance = parts.some((part) => part.name === "staked");
  const hasSavingsBalance = parts.some((part) => part.name === "savings");

  const normalizedCurrency = currency?.toUpperCase();
  const fiatBalanceLabel = i18next.t("profile-wallet.summary-fiat-balance", {
    currency:
      normalizedCurrency === "USD" || normalizedCurrency === "HBD"
        ? "USD"
        : (normalizedCurrency ?? "USD")
  });

  const fiatBalance = liquidBalance * (data?.price ?? 0);
  const formattedApr = formatApr(data?.apr);
  const cards: { label: string; value: ReactNode }[] = [
    {
      label: hasSavingsBalance
        ? i18next.t("profile-wallet.summary-current-balance")
        : i18next.t("profile-wallet.summary-available"),
      value: format(liquidBalance),
    },
    ...(hasStakedBalance
      ? [
          {
            label: i18next.t("profile-wallet.summary-staked"),
            value: format(stakedBalance),
          },
        ]
      : []),
    ...(hasSavingsBalance
      ? [
          {
            label: i18next.t("profile-wallet.summary-savings-balance"),
            value: format(savingsBalance),
          },
        ]
      : []),
    {
      label: fiatBalanceLabel,
      value: <FormattedCurrency value={fiatBalance} />,
    },
    ...(formattedApr
      ? [
          {
            label: i18next.t("profile-wallet.summary-apr"),
            value: `${formattedApr}%`,
          },
        ]
      : []),
  ];

  const gridClassName =
    cards.length >= 4
      ? "grid-cols-2 md:grid-cols-4"
      : cards.length === 3
      ? "grid-cols-3"
      : "grid-cols-2";

  if (isFetching) {
    <div className="bg-white/80 dark:bg-dark-200/90 glass-box rounded-xl p-3 flex flex-col justify-between gap-4">
      <div className="flex justify-between">
        <div className="w-[90px] rounded-lg animate-pulse h-[44px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
        <div className="w-[56px] rounded-lg animate-pulse h-[24px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="w-[56px] rounded-lg animate-pulse h-[64px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
        <div className="w-full rounded-lg animate-pulse h-[64px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
        <div className="w-full rounded-lg animate-pulse h-[64px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
      </div>
    </div>;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="bg-white/80 dark:bg-dark-200/90 glass-box rounded-xl p-3 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
            <div className="flex items-start gap-2 md:gap-3 col-span-2 sm:col-span-1">
            <div className="mt-1">{logo}</div>
            <div>
              <div className="text-xl font-bold">{data?.title}</div>
            <div className="flex items-center gap-1">
              <div className="text-xs text-gray-500 uppercase font-semibold">{data?.name}</div>
              {data?.layer && (
                <Badge className="!rounded-lg !p-0 !px-1" appearance="secondary">
                  {data.layer}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end sm:text-right">
          <div className="text-blue-dark-sky">
            <FormattedCurrency value={data?.price ?? 0} fixAt={3} skipConversion />
          </div>
          <HiveEngineClaimRewardsButton className="w-full sm:w-auto" />
          {tokenWithFallback === "POINTS" && hasPendingPoints && (
            <ProfileWalletClaimPointsButton
              username={cleanUsername}
              className="w-full sm:w-auto"
            />
          )}
          {tokenWithFallback === "HP" && hasHpRewards && (
            <ProfileWalletHpClaimRewardsButton
              username={cleanUsername}
              className="w-full sm:w-auto"
            />
          )}
          {tokenWithFallback === "HBD" && hasHbdRewards && (
            <ProfileWalletHbdClaimRewardsButton
              username={cleanUsername}
              className="w-full sm:w-auto"
            />
          )}
          {tokenWithFallback === "HIVE" && hasHiveRewards && (
            <ProfileWalletHiveClaimRewardsButton
              username={cleanUsername}
              className="w-full sm:w-auto"
            />
          )}
        </div>
      </div>
        <div className={`grid ${gridClassName} gap-2 md:gap-4`}>
          {cards.map((card) => (
            <div key={card.label} className="bg-gray-100 dark:bg-gray-900 p-2 rounded-xl overflow-hidden">
              <div className="text-sm text-gray-600 dark:text-gray-400">{card.label}</div>
              <div className="text-xl font-bold truncate">{card.value}</div>
            </div>
          ))}
        </div>
      </div>
      {tokenWithFallback === "HBD" && (
        <ProfileWalletHbdInterest username={cleanUsername} />
      )}
    </div>
    </>
  );
}
