"use client";

import { useInfiniteDataFlow } from "@/utils";
import {
  type HiveOperationFilterValue,
  getHivePowerAssetTransactionsQueryOptions,
} from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import {
  HP_TOKEN_OPERATION_FILTERS,
  HiveOperationFilterSelect,
  ProfileWalletTokenHistoryCard,
  AggregatedBalanceCard,
  BalanceHistoryChart,
  WalletHistoryLoadMore,
} from "../_components";
import { HiveTransactionRow, HpAboutCard, HpDelegationsCard } from "./_components";
import i18next from "i18next";
import { Button } from "@/features/ui";
import { Spinner } from "@/features/ui/spinner";
import { TradingViewWidget } from "@/features/trading-view";
import { UilExchange } from "@tooni/iconscout-unicons-react";

export function HpPage() {
  const { username } = useParams();

  const [filters, setFilters] = useState<HiveOperationFilterValue[]>(
    HP_TOKEN_OPERATION_FILTERS
  );

  let cleanUsername: string;
  try {
    cleanUsername = decodeURIComponent(username as string).replace(/^@/, "");
  } catch {
    cleanUsername = (username as string).replace(/^@/, "");
  }

  const { data, refetch, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
    getHivePowerAssetTransactionsQueryOptions(
      cleanUsername,
      1000,
      filters
    )
  );
  const dataFlow = useInfiniteDataFlow(data);

  const uniqueTransactionsList = useMemo(
    () => Array.from(new Map(dataFlow.map((item) => [item["num"], item])).values()),
    [dataFlow]
  );

  const sortedTransactions = useMemo(
    () =>
      [...uniqueTransactionsList].sort(
        (a, b) => Number(b.num) - Number(a.num)
      ),
    [uniqueTransactionsList]
  );

  const showSpinner = isFetching && sortedTransactions.length === 0;

  useMount(() => refetch());

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <HpAboutCard username={cleanUsername} />
        <HpDelegationsCard username={cleanUsername} />
      </div>

      <div className="bg-white rounded-xl mb-4">
        <div className="p-4 flex justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {i18next.t("profile-wallet.market")}
          </div>
          <Button
            href="/market/advanced"
            target="_blank"
            appearance="gray"
            size="sm"
            icon={<UilExchange />}
          >
            {i18next.t("market-data.trade")}
          </Button>
        </div>
        <div className="px-4 pb-4 h-[300px]">
          <TradingViewWidget symbol="HIVE" />
        </div>
      </div>
      <AggregatedBalanceCard username={cleanUsername} coinType="VESTS" />
      <BalanceHistoryChart username={cleanUsername} coinType="VESTS" />
      <ProfileWalletTokenHistoryCard
        action={
          <HiveOperationFilterSelect
            selected={filters}
            onChange={setFilters}
          />
        }
      >
        {showSpinner ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-6" />
          </div>
        ) : (
          sortedTransactions.map((item, i) => (
            <HiveTransactionRow transaction={item} key={i} />
          ))
        )}
        {!showSpinner && (
          <WalletHistoryLoadMore
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={fetchNextPage}
          />
        )}
      </ProfileWalletTokenHistoryCard>
    </>
  );
}
