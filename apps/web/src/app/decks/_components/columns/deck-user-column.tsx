import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ListItemSkeleton, SearchListItem } from "./deck-items";
import { GenericDeckWithDataColumn } from "./generic-deck-with-data-column";
import { UserDeckGridItem } from "../types";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { USER_CONTENT_TYPES, userTitles } from "../consts";
import { DeckGridContext } from "../deck-manager";
import { DeckPostViewer } from "./content-viewer";
import { DeckContentTypeColumnSettings } from "./deck-column-settings/deck-content-type-column-settings";
import usePrevious from "react-use/lib/usePrevious";
import dayjs from "@/utils/dayjs";
import { newDataComingPaginatedCondition } from "../utils";
import { InfiniteScrollLoader } from "./helpers";
import { Entry } from "@/entities";
import { entryKey, getAccountPostsQueryOptions } from "@ecency/sdk";
import { useDataLimit } from "@/utils/data-limit";
import i18next from "i18next";
import useMount from "react-use/lib/useMount";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  id: string;
  settings: UserDeckGridItem["settings"];
  draggable?: DraggableProvidedDragHandleProps | null;
}

type IdentifiableEntry = Entry & Required<Pick<Entry, "id">>;

export const DeckUserColumn = ({ id, settings, draggable }: Props) => {
  const queryClient = useQueryClient();
  const dataLimit = useDataLimit();
  const [data, setData] = useState<IdentifiableEntry[]>([]);
  const dataRef = useRef<IdentifiableEntry[]>([]);
  const prevData = usePrevious(data);
  const [isReloading, setIsReloading] = useState(false);
  const [currentViewingEntry, setCurrentViewingEntry] = useState<Entry | null>(null);
  const [isFirstLoaded, setIsFirstLoaded] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);

  const { updateColumnIntervalMs } = useContext(DeckGridContext);
  const prevSettings = usePrevious(settings);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useMount(() => {
    fetchData();
  });

  const fetchData = useCallback(
    async (since?: Entry) => {
      if (dataRef.current.length) {
        setIsReloading(true);
      }

      try {
        const response = await queryClient.fetchQuery(
          getAccountPostsQueryOptions(
            settings.username,
            settings.contentType,
            since?.author,
            since?.permlink,
            dataLimit
          )
        );
        let items = response?.map((i) => ({ ...i, id: entryKey(i) })) ?? [];
        items = items.sort((a, b) => (dayjs(a.created).isAfter(dayjs(b.created)) ? -1 : 1));

        if (items.length === 0) {
          setHasNextPage(false);
        }

        if (since) {
          setData((prev) => [...prev, ...items]);
        } else {
          setData(items ?? []);
        }
      } catch (e) {
      } finally {
        setIsReloading(false);
        setIsFirstLoaded(true);
      }
    },
    [dataLimit, queryClient, settings.contentType, settings.username]
  );

  useEffect(() => {
    setData([]);
    setHasNextPage(true);
    fetchData();
  }, [dataLimit]);

  useEffect(() => {
    if (prevSettings && prevSettings?.contentType !== settings.contentType) {
      setData([]);
      fetchData();
    }
  }, [fetchData, prevSettings, settings.contentType]);

  return (
    <GenericDeckWithDataColumn
      id={id}
      draggable={draggable}
      header={{
        title: "@" + settings.username.toLowerCase(),
        subtitle: userTitles[settings.contentType] ?? i18next.t("decks.user"),
        icon: null,
        updateIntervalMs: settings.updateIntervalMs,
        setUpdateIntervalMs: (v) => updateColumnIntervalMs(id, v),
        additionalSettings: (
          <DeckContentTypeColumnSettings
            contentTypes={USER_CONTENT_TYPES}
            settings={settings}
            id={id}
          />
        )
      }}
      data={data}
      isVirtualScroll={false}
      isExpanded={!!currentViewingEntry}
      isReloading={isReloading}
      isFirstLoaded={isFirstLoaded}
      onReload={() => fetchData()}
      skeletonItem={<ListItemSkeleton />}
      newDataComingCondition={(newData) => newDataComingPaginatedCondition(newData, prevData)}
      contentViewer={
        currentViewingEntry ? (
          <DeckPostViewer
            entry={currentViewingEntry}
            onClose={() => setCurrentViewingEntry(null)}
            backTitle={`@${settings.username}(${
              userTitles[settings.contentType] ?? i18next.t("decks.user")
            })`}
          />
        ) : (
          <></>
        )
      }
      afterDataSlot={<InfiniteScrollLoader data={data} isEndReached={!hasNextPage} />}
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
          onAppear={() => {
            const isLast = data[data.length - 1]?.id === item.id;
            if (isLast && hasNextPage) {
              fetchData(item);
            }
          }}
          onEntryView={() => setCurrentViewingEntry(item)}
        ></SearchListItem>
      )}
    </GenericDeckWithDataColumn>
  );
};
