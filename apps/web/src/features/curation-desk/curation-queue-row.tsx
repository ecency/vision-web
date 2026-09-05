"use client";

import React, { memo } from "react";
import clsx from "clsx";
import i18next from "i18next";
import Link from "next/link";
import { proxifyImageSrc } from "@ecency/render-helper";
import { isOnAbuseList } from "@ecency/sdk";
import {
  UilBell,
  UilCheck,
  UilCommentAltNotes,
  UilExclamationTriangle,
  UilExternalLinkAlt,
  UilThumbsUp,
  UilTimes,
} from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { UserAvatar } from "@/features/shared/user-avatar";
import { ProfilePopover } from "@/features/shared/profile-popover";
import { EcencySourceBadge } from "@/features/shared/ecency-source-badge";
import type { Entry } from "@/entities";
import { dateToRelative } from "@/utils";
import { Chip, CurationMarkBadges } from "./curation-mark-badges";
import { CurationRecommendBtn } from "./curation-recommend-btn";
import { CurationWindowBadge } from "./curation-window-badge";
import { useCurationTicker } from "./curation-ticker";
import { computeWindow, parseChainDate } from "./curation-window";
import type { DeskRow, RowSection } from "./types";

export interface RowActions {
  onSelect: (row: DeskRow) => void;
  onOpen: (row: DeskRow) => void;
  onVote: (row: DeskRow) => void;
  onReviewed: (row: DeskRow) => void;
  onSnooze: (row: DeskRow) => void;
  onFlag: (row: DeskRow) => void;
  onNote: (row: DeskRow) => void;
  onClearMark: (row: DeskRow) => void;
}

interface Props extends RowActions {
  row: DeskRow;
  isActive: boolean;
  isRoster: boolean;
  isTrial: boolean;
  username: string | undefined;
  recommendationsEnabled: boolean;
  section: RowSection;
  late: boolean;
  resurfaced: boolean;
  belowCursor: boolean;
  reviewedByCursor: boolean;
  chronological: boolean;
}

function utcHm(created: string): string {
  const ms = parseChainDate(created);
  if (ms == null) return "";
  return new Date(ms).toISOString().slice(11, 16);
}

function accountAgeDays(authorCreated: string | null | undefined, now: number): number | null {
  const ms = parseChainDate(authorCreated);
  if (ms == null) return null;
  return Math.floor((now - ms) / 86_400_000);
}

function formatAge(days: number): string {
  if (days >= 365) return i18next.t("curation-desk.row.age-years", { count: Math.floor(days / 365) });
  if (days >= 30) return i18next.t("curation-desk.row.age-months", { count: Math.floor(days / 30) });
  return i18next.t("curation-desk.row.age-days", { count: days });
}

function appLabel(app: string | null): string {
  if (!app) return "";
  return app.split("/")[0].replace(/-.*$/, "");
}

/** Signals line (roster only). A null value renders "n/a", never zeros. */
function Signals({ row }: { row: DeskRow }) {
  const signals = row.overlay?.signals;
  if (!signals) {
    return <span className="text-xs text-gray-500">{i18next.t("curation-desk.signals.na")}</span>;
  }
  const formulaic = typeof signals.formulaic === "number" ? Math.round(signals.formulaic * (signals.formulaic <= 1 ? 100 : 1)) : null;
  const images = signals.images;
  const replies = signals.engagement?.replies_per_day;
  const style = signals.style;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {formulaic != null ? (
        <Chip
          tone={formulaic > 80 ? "red" : formulaic >= 50 ? "amber" : "gray"}
          title={i18next.t("curation-desk.signals.formulaic-tooltip")}
        >
          {i18next.t("curation-desk.signals.formulaic", { pct: formulaic })}
        </Chip>
      ) : (
        <Chip tone="gray">{i18next.t("curation-desk.signals.formulaic-na")}</Chip>
      )}
      {images && typeof images.total === "number" ? (
        <Chip tone="gray">{i18next.t("curation-desk.signals.images", { hive: images.on_hive ?? 0, total: images.total })}</Chip>
      ) : null}
      {typeof replies === "number" ? (
        <Chip tone="gray">{i18next.t("curation-desk.signals.replies", { rate: replies.toFixed(1) })}</Chip>
      ) : (
        <Chip tone="gray">{i18next.t("curation-desk.signals.replies-na")}</Chip>
      )}
      {style?.alert && (
        <Chip tone="amber" title={i18next.t("curation-desk.signals.style-tooltip")}>
          <UilExclamationTriangle className="size-3.5" aria-hidden />
          {i18next.t("curation-desk.signals.style", {
            sigma: typeof style.sigma === "number" ? style.sigma.toFixed(1) : "",
            sample: style.sample ?? "",
          })}
        </Chip>
      )}
    </div>
  );
}

/**
 * Compact desk row (about 72 px on desktop, a card on mobile). Memoized on
 * booleans; the window badge is its own memo child on the shared ticker so a
 * countdown never re-renders the row. Heavy controls (vote slider, votes,
 * payout, renderer) live in the quick view only.
 */
export const CurationQueueRow = memo(function CurationQueueRow(props: Props) {
  const {
    row,
    isActive,
    isRoster,
    isTrial,
    username,
    recommendationsEnabled,
    section,
    late,
    resurfaced,
    belowCursor,
    reviewedByCursor,
    chronological,
    onSelect,
    onOpen,
    onVote,
    onReviewed,
    onSnooze,
    onFlag,
    onNote,
    onClearMark,
  } = props;
  const now = useCurationTicker();
  const overlay = row.overlay;
  const teamMark = overlay?.team_mark ?? null;
  const curated = row.state === 1;
  const trailSent = !!row.trailed_by && !row.trailed_by.confirmed;
  const flagged = teamMark === "flagged";
  const reviewed = teamMark === "reviewed" || (reviewedByCursor && !late && !resurfaced);
  const window = computeWindow(row.created, row.payout_at, now);
  const locked = window.kind === "locked";
  const voteHidden = locked && window.voteHidden;
  const voteDimmed = locked || !!row.is_declined;
  const isOwnPost = username === row.author;
  const age = accountAgeDays(row.author_created, now);
  const titleId = `curation-row-title-${row.post_id}`;
  const descId = `curation-row-desc-${row.post_id}`;
  const title = row.title?.trim() || i18next.t("curation-desk.row.untitled", { author: row.author });
  const href = `/${row.community ?? row.tags?.[0] ?? "hive"}/@${row.author}/${row.permlink}`;
  const thumb = row.first_image ? proxifyImageSrc(row.first_image, 200, 0, "match") : null;
  const collapsed = curated && !isActive;
  const entryStub = { author: row.author, permlink: row.permlink } as unknown as Entry;

  return (
    <article
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-current={isActive ? "true" : undefined}
      data-post-id={row.post_id}
      data-section={section}
      tabIndex={isActive ? 0 : -1}
      onClick={() => onSelect(row)}
      onDoubleClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(row);
      }}
      className={clsx(
        "group relative flex gap-3 border-b border-[--border-color] px-3 py-2 md:min-h-[72px] outline-none",
        "hover:bg-gray-50 dark:hover:bg-dark-default/60 focus-visible:ring-2 focus-visible:ring-blue-dark-sky",
        isActive && "bg-blue-duck-egg/30 dark:bg-blue-dark-grey/40",
        reviewed && !curated && "opacity-60",
        belowCursor && !late && !resurfaced && "opacity-50",
        curated && "border-l-4 border-l-green-500 opacity-70",
        trailSent && !curated && "border-l-4 border-l-amber-400",
        flagged && "border-l-4 border-l-red-500",
        collapsed && "md:min-h-0 py-1"
      )}
    >
      <span id={descId} className="sr-only">
        {i18next.t("curation-desk.row.describe", {
          author: row.author,
          words: row.word_count ?? 0,
          window: window.kind,
        })}
      </span>

      <div className="flex flex-col items-start gap-1 w-[4.5rem] shrink-0 text-xs text-gray-600 dark:text-gray-400">
        <time dateTime={row.created} className="font-mono">
          <span className="hidden md:inline">{utcHm(row.created)}</span>
          <span className="md:hidden">{dateToRelative(row.created)}</span>
        </time>
        {!collapsed && <CurationWindowBadge created={row.created} payoutAt={row.payout_at} />}
      </div>

      {!collapsed && (
        <div className="hidden sm:block size-16 shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-dark-default">
          {thumb && (
            <img src={thumb} alt="" loading="lazy" decoding="async" className="size-16 object-cover" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 id={titleId} className={clsx("font-semibold leading-tight text-sm md:text-base", !collapsed && "line-clamp-2")}>
            <Link href={href} className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {title}
            </Link>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
          <span
            role="presentation"
            className="inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <UserAvatar username={row.author} size="xsmall" className="size-4 rounded-full" />
            <span className="[&_.profile-popover-author]:inline">
              <ProfilePopover entry={entryStub} />
            </span>
          </span>
          {row.rep != null && <span>{i18next.t("curation-desk.row.rep", { rep: row.rep })}</span>}
          {age != null && (
            <span className={clsx(age < 30 && "text-amber-600 dark:text-amber-400")}>{formatAge(age)}</span>
          )}
          {row.is_new_author && (
            <Chip tone="green">{i18next.t("curation-desk.row.new-author", { n: row.author_post_count ?? 1 })}</Chip>
          )}
          {isRoster && isOnAbuseList(overlay?.flags) && (
            <Chip tone="red">{i18next.t("curation-desk.marks.abuse-list")}</Chip>
          )}
          <span className="inline-flex items-center gap-1">
            {row.is_ecency ? (
              <EcencySourceBadge app={row.app} size={12} />
            ) : (
              <span className="rounded bg-gray-100 dark:bg-dark-default px-1">{appLabel(row.app) || i18next.t("curation-desk.row.app-unknown")}</span>
            )}
            <span>{row.community_title ?? row.community ?? row.tags?.[0] ?? i18next.t("curation-desk.row.no-community")}</span>
          </span>
          {row.word_count != null && <span>{i18next.t("curation-desk.row.words", { count: row.word_count })}</span>}
          {row.edit_count > 0 && <Chip tone="gray">{i18next.t("curation-desk.row.edited")}</Chip>}
        </div>

        {!collapsed && isRoster && <Signals row={row} />}

        {!collapsed && (
          <CurationMarkBadges
            row={row}
            isRoster={isRoster}
            reviewedByCursor={reviewedByCursor}
            late={late}
            resurfaced={resurfaced}
            belowCursor={belowCursor}
            chronological={chronological}
          />
        )}
      </div>

      <div
        role="toolbar"
        aria-label={i18next.t("curation-desk.row.actions")}
        className={clsx(
          "flex flex-col md:flex-row items-end md:items-center gap-0.5 shrink-0",
          "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
          isActive && "md:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {!voteHidden && (
          <Button
            size="xs"
            appearance="gray-link"
            className={clsx("!rounded-lg", voteDimmed && "opacity-50")}
            aria-label={i18next.t("curation-desk.actions.vote")}
            title={
              locked
                ? i18next.t("curation-desk.window.locked-tooltip", { pct: window.scalePct })
                : row.is_declined
                  ? i18next.t("curation-desk.marks.declined")
                  : i18next.t("curation-desk.actions.vote-key")
            }
            onClick={() => onVote(row)}
            icon={<UilThumbsUp />}
          />
        )}
        {isRoster && (
          <>
            {teamMark ? (
              <Button
                size="xs"
                appearance="gray-link"
                className="!rounded-lg"
                aria-label={i18next.t("curation-desk.actions.clear-mark")}
                title={i18next.t("curation-desk.actions.clear-mark")}
                onClick={() => onClearMark(row)}
                icon={<UilTimes />}
              />
            ) : (
              <Button
                size="xs"
                appearance="gray-link"
                className="!rounded-lg"
                aria-label={i18next.t("curation-desk.actions.reviewed")}
                title={i18next.t("curation-desk.actions.reviewed-key")}
                onClick={() => onReviewed(row)}
                icon={<UilCheck />}
              />
            )}
            <Button
              size="xs"
              appearance="gray-link"
              className="!rounded-lg"
              aria-label={i18next.t("curation-desk.actions.snooze")}
              title={i18next.t("curation-desk.actions.snooze-key")}
              onClick={() => onSnooze(row)}
              icon={<UilBell />}
            />
            <Button
              size="xs"
              appearance="gray-link"
              className="!rounded-lg"
              aria-label={i18next.t("curation-desk.actions.flag")}
              title={i18next.t("curation-desk.actions.flag-key")}
              onClick={() => onFlag(row)}
              icon={<UilExclamationTriangle />}
            />
            <Button
              size="xs"
              appearance="gray-link"
              className="!rounded-lg"
              aria-label={i18next.t("curation-desk.actions.note")}
              title={i18next.t(isTrial ? "curation-desk.actions.note-trial" : "curation-desk.actions.note-key")}
              onClick={() => onNote(row)}
              icon={<UilCommentAltNotes />}
            />
          </>
        )}
        {recommendationsEnabled && !locked && !isOwnPost && (
          <CurationRecommendBtn author={row.author} permlink={row.permlink} compact />
        )}
        <Button
          size="xs"
          appearance="gray-link"
          className="!rounded-lg"
          href={href}
          target="_blank"
          rel="noopener"
          aria-label={i18next.t("curation-desk.actions.open")}
          title={i18next.t("curation-desk.actions.open-key")}
          icon={<UilExternalLinkAlt />}
        />
      </div>
    </article>
  );
});
