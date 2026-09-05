"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getCurationRecommendationsInfiniteQueryOptions,
  type CurationRecommendationItem,
  type CurationRecommendationsSort,
} from "@ecency/sdk";
import { Button } from "@ui/button";
import { EcencyConfigManager } from "@/config";
import { error as errorToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { useBottomPagination } from "@/core/hooks/use-bottom-pagination";
import { DetectBottom } from "@/features/shared/detect-bottom";
import { UserAvatar } from "@/features/shared/user-avatar";
import { dateToRelative } from "@/utils";
import { Chip, RecommendBadge } from "./curation-mark-badges";
import { CurationRecommendBtn } from "./curation-recommend-btn";
import { useCurationDismissReco, useViewerRole } from "./hooks";

function reasonsTooltip(item: CurationRecommendationItem): string {
  return Object.entries(item.reasons ?? {})
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([reason, n]) => `${i18next.t(`curation-desk.reasons.${reason}`)}: ${n}`)
    .join(", ");
}

function RecommendationRow({ item, canDismiss, isRoster, username, recommendationsEnabled }: { item: CurationRecommendationItem; canDismiss: boolean; isRoster: boolean; username: string | undefined; recommendationsEnabled: boolean }) {
  const dismiss = useCurationDismissReco();
  const mine = item.recommenders.some((r) => r.username === username);
  return (
    <li className="flex items-start gap-3 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <a href={`/@${item.author}/${item.permlink}`} className="font-semibold hover:underline line-clamp-2">
          {item.title || i18next.t("curation-desk.row.untitled", { author: item.author })}
        </a>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mt-0.5">
          <UserAvatar username={item.author} size="xsmall" className="size-4 rounded-full" />
          <span>@{item.author}</span>
          <span>{dateToRelative(item.created)}</span>
          <span title={reasonsTooltip(item)}>
            <RecommendBadge
              count={item.recommend_count}
              networks={item.unique_recommenders}
              noMeta={item.no_meta_count}
              recommenders={item.recommenders}
              showCollapse={isRoster}
            />
          </span>
        </div>
        <ul className="flex flex-wrap gap-1 mt-1 text-[11px] text-gray-500">
          {item.recommenders.slice(0, 6).map((r) => (
            <li key={r.username} className="inline-flex items-center gap-1">
              @{r.username}
              {r.reason && <Chip tone="blue">{i18next.t(`curation-desk.reasons.${r.reason}`)}</Chip>}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-end gap-1">
        {recommendationsEnabled && username !== item.author && (
          <CurationRecommendBtn author={item.author} permlink={item.permlink} alreadyRecommended={mine} compact />
        )}
        {canDismiss && (
          <Button
            size="xs"
            appearance="gray-link"
            className="!rounded-lg"
            disabled={dismiss.isPending}
            aria-label={i18next.t("curation-desk.reco.dismiss")}
            onClick={() =>
              dismiss.mutate(
                { author: item.author, permlink: item.permlink, action: "dismiss" },
                { onError: (e) => errorToast(...formatError(e)) }
              )
            }
          >
            {i18next.t("curation-desk.reco.dismiss")}
          </Button>
        )}
      </div>
    </li>
  );
}

/** Public list of open posts with active recommendations (route 4). */
export function CurationRecommendationsView() {
  const viewer = useViewerRole();
  const recommendationsEnabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.recommendations.enabled
  );
  const [sort, setSort] = useState<CurationRecommendationsSort>("unique");
  const query = useInfiniteQuery(getCurationRecommendationsInfiniteQueryOptions({ sort }));
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const loadMore = useBottomPagination({
    data: query.data,
    dataUpdatedAt: query.dataUpdatedAt,
    hasNextPage: query.hasNextPage,
    isFetching: query.isFetching,
    fetchNextPage: query.fetchNextPage,
  });

  return (
    <div className="bg-white dark:bg-dark-200 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[--border-color] text-xs">
        <span className="text-gray-500">{i18next.t("curation-desk.sort.label")}</span>
        {(["unique", "newest"] as CurationRecommendationsSort[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={sort === value}
            className={clsx(
              "rounded-full px-3 py-1",
              sort === value ? "bg-blue-dark-sky text-white" : "bg-gray-100 dark:bg-dark-default text-gray-700 dark:text-gray-300"
            )}
            onClick={() => setSort(value)}
          >
            {i18next.t(`curation-desk.sort.${value}`)}
          </button>
        ))}
        {sort === "unique" && <span className="text-gray-500">{i18next.t("curation-desk.sort.unique-hint")}</span>}
      </div>
      {query.isLoading && <p className="p-4 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>}
      {query.isError && <p className="p-4 text-sm text-red-600 dark:text-red-400" role="alert">{i18next.t("curation-desk.list.error")}</p>}
      {!query.isLoading && items.length === 0 && !query.isError && (
        <p className="p-6 text-sm text-gray-500 text-center">{i18next.t("curation-desk.reco-view.empty")}</p>
      )}
      <ul className="divide-y divide-[--border-color]" aria-label={i18next.t("curation-desk.reco-view.title")}>
        {items.map((item) => (
          <RecommendationRow
            key={`${item.author}/${item.permlink}`}
            item={item}
            // The dismiss route answers a trial curator with a 403.
            canDismiss={viewer.isRoster && !viewer.isTrial}
            isRoster={viewer.isRoster}
            username={viewer.username}
            recommendationsEnabled={recommendationsEnabled}
          />
        ))}
      </ul>
      {query.hasNextPage && <DetectBottom onBottom={loadMore} />}
    </div>
  );
}
