"use client";

import { useMemo, useState, type UIEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getShortsFeedQueryOptions, ShortsFeedEntry } from "@ecency/sdk";
import i18next from "i18next";
import { Button } from "@ui/button";
import { useInfiniteDataFlow } from "@/utils";
import { WavesReelItem } from "@/app/waves/_components/waves-reel-item";
import { WavesFastReplyDialog } from "@/app/waves/_components/waves-fast-reply-dialog";

interface Props {
  username?: string;
}

/**
 * Shorts (reels) feed: a vertical, scroll-snapping column of full-height video
 * reels backed by the cross-container shorts feed (esync /api/waves/shorts).
 * Selected via the "Shorts" source tab; renders in place of the wave card list.
 */
export function WavesReelsView({ username }: Props) {
  // Undefined when logged out, like the waves list: esync applies the
  // moderation mute list to the shorts feed itself, and an observer would only
  // push the request off the shared 60s response cache (see waves-list-view).
  const observer = username;
  const queryOptions = useMemo(() => getShortsFeedQueryOptions({ observer }), [observer]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useInfiniteQuery(queryOptions);

  const items = useInfiniteDataFlow(data) as ShortsFeedEntry[];
  const [replyingEntry, setReplyingEntry] = useState<ShortsFeedEntry>();

  // Nested scroll container: load more when within ~1.5 screens of the bottom
  // (a viewport-rooted bottom sentinel is unreliable inside a snap scroller).
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight * 1.5) {
      void fetchNextPage();
    }
  };

  if (isError && items.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-dark-200 p-4 text-sm text-gray-700 dark:text-gray-300">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-semibold">
            {i18next.t("waves.feed.unavailable", {
              defaultValue: "We couldn’t load shorts right now."
            })}
          </div>
          <Button appearance="link" size="sm" onClick={() => refetch()}>
            {i18next.t("g.retry", { defaultValue: "Retry" })}
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-dark-200 p-8 text-center text-sm text-gray-600 dark:text-gray-400">
        {i18next.t("waves.shorts-empty", { defaultValue: "No shorts yet." })}
      </div>
    );
  }

  return (
    <>
      <div
        onScroll={onScroll}
        className="flex h-[calc(100dvh-160px)] snap-y snap-mandatory flex-col gap-3 overflow-y-auto pb-4"
      >
        {items.map((item) => (
          <WavesReelItem
            key={`${item.author}/${item.permlink}`}
            item={item}
            onReply={setReplyingEntry}
          />
        ))}
      </div>

      <WavesFastReplyDialog
        show={!!replyingEntry}
        onHide={() => setReplyingEntry(undefined)}
        entry={replyingEntry}
      />
    </>
  );
}
