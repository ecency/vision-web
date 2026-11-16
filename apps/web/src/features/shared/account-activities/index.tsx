"use client";

import React, { Fragment, useEffect, useMemo } from "react";
import "./_index.scss";
import { Button } from "@ui/button";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AccountNotification, getAccountNotificationsInfiniteQueryOptions } from "@ecency/sdk";
import i18next from "i18next";
import { EntryLink } from "@/features/shared/entry-link";
import { LinearProgress } from "@/features/shared/linear-progress";
import { ProfileLink } from "@/features/shared/profile-link";
import { UserAvatar } from "@/features/shared/user-avatar";
import { dateToFullRelative } from "@/utils";

const PAGE_SIZE = 50;
// A type filter runs over loaded pages, so a rare type can match nothing on the
// first page. Keep fetching while the filtered list is short, up to this many pages.
const AUTO_FETCH_PAGES = 6;
const FILTERED_MIN_ROWS = 10;

interface ListItemProps {
  notification: AccountNotification;
}

export function AccountActivityItem({ notification }: ListItemProps) {
  const mentions = useMemo(() => notification.msg.match(/@[\w.\d-]+/gi), [notification]);

  // Avoid building a RegExp with an empty pattern list
  const patterns = useMemo(() => {
    const ps: string[] = [];
    if (notification.url.startsWith("@")) ps.push(notification.url);
    if (mentions?.length) ps.push(...mentions);
    return ps;
  }, [notification.url, mentions]);

  const username = useMemo(() => mentions?.[0]?.replace("@", ""), [mentions]);

  // Bridge messages say "your post"; the post itself is only in `url` (@author/permlink).
  const postPath = useMemo(() => {
    const m = notification.url.match(/^@([\w.\d-]+)\/(.+)$/);
    return m ? [m[1], m[2]] : null;
  }, [notification.url]);

  const msgHasUrl = useMemo(
    () => notification.msg.toLowerCase().includes(notification.url.toLowerCase()),
    [notification.msg, notification.url]
  );

  const parts = useMemo(() => {
    if (!patterns.length) return [notification.msg];
    const re = new RegExp(`(${patterns.join("|")})`, "gi");
    return notification.msg.split(re);
  }, [notification.msg, patterns]);

  return (
    <div className="activity-list-item">
      <div className="activity-user">
        {username && (
          <ProfileLink username={username}>
            <UserAvatar username={username} size="medium" />
          </ProfileLink>
        )}
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
                      <EntryLink entry={{ category: "post", author: u.replace("@", ""), permlink }}>
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
        <div className="activity-date">
          {postPath && !msgHasUrl ? (
            <EntryLink
              className="hover:underline"
              entry={{ category: "post", author: postPath[0], permlink: postPath[1] }}
            >
              {dateToFullRelative(notification.date)}
            </EntryLink>
          ) : (
            dateToFullRelative(notification.date)
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  /** Account or community whose bridge.account_notifications log is listed. */
  account: string;
  /** Show only these notification types. The log is paged unfiltered, so this filters loaded pages. */
  types?: readonly string[];
}

/**
 * An account's on-chain notifications (Hive bridge.account_notifications): a
 * community's activity tab and a profile's notifications section. Public data,
 * the same for every viewer.
 */
export function AccountActivities({ account, types }: Props) {
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(getAccountNotificationsInfiniteQueryOptions(account, PAGE_SIZE));

  const items = useMemo(() => {
    const all = (data?.pages ?? []).flatMap((p) => (Array.isArray(p) ? p : []));
    return types ? all.filter((n) => types.includes(n.type)) : all;
  }, [data, types]);

  // The SDK used to swallow fetch errors into an empty page, so a failed
  // request was indistinguishable from an empty log. It now surfaces the error,
  // which is only useful if it is actually rendered: without this, a failed
  // request still looks like an account with no activity.
  const hasFailed = isError && !isFetchingNextPage;

  const pageCount = data?.pages.length ?? 0;
  // One flag for both the effect and the render: between an auto-fetched page
  // landing and the effect asking for the next one, nothing is fetching, and the
  // list must not read as empty or offer Load More in that gap.
  const willAutoFetch =
    !!types && items.length < FILTERED_MIN_ROWS && !!hasNextPage && !isError && pageCount < AUTO_FETCH_PAGES;
  // pageCount is a dependency on purpose: a page can start and land within one
  // render, leaving the other dependencies unchanged.
  useEffect(() => {
    if (willAutoFetch && !isFetching) {
      fetchNextPage();
    }
  }, [willAutoFetch, isFetching, pageCount, fetchNextPage]);

  // Only once the log is exhausted: with pages left (past the auto-fetch cap)
  // Load More is the answer, not "nothing here".
  const isEmpty = !isFetching && !isError && !hasNextPage && items.length === 0;

  return (
    <div className="account-activities">
      {(isLoading || isFetchingNextPage || willAutoFetch) && <LinearProgress />}

      {hasFailed && (
        <div className="activity-error flex flex-col items-center gap-3 py-6">
          <div className="text-gray-600 dark:text-gray-400">{i18next.t("g.server-error")}</div>
          <Button size="sm" appearance="secondary" onClick={() => refetch()}>
            {i18next.t("g.retry")}
          </Button>
        </div>
      )}

      {isEmpty && (
        <div className="activity-empty py-6 text-center text-gray-600 dark:text-gray-400">
          {i18next.t("g.empty-list")}
        </div>
      )}

      <div className="activity-list">
        <div className="activity-list-body">
          {items.map((item) => (
            <AccountActivityItem key={item.id} notification={item} />
          ))}
        </div>
      </div>

      {hasNextPage && !hasFailed && !willAutoFetch && (
        <div className="load-more">
          <Button disabled={isLoading || isFetchingNextPage} onClick={() => fetchNextPage()}>
            {i18next.t("g.load-more")}
          </Button>
        </div>
      )}
    </div>
  );
}
