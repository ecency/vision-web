"use client";

import { getWavesFeedQueryOptions } from "@ecency/sdk";
import { WavesListItem } from "@/app/waves/_components/waves-list-item";
import { DetectBottom } from "@/features/shared";
import { WavesListLoader } from "@/app/waves/_components/waves-list-loader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteDataFlow } from "@/utils";
import { useWavesAutoRefresh } from "@/app/waves/_hooks";
import { WavesRefreshPopup } from "@/app/waves/_components";
import { WavesFastReplyDialog } from "@/app/waves/_components/waves-fast-reply-dialog";
import { WaveEntry } from "@/entities";
import { InfiniteData, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { getPromotedPostsQuery } from "@ecency/sdk";
import {
  WAVES_FEED_SCROLL_STORAGE_KEY,
  WavesFeedScrollState,
  WavesFeedType
} from "@/app/waves/_constants";
import { useWavesTagFilter } from "@/app/waves/_context";
import { useBottomPagination } from "@/core/hooks";
import { Button } from "@ui/button";
import { DEFAULT_OBSERVER } from "@/consts/observer";
import i18next from "i18next";
import { sentry } from "@/core/sentry/lazy-sentry";

interface Props {
  feedType: WavesFeedType;
  username?: string;
}

export function WavesListView({ feedType, username }: Props) {
  const { selectedTag, selectedSource } = useWavesTagFilter();
  const tag = feedType === "for-you" ? selectedTag : null;
  // All feeds are one combined, cross-container, keyset-paginated endpoint;
  // tag / following / source are just filters on the same stream. A source feed
  // scopes to a single container host (e.g. peak.snaps); tag/following overlay
  // the For You stream.
  // The logged-in user is the observer, so esync applies THEIR mute list
  // server-side and each page still arrives full (client-side filtering would
  // shrink pages). Note esync actually drops muted authors here, unlike the
  // Hive bridge, which only flags them `stats.gray`.
  // Ecency's own moderation mutes are not this parameter's job: esync applies
  // that list to every waves request on top of the observer's, so it holds for
  // signed-in viewers too. The fallback below only keeps anonymous requests
  // shaped like the rest.
  const observer = username || DEFAULT_OBSERVER;
  const queryOptions = useMemo(() => {
    if (selectedSource) {
      return getWavesFeedQueryOptions({ containers: [selectedSource], observer });
    }

    if (tag) {
      return getWavesFeedQueryOptions({ tag, observer });
    }

    if (feedType === "following") {
      return getWavesFeedQueryOptions({ following: username, observer });
    }

    return getWavesFeedQueryOptions({ observer });
  }, [feedType, tag, selectedSource, username, observer]);

  // The Following feed needs a username; without one `following` drops and the
  // query would silently become the unfiltered combined feed, so gate it until
  // the active user is known.
  const { data, dataUpdatedAt, fetchNextPage, isError, error, hasNextPage, isFetched, isFetching, refetch } =
    useInfiniteQuery(
    {
      ...queryOptions,
      enabled: feedType !== "following" || !!username
    }
  );
  const previousErrorMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isError || !error) {
      previousErrorMessage.current = undefined;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (previousErrorMessage.current !== message) {
      previousErrorMessage.current = message;
      // eslint-disable-next-line no-console
      console.error("[Waves] Failed to load feed", {
        feedType,
        tag,
        message
      });
      sentry.captureException(error, {
        extra: { feedType, tag }
      });
    }
  }, [error, feedType, isError, tag]);
  const { data: promoted } = useQuery({
    ...getPromotedPostsQuery<WaveEntry>("waves"),
    enabled: !tag && !selectedSource
  });
  const dataFlow = useInfiniteDataFlow(data);
  const queryClient = useQueryClient();
  // Reuse the query's own (normalized) key so the refresh-popup cache write
  // always targets exactly what useInfiniteQuery reads, with no drift.
  const wavesQueryKey = queryOptions.queryKey;
  const combinedDataFlow = useMemo(() => {
    if (!promoted || tag || selectedSource) {
      return dataFlow;
    }

    const tempPromoted = [...promoted];
    return dataFlow
      .filter(({ author, permlink }) =>
        promoted.every(
          ({ author: promotedAuthor, permlink: promotedPermlink }) =>
            promotedAuthor !== author || promotedPermlink !== permlink
        )
      )
      .reduce(
        (acc, item, index) => [
          ...acc,
          item,
          ...(index % 4 === 1 && tempPromoted.length > 0 ? [tempPromoted.shift()!] : [])
        ],
        [] as WaveEntry[]
      );
  }, [dataFlow, promoted, tag, selectedSource]);

  const [replyingEntry, setReplyingEntry] = useState<WaveEntry>();
  // Keys of waves prepended via the refresh popup AFTER the initial render —
  // only these get the entrance animation. The initial feed (and older pages
  // appended by infinite scroll) must stay instant, so we scope the guard to
  // the popup-insert path instead of keying off "not seen on first render".
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set());
  const clearFreshKey = useCallback((key: string) => {
    // Drop the key once its entrance finishes so a key-stable remount (e.g.
    // toggling a tag filter) doesn't replay the animation.
    setFreshKeys((prev) => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);
  const shouldAutoRefresh = feedType === "for-you" && !tag && !selectedSource;
  const { newWaves, clear, now } = useWavesAutoRefresh(
    shouldAutoRefresh ? dataFlow[0] : undefined,
    observer
  );
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = sessionStorage.getItem(WAVES_FEED_SCROLL_STORAGE_KEY);

    if (!storedValue) {
      return;
    }

    try {
      const parsed = JSON.parse(storedValue) as WavesFeedScrollState;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      const feedMatches = !parsed.feedType || parsed.feedType === feedType;
      const urlMatches = !parsed.url || parsed.url === currentUrl;

      if (typeof parsed.scrollY === "number" && urlMatches && feedMatches) {
        setPendingScroll(parsed.scrollY);
      }
    } catch (e) {
      // Ignore malformed state
    } finally {
      sessionStorage.removeItem(WAVES_FEED_SCROLL_STORAGE_KEY);
    }
  }, [feedType]);

  useEffect(() => {
    if (pendingScroll === null) {
      return;
    }

    if (combinedDataFlow.length === 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: pendingScroll });
      setPendingScroll(null);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [combinedDataFlow.length, pendingScroll]);

  // Every feed type now paginates via the keyset cursor, so infinite scroll
  // is enabled across For You, Following and Tag (not just For You).
  const shouldShowDetectBottom = hasNextPage;
  const onBottom = useBottomPagination({ data, dataUpdatedAt, hasNextPage, isFetching, fetchNextPage });

  if (isError && combinedDataFlow.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-dark-200 p-4 text-sm text-gray-700 dark:text-gray-300">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="font-semibold">
              {i18next.t("waves.feed.unavailable", {
                defaultValue: "We couldn’t load waves right now."
              })}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {i18next.t("waves.feed.check-connection", {
                defaultValue:
                  "Check your connection or firewall settings for Hive RPC hosts and try again."
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <Button appearance="link" onClick={() => refetch()} size="sm">
              {i18next.t("g.retry", { defaultValue: "Retry" })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Genuinely-empty feed (first page fetched fine, nothing to show and nothing
  // left to paginate) — e.g. a tag/source with no waves or a fresh Following feed.
  if (isFetched && !isError && combinedDataFlow.length === 0 && !hasNextPage) {
    return (
      <div className="rounded-2xl bg-white dark:bg-dark-200 p-4 text-sm text-gray-700 dark:text-gray-300">
        <div className="font-semibold">{i18next.t("waves.feed.empty-title")}</div>
        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          {i18next.t("waves.feed.empty-subtitle")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-8">
      {shouldAutoRefresh && newWaves.length > 0 && (
        <WavesRefreshPopup
          entries={newWaves}
          onClick={() => {
            const wavesToInsert = [...newWaves];

            if (wavesToInsert.length === 0) {
              clear();
              window.scrollTo({ top: 0, behavior: "smooth" });
              void refetch();
              return;
            }

            // A wave is uniquely identified by author + permlink (entry.id is
            // not reliable across the feed sources).
            const keyOf = (entry: WaveEntry) => `${entry.author}/${entry.permlink}`;
            // Collected inside the cache updater so only genuinely-new (deduped)
            // waves get the entrance animation.
            const insertedKeys: string[] = [];

            queryClient.setQueryData<InfiniteData<WaveEntry[], string | undefined>>(
              wavesQueryKey,
              (prev) => {
                if (!prev) {
                  // Empty cache (evicted while the page was open): this seeds
                  // the whole visible feed, which is an initial render — no
                  // entrance animation for any of it.
                  return {
                    pages: [wavesToInsert],
                    pageParams: [undefined]
                  };
                }

                const existingKeys = new Set(prev.pages.flatMap((page) => page.map(keyOf)));
                const deduped = wavesToInsert.filter((entry) => !existingKeys.has(keyOf(entry)));

                if (deduped.length === 0) {
                  return prev;
                }

                insertedKeys.push(...deduped.map(keyOf));

                const [firstPage = [], ...restPages] = prev.pages;

                return {
                  ...prev,
                  pages: [[...deduped, ...firstPage], ...restPages]
                };
              }
            );

            if (insertedKeys.length > 0) {
              setFreshKeys((prev) => {
                const next = new Set(prev);
                insertedKeys.forEach((key) => next.add(key));
                return next;
              });
            }

            clear();
            window.scrollTo({ top: 0, behavior: "smooth" });
            void refetch();
          }}
        />
      )}
      {combinedDataFlow.map((item, i) => {
        const itemKey = `${item.author}/${item.permlink}`;
        const isFresh = freshKeys.has(itemKey);
        return (
          <WavesListItem
            key={itemKey}
            i={i}
            item={item}
            onExpandReplies={() => setReplyingEntry(item)}
            now={now}
            feedType={feedType}
            className={isFresh ? "animate-fade-in-up" : undefined}
            style={isFresh ? { animationDelay: `${Math.min(i, 4) * 50}ms` } : undefined}
            onAnimationEnd={
              isFresh
                ? (e) => {
                    // Child animations bubble; only the item's own entrance counts.
                    if (e.target === e.currentTarget) {
                      clearFreshKey(itemKey);
                    }
                  }
                : undefined
            }
          />
        );
      })}

      {/* A disabled/not-yet-fetched query (e.g. Following before the active
          user hydrates) must read as loading, not as an exhausted feed. */}
      <WavesListLoader data={dataFlow} failed={isError} isEndReached={isFetched && !hasNextPage} />
      {shouldShowDetectBottom && <DetectBottom onBottom={onBottom} />}

      <WavesFastReplyDialog
        show={!!replyingEntry}
        onHide={() => setReplyingEntry(undefined)}
        entry={replyingEntry}
      />
    </div>
  );
}
