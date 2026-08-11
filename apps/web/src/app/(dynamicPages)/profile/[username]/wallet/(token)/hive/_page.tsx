"use client";

import { useInfiniteDataFlow } from "@/utils";
import {
  type HiveOperationFilterValue,
  getHiveAssetTransactionsQueryOptions,
} from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import {
  HIVE_TOKEN_OPERATION_FILTERS,
  HiveOperationFilterSelect,
  ProfileWalletTokenHistoryCard,
  AggregatedBalanceCard,
  BalanceHistoryChart,
  WalletHistoryLoadMore,
} from "../_components";
import { HiveTransactionRow } from "./_components";
import { Button } from "@/features/ui";
import { Spinner } from "@/features/ui/spinner";
import { TradingViewWidget } from "@/features/trading-view";
import i18next from "i18next";
import { UilExchange } from "@tooni/iconscout-unicons-react";

export function HivePage() {
  const params = useParams();
  const rawUsername = params.username as string;
  let username: string;
  try {
    username = decodeURIComponent(rawUsername).replace(/^@/, "");
  } catch {
    username = rawUsername.replace(/^@/, "");
  }

  const [filters, setFilters] = useState<HiveOperationFilterValue[]>(
    HIVE_TOKEN_OPERATION_FILTERS
  );

  const { data, refetch, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
    getHiveAssetTransactionsQueryOptions(username, 1000, filters)
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
      <AggregatedBalanceCard username={username} coinType="HIVE" />
      <BalanceHistoryChart username={username} coinType="HIVE" />
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
