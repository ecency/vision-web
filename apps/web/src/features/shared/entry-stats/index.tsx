"use client";

import { EcencyConfigManager } from "@/config";
import { useActiveAccount } from "@/core/hooks";
import { Entry } from "@/entities";
import dayjs from "@/utils/dayjs";
import { getStatsQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { UilEye, UilInfoCircle } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { EntryPageStatsByDevices } from "./entry-page-stats-by-devices";
import { EntryPageStatsByReferrers } from "./entry-page-stats-by-referrers";
import { EntryPageStatsItem } from "./entry-page-stats-item";

interface Props {
  entry: Entry;
  // Dense action rows (waves detail) size the eye at 16px instead of the
  // Button slot's 20px. `!` is required: the slot's [&>svg]:size-5 ties a
  // plain utility on specificity and wins on order.
  iconClassName?: string;
}

export function EntryStats({ entry, iconClassName }: Props) {
  const { activeUser } = useActiveAccount();
  const [showStats, setShowStats] = useState(false);
  // Without Plausible the stats API answers 404: ask nothing, show nothing.
  const statsEnabled = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.plausible.enabled
  );

  // Canonical post path (`/@author/permlink`). The recorded Plausible page varies
  // by entry route — bare `/@author/permlink`, community `/hive-123/@author/permlink`,
  // tag `/tag/@author/permlink` — but every shape contains this canonical suffix, so a
  // `contains` match on it catches them all while staying anchored to this author
  // (unlike the old bare `author/permlink`, which also matched unrelated paths).
  const pathname = useMemo(
    () => `/@${entry.author}/${entry.permlink}`,
    [entry.author, entry.permlink]
  );
  const createdDate = useMemo(() => dayjs(entry.created).format("DD MMM YYYY"), [entry.created]);

  // Scope every stats query to the post's own lifetime (created → today). ClickHouse
  // orders events by `(site_id, toDate(timestamp), …)` and partitions by month, so a
  // bounded range prunes to a handful of granules instead of scanning all history —
  // the difference between a sub-second lookup and the multi-second full scan that
  // (un-scoped) used to time out and silently render 0.
  const dateRange = useMemo<[string, string]>(
    () => [dayjs(entry.created).format("YYYY-MM-DD"), dayjs().format("YYYY-MM-DD")],
    [entry.created]
  );

  // "Views" uses Plausible `visits` (sessions), not `pageviews`: a single user
  // refreshing the post inflates pageviews but not visits, so visits is the
  // reload-proof view count. It stays distinct from `visitors` (unique people).
  const { data: stats } = useQuery(
    getStatsQueryOptions({
      url: pathname,
      metrics: ["visitors", "visits"],
      dateRange,
      enabled: !!activeUser && statsEnabled
    })
  );
  const totalVisitors = useMemo(() => stats?.results?.[0]?.metrics?.[0] || 0, [stats?.results]);
  const totalViews = useMemo(() => stats?.results?.[0]?.metrics?.[1] ?? 0, [stats?.results]);

  // Average visit duration for sessions that *landed* on this post
  // (`visit:entry_page`) — reflects time spent after arriving here rather than
  // the whole multi-page session. Plausible's `visit_duration` is already an
  // average in seconds, so it's displayed as-is (still session-level, not
  // per-page: Plausible CE has no `time_on_page` metric).
  const { data: durationStats } = useQuery(
    getStatsQueryOptions({
      url: pathname,
      metrics: ["visit_duration"],
      filterBy: "visit:entry_page",
      dateRange,
      enabled: !!activeUser && statsEnabled
    })
  );
  const avgVisitDuration = useMemo(() => {
    const seconds = Math.round(durationStats?.results?.[0]?.metrics?.[0] ?? 0);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${String(secs).padStart(2, "0")}s` : `${secs}s`;
  }, [durationStats?.results]);

  if (!activeUser || !statsEnabled) return null;

  return (
    <>
      <Button
        noPadding={true}
        icon={<UilEye className={iconClassName} />}
        iconPlacement="left"
        size="sm"
        appearance="gray-link"
        onClick={() => setShowStats(true)}
      >
        {totalViews}
      </Button>
      <Modal size="lg" centered={true} show={showStats} onHide={() => setShowStats(false)}>
        <ModalHeader closeButton={true}>{i18next.t("entry.stats.stats-details")}</ModalHeader>
        <ModalBody className="flex flex-col gap-4 lg:gap-6">
          <div className="text-sm opacity-50 flex items-center flex-wrap gap-1.5">
            <span>
              {createdDate} – {i18next.t("g.today")}
            </span>
            <span className="size-1 bg-gray-600 dark:bg-gray-400 inline-flex rounded-full" />
            <span>{i18next.t("entry.stats.update-info")}</span>
          </div>
          <div className="grid grid-cols-3">
            <EntryPageStatsItem count={totalViews} label={i18next.t("entry.stats.views")} />
            <EntryPageStatsItem count={totalVisitors} label={i18next.t("entry.stats.visitors")} />
            <EntryPageStatsItem
              count={avgVisitDuration}
              label={i18next.t("entry.stats.avg-visit-duration")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <EntryPageStatsByDevices
              cleanedPathname={pathname}
              dateRange={dateRange}
              totalViews={totalViews}
            />
            <EntryPageStatsByReferrers
              cleanedPathname={pathname}
              dateRange={dateRange}
              totalViews={totalViews}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between p-4 rounded-2xl border border-[--border-color]">
            <div className="flex flex-col">
              <div className="text-xl">{i18next.t("entry.stats.promotion-title")}</div>
              <div className="text-sm opacity-50">
                {i18next.t("entry.stats.promotion-subtitle")}
              </div>
            </div>
            <Button href="/perks" icon="🔥" size="lg">
              {i18next.t("entry.stats.try-now")}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm opacity-50">
            <UilInfoCircle className="size-5" />
            <div>{i18next.t("entry.stats.warn")}</div>
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}
