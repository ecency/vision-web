"use client";

import { useGlobalStore } from "@/core/global-store";
import { FormattedCurrency } from "@/features/shared";
import { type GeneralAssetInfo, getAccountWalletAssetInfoQueryOptions } from "@ecency/sdk";
import {
  getAccountWalletListQueryOptions
} from "@ecency/sdk/wallets";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import i18next from "i18next";
import useLocalStorage from "react-use/lib/useLocalStorage";

import clsx from "clsx";
import { TOKEN_COLORS_MAP } from "@/features/wallet";
import { StyledTooltip } from "@/features/ui";
import { ProfileWalletPendingEarnings } from "./profile-wallet-pending-earnings";
import { ProfileWalletTokensList } from "./profile-wallet-tokens-list";
import { PREFIX } from "@/utils/local-storage";

export function ProfileWalletSummary() {
  const { username } = useParams();
  const currency = useGlobalStore((state) => state.currency);
  const [showDetails, setShowDetails] = useLocalStorage(PREFIX + "_wallet_details", true);
  // Avoid hydration mismatch: SSR has no localStorage so the hook returns the
  // default (true), but a returning user may have toggled details off — that
  // would render a different DOM client-side and trigger React error #418.
  // Use the SSR default during the first render, switch to the stored value
  // after mount.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const detailsVisible = hydrated ? !!showDetails : true;
  const { data } = useQuery(
    getAccountWalletListQueryOptions((username as string).replace(/%40/g, ""), currency || "usd")
  );
  const queriesResult = useQueries({
    queries: (data ?? []).map((item: string) =>
      getAccountWalletAssetInfoQueryOptions((username as string).replace(/%40/g, ""), item, { refetch: false, currency: currency || "usd" })
    )
  });
  const totalBalance = useMemo(
    () =>
      queriesResult
        .map((query) => query.data as GeneralAssetInfo | undefined)
        .reduce(
          (acc, data) =>
            acc +
            (data
              ? (isNaN(data.accountBalance) ? 0 : data.accountBalance) *
                (data && isNaN(data.price) ? 0 : data.price)
              : 0),
          0
        ),
    [queriesResult]
  );
  const assetsParts = useMemo(
    () =>
      queriesResult
        .map((query) => query.data as GeneralAssetInfo | undefined)
        .filter((data) => data)
        .map((data) => {
          const usdValue =
            (isNaN(data!.accountBalance) ? 0 : data!.accountBalance) *
            (data && isNaN(data.price) ? 0 : data!.price);

          return {
            asset: data!.name,
            percent:
              totalBalance > 0
                ? Math.round((usdValue * 100) / totalBalance)
                : 0,
            usdValue
          };
        })
        .reduce(
          (acc, item) => {
            const otherSection =
              acc.find(({ asset }) => asset === "Other") ?? {
                asset: "Other",
                percent: 0,
                usdValue: 0
              };

            const shouldAggregateToOther =
              item.asset !== "POINTS" && (item.usdValue ?? 0) < 75;

            if (shouldAggregateToOther) {
              otherSection.percent += item.percent;
              otherSection.usdValue! += item.usdValue ?? 0;

              return [
                ...acc.filter(({ asset }) => asset !== "Other"),
                otherSection
              ];
            }

            return [
              ...acc.filter(({ asset }) => asset !== "Other"),
              item,
              otherSection
            ];
          },
          [] as { asset: string; percent: number; usdValue: number | undefined }[]
        )
        .filter((item) => item.asset !== "Other" || item.percent > 0),
    [totalBalance, queriesResult]
  );

  return (
    <div className="bg-white dark:bg-dark-200 rounded-xl p-3 mb-4 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="text-gray-600 dark:text-gray-400 text-sm">Balance</div>
        <div className="text-xl font-bold text-blue-dark-sky">
          {queriesResult.some((q) => q.isPending) ? (
            <div className="w-[80px] rounded-lg animate-pulse h-[28px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
          ) : (
            <FormattedCurrency value={totalBalance} skipConversion />
          )}
        </div>
      </div>
      <ProfileWalletPendingEarnings />
      <button
        onClick={() => setShowDetails(!detailsVisible)}
        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer self-start"
        aria-expanded={detailsVisible}
        aria-controls="wallet-details"
      >
        {detailsVisible
          ? i18next.t("wallet.hide-details", { defaultValue: "Hide details" })
          : i18next.t("wallet.show-details", { defaultValue: "Show details" })
        }
      </button>
      {detailsVisible && (
        <div id="wallet-details">
          <div className="flex w-full text-sm text-gray-400 dark:text-white rounded-lg overflow-hidden gap-0.5">
            {assetsParts.length === 0 && (
              <>
                <div className="w-[40%] rounded-lg animate-pulse h-[36px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
                <div className="w-[30%] rounded-lg animate-pulse h-[36px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
                <div className="w-[30%] rounded-lg animate-pulse h-[36px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey" />
              </>
            )}
            {assetsParts.length > 1 &&
              assetsParts.map(({ asset, percent, usdValue }) => (
                <StyledTooltip
                  style={{ width: `${percent}%` }}
                  key={asset}
                  content={
                    <div className="flex items-center gap-1">
                      {usdValue && usdValue > 0 && (
                        <>
                          <FormattedCurrency value={usdValue} />
                          <span>-</span>
                        </>
                      )}
                      <span>{asset}</span>
                    </div>
                  }
                >
                  <div
                    className={clsx(
                      "p-2",
                      TOKEN_COLORS_MAP[asset] ?? "bg-gradient-to-r from-[#fcc920] to-[#fcc920]/60"
                    )}
                  />
                </StyledTooltip>
              ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {assetsParts.length > 1 &&
              assetsParts.map(({ asset, usdValue }) => (
                <div className="flex items-center gap-1 text-xs" key={asset}>
                  <div
                    className={clsx(
                      "w-3 h-3 rounded-full",
                      TOKEN_COLORS_MAP[asset] ?? "bg-gradient-to-r from-[#fcc920] to-[#fcc920]/60"
                    )}
                  />
                  {usdValue && usdValue > 0 && (
                    <>
                      <FormattedCurrency value={usdValue} />
                      <span>-</span>
                    </>
                  )}
                  <span>{asset}</span>
                </div>
              ))}
          </div>
          <ProfileWalletTokensList />
        </div>
      )}
    </div>
  );
}
