import { useActiveAccount } from "@/core/hooks";
import { NotificationFilter, NotificationViewType } from "@/enums";
import { LinearProgress } from "@/features/shared";
import { AnimatedNotificationListItemLayout } from "@/features/shared/notifications/animated-notification-list-item-layout";
import { NotificationListItem } from "@/features/shared/notifications/notification-list-item";
import { date2key } from "@/features/shared/notifications/utils";
import { getNotificationsInfiniteQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { useEffect, useMemo, useRef } from "react";
import { getAccessToken } from "@/utils";
import { Button } from "@ui/button";

interface Props {
  filter?: NotificationFilter;
  currentStatus: NotificationViewType;
  openLinksInNewTab?: boolean;
  select?: boolean;
  selectNotification: (d: string) => void;
}

export function NotificationList({
  filter,
  currentStatus,
  openLinksInNewTab,
  select,
  selectNotification
}: Props) {
  const { activeUser } = useActiveAccount();
  const accessToken = getAccessToken(activeUser?.username ?? "");
  const isQueryEnabled = Boolean(activeUser?.username && accessToken);
  const {
    data,
    isFetching,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInfiniteQuery(getNotificationsInfiniteQueryOptions(activeUser?.username, accessToken, filter));

  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  const fetchNextPageRef = useRef(fetchNextPage);
  const isLoadingRef = useRef(false);

  hasNextPageRef.current = hasNextPage;
  isFetchingNextPageRef.current = isFetchingNextPage;
  fetchNextPageRef.current = fetchNextPage;

  const dataFlow = useMemo(
    () => data?.pages.flat() ?? [],
    [data]
  );

  const filteredData = useMemo(() => {
    if (currentStatus === NotificationViewType.READ) {
      return dataFlow.filter((n) => n.read === 1);
    }
    if (currentStatus === NotificationViewType.UNREAD) {
      return dataFlow.filter((n) => n.read === 0);
    }
    return dataFlow;
  }, [dataFlow, currentStatus]);

  const isLoading = isQueryEnabled && isFetching;
  isLoadingRef.current = isLoading;

  useEffect(() => {
    if (isQueryEnabled) {
      refetch();
    }
  }, [filter, isQueryEnabled, refetch]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !isLoadingRef.current &&
          hasNextPageRef.current &&
          !isFetchingNextPageRef.current
        ) {
          fetchNextPageRef.current();
        }
      },
      { rootMargin: "0px 0px 200px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {isLoading && dataFlow.length === 0 ? <LinearProgress /> : <></>}

      <div className={`list-body${filteredData.length === 0 && !isLoading ? " empty-list" : ""}`}>
        {!isLoading && isQueryEnabled && isError && dataFlow.length === 0 ? (
          // A failed or blocked request (content blocker, offline) must not
          // leave the panel looking empty: say so and offer a retry.
          <div className="empty-text flex flex-col items-center gap-3" role="alert">
            <span>{i18next.t("notifications.load-failed")}</span>
            <Button size="sm" appearance="secondary" onClick={() => refetch()}>
              {i18next.t("g.retry")}
            </Button>
          </div>
        ) : (
          !isLoading &&
          filteredData.length === 0 &&
          !hasNextPage && (
            <span className="empty-text">
              {!isQueryEnabled
                ? i18next.t("notifications.auth-required-desc")
                : i18next.t("g.empty-list")}
            </span>
          )
        )}
        {filteredData.map((n, i) => (
          <AnimatedNotificationListItemLayout key={n.id} index={i}>
            {n.gkf && <div className="group-title">{date2key(n.gk)}</div>}
            <NotificationListItem
              notification={n}
              isSelect={select}
              setSelectedNotifications={selectNotification}
              openLinksInNewTab={openLinksInNewTab}
            />
          </AnimatedNotificationListItemLayout>
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
      {isLoading && dataFlow.length > 0 && <LinearProgress />}
    </>
  );
}
