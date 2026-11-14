import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ListItemSkeleton, SearchListItem } from "./deck-items";
import { GenericDeckWithDataColumn } from "./generic-deck-with-data-column";
import { ReloadableDeckGridItem } from "../types";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { DeckGridContext } from "../deck-manager";
import { DeckPostViewer } from "./content-viewer";
import { Entry } from "@/entities";
import { entryKey, getPostsRankedQueryOptions } from "@ecency/sdk";
import { useDataLimit } from "@/utils/data-limit";
import i18next from "i18next";
import useMount from "react-use/lib/useMount";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  id: string;
  settings: ReloadableDeckGridItem["settings"];
  draggable?: DraggableProvidedDragHandleProps | null;
}

type IdentifiableEntry = Entry & Required<Pick<Entry, "id">>;

export const DeckTrendingColumn = ({ id, settings, draggable }: Props) => {
  const queryClient = useQueryClient();
  const dataLimit = useDataLimit();
  const [data, setData] = useState<IdentifiableEntry[]>([]);
  const dataRef = useRef<IdentifiableEntry[]>([]);
  const [isReloading, setIsReloading] = useState(false);
  const [currentViewingEntry, setCurrentViewingEntry] = useState<Entry | null>(null);
  const [isFirstLoaded, setIsFirstLoaded] = useState(false);

  const { updateColumnIntervalMs } = useContext(DeckGridContext);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useMount(() => {
    fetchData();
  });

  const fetchData = useCallback(async () => {
    if (dataRef.current.length) {
      setIsReloading(true);
    }

    try {
      const response = await queryClient.fetchQuery(
        getPostsRankedQueryOptions("trending", "", "", dataLimit)
      );
      setData((response ?? []).map((e) => ({ ...e, id: entryKey(e) })));
    } catch (e) {
    } finally {
      setIsReloading(false);
      setIsFirstLoaded(true);
    }
  }, [dataLimit, queryClient]);

  useEffect(() => {
    fetchData();
  }, [dataLimit]);

  return (
    <GenericDeckWithDataColumn
      id={id}
      draggable={draggable}
      header={{
        title: i18next.t("decks.trending"),
        subtitle: i18next.t("decks.posts"),
        icon: null,
        updateIntervalMs: settings.updateIntervalMs,
        setUpdateIntervalMs: (v) => updateColumnIntervalMs(id, v)
      }}
      data={data}
      isExpanded={!!currentViewingEntry}
      isReloading={isReloading}
      isFirstLoaded={isFirstLoaded}
      onReload={() => fetchData()}
      skeletonItem={<ListItemSkeleton />}
      contentViewer={
        currentViewingEntry ? (
          <DeckPostViewer
            entry={currentViewingEntry}
            onClose={() => setCurrentViewingEntry(null)}
            backTitle={i18next.t("decks.columns.trending")}
          />
        ) : (
          <></>
        )
      }
    >
      {(item: any, measure: Function, index: number) => (
        <SearchListItem
          onMounted={() => measure()}
          index={index + 1}
          entry={{
            ...item,
            toggleNotNeeded: true
          }}
          {...item}
          onEntryView={() => setCurrentViewingEntry(item)}
        />
      )}
    </GenericDeckWithDataColumn>
  );
};
