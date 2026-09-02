import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ShortListItemSkeleton } from "./deck-items";
import { GenericDeckWithDataColumn } from "./generic-deck-with-data-column";
import { UserDeckGridItem } from "../types";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  effectiveNotificationContentType,
  notificationContentTypesFor,
  notificationsTitles,
  shouldPersistContentTypeCorrection
} from "../consts";
import { DeckGridContext } from "../deck-manager";
import { DeckPostViewer } from "./content-viewer";
import { DeckLoginOverlayPlaceholder } from "./deck-login-overlay-placeholder";
import usePrevious from "react-use/lib/usePrevious";
import { DeckContentTypeColumnSettings } from "./deck-column-settings/deck-content-type-column-settings";
import { InfiniteScrollLoader } from "./helpers";
import { newDataComingPaginatedCondition } from "../utils";
import { ApiNotification, Entry } from "@/entities";
import { getContentQueryOptions, getNotifications } from "@ecency/sdk";
import { NotificationFilter } from "@/enums";
import i18next from "i18next";
import { NotificationListItem } from "@/features/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccessToken } from "@/utils";

interface Props {
  id: string;
  settings: UserDeckGridItem["settings"];
  draggable?: DraggableProvidedDragHandleProps | null;
}

export const DeckNotificationsColumn = ({ id, settings, draggable }: Props) => {
  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();

  const previousActiveUser = usePrevious(activeUser);

  const [data, setData] = useState<ApiNotification[]>([]);
  const prevData = usePrevious(data);
  const [isReloading, setIsReloading] = useState(false);
  const [currentViewingEntry, setCurrentViewingEntry] = useState<Entry>();
  const [isFirstLoaded, setIsFirstLoaded] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);

  const { updateColumnIntervalMs, updateColumnSpecificSettings } = useContext(DeckGridContext);
  const prevSettings = usePrevious(settings);

  const allowedContentTypes = useMemo(
    () => notificationContentTypesFor(settings.username, activeUser?.username),
    [settings.username, activeUser?.username]
  );

  // Used for fetching straight away, before the correction below has been persisted.
  const effectiveContentType = useMemo(
    () =>
      effectiveNotificationContentType(
        settings.contentType,
        settings.username,
        activeUser?.username
      ),
    [settings.contentType, settings.username, activeUser?.username]
  );

  // Persist the correction so the stored value, the header subtitle and the selector all
  // agree, and so it survives a reload. Guarded on the active account being KNOWN: the
  // store starts empty and ClientInit restores the user after mount, so writing during
  // that first render would erase a valid self-only filter on an ordinary reload.
  useEffect(() => {
    if (
      shouldPersistContentTypeCorrection(
        settings.contentType,
        settings.username,
        activeUser?.username
      )
    ) {
      updateColumnSpecificSettings(id, { contentType: effectiveContentType });
    }
  }, [
    settings.contentType,
    settings.username,
    activeUser?.username,
    effectiveContentType,
    id,
    updateColumnSpecificSettings
  ]);

  const fetchData = useCallback(
    async (since?: ApiNotification) => {
      if (data.length) {
        setIsReloading(true);
      }
      const isAll = effectiveContentType === "all";

      try {
        const response = await getNotifications(
          getAccessToken(activeUser!.username),
          isAll ? null : (effectiveContentType as NotificationFilter),
          since?.id,
          settings.username
        );

        if (response.length === 0) {
          setHasNextPage(false);
        }

        if (since) {
          setData([...data, ...response]);
        } else {
          setData(response ?? []);
        }
      } catch (e) {
      } finally {
        setIsReloading(false);
        setIsFirstLoaded(true);
      }
    },
    [activeUser, data, effectiveContentType, settings.username]
  );

  useEffect(() => {
    if (prevSettings && prevSettings?.contentType !== settings.contentType) {
      setData([]);
      fetchData();
    }
  }, [prevSettings, settings.contentType, fetchData]);

  useEffect(() => {
    if (activeUser?.username !== previousActiveUser?.username) {
      fetchData();
    }

    if (!activeUser) {
      setData([]);
    }
  }, [fetchData, previousActiveUser, activeUser]);

  return (
    <GenericDeckWithDataColumn
      id={id}
      draggable={draggable}
      header={{
        title: "@" + settings.username.toLowerCase(),
        subtitle: notificationsTitles[settings.contentType]
          ? `${i18next.t("decks.notifications")} – ${notificationsTitles[settings.contentType]}`
          : i18next.t("decks.notifications"),
        icon: null,
        updateIntervalMs: settings.updateIntervalMs,
        setUpdateIntervalMs: (v) => updateColumnIntervalMs(id, v),
        additionalSettings: (
          <DeckContentTypeColumnSettings
            contentTypes={allowedContentTypes}
            settings={settings}
            id={id}
          />
        )
      }}
      data={data}
      isReloading={isReloading}
      onReload={() => fetchData()}
      skeletonItem={<ShortListItemSkeleton />}
      isExpanded={!!currentViewingEntry}
      isFirstLoaded={isFirstLoaded}
      contentViewer={
        currentViewingEntry && (
          <DeckPostViewer
            entry={currentViewingEntry}
            onClose={() => setCurrentViewingEntry(undefined)}
          />
        )
      }
      newDataComingCondition={(newData) =>
        newDataComingPaginatedCondition(newData, prevData, "timestamp")
      }
      overlay={<DeckLoginOverlayPlaceholder />}
      afterDataSlot={<InfiniteScrollLoader data={data} isEndReached={!hasNextPage} />}
    >
      {(item: ApiNotification, measure: Function, index: number) => (
        <NotificationListItem
          onMounted={() => {
            measure();

            const isLast = data[data.length - 1]?.id === item.id;
            if (isLast && hasNextPage) {
              fetchData(item);
            }
          }}
          notification={item}
          isDeck={true}
          className="px-4 gap-4 notification-list-item"
          onLinkClick={async () => {
            switch (item.type) {
              case "bookmarks":
              case "mention":
              case "reply":
              case "unvote":
              case "vote":
              case "favorites":
              case "reblog":
                {
                  const entry = await queryClient.fetchQuery(
                    getContentQueryOptions(item.author, item.permlink)
                  );
                  if (entry) {
                    setCurrentViewingEntry(entry);
                  }
                  break;
                }
              case "tags":
                {
                  // A single post opens in the deck like the entry types above; a
                  // bundle has no post behind it, its row links to the tag feed.
                  if (item.author && item.permlink) {
                    const entry = await queryClient.fetchQuery(
                      getContentQueryOptions(item.author, item.permlink)
                    );
                    if (entry) {
                      setCurrentViewingEntry(entry);
                    }
                  }
                  break;
                }
              case "delegations":
              case "follow":
              case "ignore":
              case "inactive":
              case "referral":
              case "transfer":
              case "unfollow":
              case "spin":
              default:
                break;
            }
          }}
        />
      )}
    </GenericDeckWithDataColumn>
  );
};
