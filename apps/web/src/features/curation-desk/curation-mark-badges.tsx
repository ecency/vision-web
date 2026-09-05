"use client";

import { memo } from "react";
import clsx from "clsx";
import i18next from "i18next";
import {
  UilAward,
  UilBell,
  UilCheck,
  UilCommentAltNotes,
  UilExclamationTriangle,
  UilThumbsUp,
} from "@tooni/iconscout-unicons-react";
import { dateToRelative } from "@/utils";
import { UserAvatar } from "@/features/shared/user-avatar";
import type { DeskRow } from "./types";

interface ChipProps {
  tone?: "green" | "amber" | "red" | "gray" | "blue";
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function Chip({ tone = "gray", title, className, children }: ChipProps) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 whitespace-nowrap",
        tone === "green" && "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
        tone === "amber" && "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        tone === "red" && "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
        tone === "blue" && "bg-blue-duck-egg text-blue-dark-sky dark:bg-blue-dark-grey dark:text-blue-dark-sky-active",
        tone === "gray" && "bg-gray-100 text-gray-600 dark:bg-dark-default dark:text-gray-400",
        className
      )}
    >
      {children}
    </span>
  );
}

interface RecommendBadgeProps {
  count: number;
  networks: number;
  noMeta: number;
  recommenders?: Array<{ username: string; rep?: number | null }>;
  showCollapse?: boolean;
}

/** "Recommended by N (M networks)" with up to three stacked avatars. */
export function RecommendBadge({ count, networks, noMeta, recommenders, showCollapse }: RecommendBadgeProps) {
  if (count <= 0) return null;
  const top = (recommenders ?? [])
    .slice()
    .sort((a, b) => (b.rep ?? 0) - (a.rep ?? 0))
    .slice(0, 3);
  return (
    <Chip tone="blue" title={i18next.t("curation-desk.reco.tooltip")}>
      <UilAward className="size-3.5" aria-hidden />
      {i18next.t("curation-desk.reco.badge", { count, networks })}
      {noMeta > 0 && <span className="opacity-70">{i18next.t("curation-desk.reco.no-meta", { count: noMeta })}</span>}
      {showCollapse && count > networks && (
        <span className="opacity-70">{i18next.t("curation-desk.reco.collapse", { accounts: count, networks })}</span>
      )}
      {top.length > 0 && (
        <span className="flex -space-x-1 ml-0.5">
          {top.map((r) => (
            <UserAvatar key={r.username} username={r.username} size="xsmall" className="size-4 rounded-full ring-1 ring-white dark:ring-dark-200" />
          ))}
        </span>
      )}
    </Chip>
  );
}

interface Props {
  row: DeskRow;
  isRoster: boolean;
  reviewedByCursor: boolean;
  late: boolean;
  resurfaced: boolean;
  belowCursor: boolean;
  chronological: boolean;
}

/** Markers of spec 8.4 item 8: curated, voted, reviewed, snoozed, flagged, notes, trail facts. */
export const CurationMarkBadges = memo(function CurationMarkBadges({
  row,
  isRoster,
  reviewedByCursor,
  late,
  resurfaced,
  belowCursor,
  chronological,
}: Props) {
  const overlay = row.overlay;
  const trailed = row.trailed_by;
  const teamMark = overlay?.team_mark;
  const reviewedMark = overlay?.marks.find((m) => m.state === "reviewed");
  const snoozeMark = overlay?.marks.find((m) => m.state === "snoozed");
  const flagMark = overlay?.marks.find((m) => m.state === "flagged");
  const payoutValue = row.pending_payout ?? row.pending_payout_est ?? null;
  const payoutEstimated = row.pending_payout == null && row.pending_payout_est != null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {trailed && (
        <Chip tone={trailed.confirmed ? "green" : "amber"} title={i18next.t(`curation-desk.marks.source-${trailed.source === "erobot_push" ? "erobot" : trailed.source === "inferred" ? "inferred" : "history"}`)}>
          <UilThumbsUp className="size-3.5" aria-hidden />
          {trailed.confirmed
            ? i18next.t("curation-desk.marks.curated-by", { curator: trailed.curator, weight: (trailed.weight / 100).toFixed(1), when: dateToRelative(trailed.at) })
            : i18next.t("curation-desk.marks.trail-sent", { curator: trailed.curator })}
        </Chip>
      )}
      {row.voted_by
        .filter((v) => !trailed || v.voter !== trailed.curator)
        .slice(0, 2)
        .map((v) => (
          <Chip key={v.voter} tone="gray" title={i18next.t("curation-desk.marks.not-trailed-why")}>
            <UilThumbsUp className="size-3.5" aria-hidden />
            {i18next.t("curation-desk.marks.voted-by", { voter: v.voter, weight: (v.weight / 100).toFixed(0) })}
          </Chip>
        ))}
      {row.unvoted_at != null && (
        <Chip tone="red">{i18next.t("curation-desk.marks.unvoted")}</Chip>
      )}
      {isRoster && teamMark === "reviewed" && (
        <Chip tone="gray">
          <UilCheck className="size-3.5" aria-hidden />
          {i18next.t("curation-desk.marks.reviewed-by", {
            curator: reviewedMark?.curator ?? overlay?.team_mark_by ?? "",
            when: reviewedMark ? dateToRelative(reviewedMark.updated_at) : "",
          })}
        </Chip>
      )}
      {isRoster && !teamMark && reviewedByCursor && !late && !resurfaced && (
        <Chip tone="gray">
          <UilCheck className="size-3.5" aria-hidden />
          {i18next.t("curation-desk.marks.reviewed-by-cursor")}
        </Chip>
      )}
      {isRoster && teamMark === "snoozed" && (
        <Chip tone="amber">
          <UilBell className="size-3.5" aria-hidden />
          {i18next.t("curation-desk.marks.snoozed-until", {
            curator: snoozeMark?.curator ?? overlay?.team_mark_by ?? "",
            until: snoozeMark?.snooze_until ? new Date(snoozeMark.snooze_until).toISOString().slice(11, 16) : "",
          })}
        </Chip>
      )}
      {isRoster && teamMark === "flagged" && (
        <Chip tone="red">
          <UilExclamationTriangle className="size-3.5" aria-hidden />
          {flagMark?.reason
            ? i18next.t(`curation-desk.flag-reasons.${flagMark.reason}`, { defaultValue: flagMark.reason })
            : i18next.t("curation-desk.marks.flagged")}
          {flagMark?.curator ? ` · @${flagMark.curator}` : ""}
        </Chip>
      )}
      {isRoster && overlay?.flags?.spaminator && <Chip tone="red">{i18next.t("curation-desk.marks.spaminator")}</Chip>}
      {row.is_gray && <Chip tone="gray">{i18next.t("curation-desk.marks.grayed")}</Chip>}
      {isRoster && (overlay?.notes_count ?? 0) > 0 && (
        <Chip tone="gray">
          <UilCommentAltNotes className="size-3.5" aria-hidden />
          {overlay?.notes_count}
        </Chip>
      )}
      {late && <Chip tone="amber">{i18next.t("curation-desk.marks.late")}</Chip>}
      {resurfaced && <Chip tone="amber">{i18next.t("curation-desk.marks.snooze-ended")}</Chip>}
      {belowCursor && !chronological && <Chip tone="gray">{i18next.t("curation-desk.marks.below-cursor")}</Chip>}
      {row.author_trailed_at && (
        <Chip tone="gray" title={i18next.t("curation-desk.marks.author-trailed-tooltip")}>
          {i18next.t("curation-desk.marks.author-trailed", { when: dateToRelative(row.author_trailed_at) })}
        </Chip>
      )}
      {payoutValue != null && (
        <Chip tone="gray">
          {i18next.t("curation-desk.marks.payout", {
            amount: payoutValue.toFixed(2),
            votes: row.votes ?? 0,
          })}
          {payoutEstimated ? ` ${i18next.t("curation-desk.marks.estimated")}` : ""}
        </Chip>
      )}
      {row.is_declined && <Chip tone="gray">{i18next.t("curation-desk.marks.declined")}</Chip>}
      <RecommendBadge
        count={row.recommend_count}
        networks={row.unique_recommenders}
        noMeta={row.reco_no_meta_count}
        showCollapse={isRoster}
      />
    </div>
  );
});
