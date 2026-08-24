import React, { useContext, useEffect, useMemo, useState } from "react";
import { UserDeckGridItem } from "../types";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { GenericDeckWithDataColumn } from "./generic-deck-with-data-column";
import { ShortListItemSkeleton } from "./deck-items";
import { DeckGridContext } from "../deck-manager";
import { DeckContentTypeColumnSettings } from "./deck-column-settings/deck-content-type-column-settings";
import { WALLET_CONTENT_TYPES } from "../consts";
import { Transaction } from "@/entities";
import { getDynamicPropsQueryOptions, getTransactionsInfiniteQueryOptions } from "@ecency/sdk";
import i18next from "i18next";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { TransactionRow } from "@/features/shared/transactions";

interface Props {
  id: string;
  settings: UserDeckGridItem["settings"];
  draggable?: DraggableProvidedDragHandleProps | null;
}

type IdentifiableTransaction = Transaction & { id: string };

export const DeckWalletColumn = ({ id, settings, draggable }: Props) => {
  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());
  const { data, isRefetching, refetch } = useInfiniteQuery(getTransactionsInfiniteQueryOptions(
    settings.username,
    20,
    settings.contentType as any
  ));

  const [isFirstLoaded, setIsFirstLoaded] = useState(false);

  const dataFlow = useMemo(
    () => data?.pages?.flatMap((page) => page.entries) ?? [],
    [data]
  ) as IdentifiableTransaction[];

  const { updateColumnIntervalMs } = useContext(DeckGridContext);

  useEffect(() => {
    if ((data?.pages.length ?? 0) > 0) {
      setIsFirstLoaded(true);
    }
  }, [data]);

  return (
    <GenericDeckWithDataColumn
      id={id}
      draggable={draggable}
      header={{
        title: "@" + settings.username.toLowerCase(),
        subtitle: i18next.t("decks.wallet"),
        icon: null,
        updateIntervalMs: settings.updateIntervalMs,
        setUpdateIntervalMs: (v) => updateColumnIntervalMs(id, v),
        additionalSettings: (
          <DeckContentTypeColumnSettings
            title={i18next.t("decks.columns.filters")}
            contentTypes={WALLET_CONTENT_TYPES}
            settings={settings}
            id={id}
          />
        )
      }}
      data={dataFlow}
      isReloading={isRefetching}
      isFirstLoaded={isFirstLoaded}
      onReload={() => refetch()}
      skeletonItem={<ShortListItemSkeleton />}
    >
      {(item: Transaction, measure: any, index: number) => (
        <TransactionRow transaction={item} onMounted={measure} />
      )}
    </GenericDeckWithDataColumn>
  );
};
