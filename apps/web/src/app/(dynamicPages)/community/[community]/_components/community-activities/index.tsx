"use client";

import React, { Fragment, useMemo } from "react";
import "./_index.scss";
import { Button } from "@ui/button";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getAccountNotificationsInfiniteQueryOptions } from "@ecency/sdk";
import { EntryLink, LinearProgress, ProfileLink, UserAvatar } from "@/features/shared";
import i18next from "i18next";
import { Community } from "@/entities";
import { AccountNotification } from "@ecency/sdk";
import { dateToFullRelative } from "@/utils";
import type { InfiniteData } from "@tanstack/react-query";

interface ListItemProps {
  notification: AccountNotification;
}

export function NListItem({ notification }: ListItemProps) {
  const mentions = useMemo(() => notification.msg.match(/@[\w.\d-]+/gi), [notification]);

  // Avoid building a RegExp with an empty pattern list
  const patterns = useMemo(() => {
    const ps: string[] = [];
    if (notification.url.startsWith("@")) ps.push(notification.url);
    if (mentions?.length) ps.push(...mentions);
    return ps;
  }, [notification.url, mentions]);

  const username = useMemo(() => mentions?.[0]?.replace("@", ""), [mentions]);

  const parts = useMemo(() => {
    if (!patterns.length) return [notification.msg];
    const re = new RegExp(`(${patterns.join("|")})`, "gi");
    return notification.msg.split(re);
  }, [notification.msg, patterns]);

  return mentions ? (
      <div className="activity-list-item">
        <div className="activity-user">
          <ProfileLink username={username ?? ""}>
            <UserAvatar username={username ?? ""} size="medium" />
          </ProfileLink>
        </div>
        <div className="activity-content">
          <div className="activity-msg">
            {parts
                .filter((part) => part.trim() !== "")
                .map((part, i) => {
                  if (patterns.some((p) => p.toLowerCase() === part.toLowerCase())) {
                    if (part.includes("/")) {
                      const [u, permlink] = part.split("/");
                      return (
                          <Fragment key={i}>
                            <EntryLink
                                entry={{ category: "post", author: u.replace("@", ""), permlink }}
                            >
                              {part}
                            </EntryLink>
                          </Fragment>
                      );
                    }
                    return (
                        <Fragment key={i}>
                          <ProfileLink username={part.replace("@", "")}>{part}</ProfileLink>
                        </Fragment>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
          </div>
          <div className="activity-date">{dateToFullRelative(notification.date)}</div>
        </div>
      </div>
  ) : null;
}

interface Props {
  community: Community;
}

// ---- helper: detect InfiniteData at runtime & narrow for TS
type NotifPage = AccountNotification[];

function isInfinite<TPage>(d: unknown): d is InfiniteData<TPage, unknown> {
  return !!d && typeof d === "object" && "pages" in (d as any);
}

export function CommunityActivities({ community }: Props) {
  const result = useInfiniteQuery(getAccountNotificationsInfiniteQueryOptions(community.name, 50));
  const { isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = result;

  // Narrow `data` safely
  const pagesArr: NotifPage[] = useMemo(() => {
    const d = result.data as unknown;
    return isInfinite<NotifPage>(d) ? d.pages : [];
  }, [result.data]);

  const hasMore = useMemo(() => {
    if (typeof hasNextPage === "boolean") return hasNextPage;
    const last = pagesArr[pagesArr.length - 1];
    return Array.isArray(last) && last.length === 50;
  }, [hasNextPage, pagesArr]);

  const items = useMemo(
      () => pagesArr.flatMap((p) => (Array.isArray(p) ? p : [])),
      [pagesArr]
  );

  // The SDK used to swallow fetch errors into an empty page, so a failed
  // request was indistinguishable from an empty log. It now surfaces the error,
  // which is only useful if it is actually rendered: without this, a failed
  // request still looks like a community with no activity.
  const hasFailed = isError && !isFetchingNextPage;

  return (
      <div className="community-activities">
        {(isLoading || isFetchingNextPage) && <LinearProgress />}

        {hasFailed && (
            <div className="activity-error flex flex-col items-center gap-3 py-6">
              <div className="text-gray-600 dark:text-gray-400">
                {i18next.t("g.server-error")}
              </div>
              <Button size="sm" appearance="secondary" onClick={() => refetch()}>
                {i18next.t("g.retry")}
              </Button>
            </div>
        )}

        <div className="activity-list">
          <div className="activity-list-body">
            {items.map((item, i) => (
                <NListItem key={`${item.date}-${i}`} notification={item} />
            ))}
          </div>
        </div>

        {hasMore && !hasFailed && (
            <div className="load-more">
              <Button
                  disabled={isLoading || isFetchingNextPage}
                  onClick={() => fetchNextPage()}
              >
                {i18next.t("g.load-more")}
              </Button>
            </div>
        )}
      </div>
  );
}
