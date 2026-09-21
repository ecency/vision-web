"use client";

import React, { memo, useRef, useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import Link from "next/link";
import { proxifyImageSrc } from "@ecency/render-helper";
import { isOnAbuseList } from "@ecency/sdk";
import { UilEye, UilExclamationTriangle, UilGlobe } from "@tooni/iconscout-unicons-react";
import { useGlobalStore } from "@/core/global-store";
import { UserAvatar } from "@/features/shared/user-avatar";
import { ProfilePopover } from "@/features/shared/profile-popover";
import { TimeLabel } from "@/features/shared/time-label";
import { EcencySourceBadge } from "@/features/shared/ecency-source-badge";
import type { Entry } from "@/entities";
import { Chip } from "./curation-chip";
import { appLabel } from "./curation-queue-display";
import { CurationMarkBadges } from "./curation-mark-badges";
import { CurationRowActions } from "./curation-row-actions";
import { CurationWindowBadge } from "./curation-window-badge";
import { useCurationTicker } from "./curation-ticker";
import { rowNeedsNsfwCover } from "./curation-row-nsfw";
import { parseChainDate } from "./curation-window";
import type { DeskRow, RowSection, WindowState } from "./types";

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
  /**
   * The device's PRIMARY pointer is coarse, so this is a phone or a tablet
   * rather than a machine with a mouse. Two uses, both device-level on purpose:
   * it words the Read control (a finger cannot hover the tooltip every other
   * control here relies on), and it decides a click that arrived with no
   * pointer information at all. Which branch a real click takes is decided per
   * interaction, not from here.
   */
  coarsePointer: boolean;
  section: RowSection;
  late: boolean;
  resurfaced: boolean;
  belowCursor: boolean;
  reviewedByCursor: boolean;
  chronological: boolean;
  /** Window state from the parent's clock; the row never reads the ticker. */
  windowKind: WindowState["kind"];
  locked: boolean;
  voteHidden: boolean;
  scalePct: number;
}

const NEW_ACCOUNT_DAYS = 30;

function accountAgeDays(authorCreated: string | null | undefined, now: number): number | null {
  const ms = parseChainDate(authorCreated);
  if (ms == null) return null;
  return Math.floor((now - ms) / 86_400_000);
}

/**
 * Warns only while the author's account is under 30 days old. The plain age of
 * an established account is not shown here: the author hover card already
 * carries reputation and the joined date, so the byline would just repeat it.
 * Its own memo child on the shared clock, so the day counter never re-renders
 * the row around it.
 */
export const NewAccountChip = memo(function NewAccountChip({ authorCreated }: { authorCreated: string | null | undefined }) {
  const now = useCurationTicker();
  const days = accountAgeDays(authorCreated, now);
  if (days == null || days >= NEW_ACCOUNT_DAYS) return null;
  return <Chip tone="amber">{i18next.t("curation-desk.row.new-account")}</Chip>;
});

/**
 * Which client published the post: the Ecency mark when the desk's own
 * is_ecency says so, a neutral globe for anything else. A glyph rather than a
 * word, because the app name was 25 words down a page of 25 rows and the one
 * worth spotting at a glance is Ecency's. The name moves to the tooltip.
 */
function RowSourceMark({ row, className }: { row: DeskRow; className?: string }) {
  if (row.is_ecency) {
    return (
      <EcencySourceBadge
        app={row.app}
        isEcency
        className={clsx("size-3.5 !text-blue-dark-sky dark:!text-blue-dark-sky-010", className)}
      />
    );
  }
  const app = appLabel(row.app);
  // The glyph is the only content here, so the name goes on the wrapper and the
  // icon stays decorative, the way every other icon in the desk is written.
  const label = app
    ? i18next.t("curation-desk.row.source-app", { app })
    : i18next.t("curation-desk.row.app-unknown");
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={clsx("inline-flex text-gray-500 dark:text-gray-400", className)}
    >
      <UilGlobe className="size-3.5" aria-hidden />
    </span>
  );
}

/** Signals line (roster only). A null value renders "n/a", never zeros. */
function Signals({ row }: { row: DeskRow }) {
  const signals = row.overlay?.signals;
  if (!signals) {
    return <span className="text-xs text-gray-500">{i18next.t("curation-desk.signals.na")}</span>;
  }
  // The signals service emits whole percents (0-100), never a 0-1 fraction. The old
  // normaliser multiplied anything <= 1 by 100, so a post scoring 1 rendered as
  // "Formulaic 100%" in red, putting the reddest chip on the desk on a clean post.
  const formulaic = typeof signals.formulaic === "number" ? Math.round(signals.formulaic) : null;
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
        <Chip tone="gray">{i18next.t("curation-desk.signals.images", { hive: images.hive_hosted ?? 0, total: images.total })}</Chip>
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
            sample: style.n ?? "",
          })}
        </Chip>
      )}
    </div>
  );
}

/**
 * A spaced desk row with actions below the content on smaller screens. Memoized on
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
    coarsePointer,
    section,
    late,
    resurfaced,
    belowCursor,
    reviewedByCursor,
    chronological,
    windowKind,
    locked,
    voteHidden,
    scalePct,
    onSelect,
    onOpen,
    onVote,
    onReviewed,
    onSnooze,
    onFlag,
    onNote,
    onClearMark,
  } = props;
  const overlay = row.overlay;
  const teamMark = overlay?.team_mark ?? null;
  const curated = row.state === 1;
  const trailSent = !!row.trailed_by && !row.trailed_by.confirmed;
  const flagged = teamMark === "flagged";
  const reviewed = teamMark === "reviewed" || (reviewedByCursor && !late && !resurfaced);
  const voteDimmed = locked || !!row.is_declined;
  const isOwnPost = username === row.author;
  const titleId = `curation-row-title-${row.post_id}`;
  const descId = `curation-row-desc-${row.post_id}`;
  const title = row.title?.trim() || i18next.t("curation-desk.row.untitled", { author: row.author });
  const href = `/@${row.author}/${row.permlink}`;
  const thumb = row.first_image ? proxifyImageSrc(row.first_image, 200, 0, "match") : null;
  const [revealed, setRevealed] = useState(false);
  const globalNsfw = useGlobalStore((s) => s.nsfw);
  const covered = !revealed && !globalNsfw && rowNeedsNsfwCover(row);
  // Which device made THIS click. A media query cannot answer that: `pointer:
  // coarse` describes the primary pointer, so on a touchscreen laptop or a
  // tablet with a mouse attached a finger tap would be read as a mouse click
  // and open nothing. Recorded on pointerdown rather than read off the click,
  // because `click` only became a PointerEvent recently in Firefox and Safari
  // while `pointerdown` has been one since Safari 13.
  const pointerKind = useRef("");
  const openThisClick = () => {
    const kind = pointerKind.current;
    pointerKind.current = "";
    // A click from no pointer at all (a script, an old browser that sends no
    // pointerdown) carries "", which is why this tests the two kinds it wants
    // instead of "not a mouse".
    if (kind === "touch" || kind === "pen") return true;
    return kind === "" && coarsePointer;
  };
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
      onPointerDown={(e) => (pointerKind.current = e.pointerType ?? "")}
      onClick={() => (openThisClick() ? onOpen(row) : onSelect(row))}
      onDoubleClick={() => onOpen(row)}
      className={clsx(
        "group relative flex flex-wrap gap-x-3 gap-y-2 border-b border-[--border-color] px-4 py-4 sm:px-5 outline-none",
        "hover:bg-gray-100 dark:hover:bg-dark-default/60 focus-visible:ring-2 focus-visible:ring-blue-dark-sky",
        isActive && "bg-blue-duck-egg/30 dark:bg-blue-dark-grey/40",
        reviewed && !curated && "opacity-60",
        belowCursor && !late && !resurfaced && "opacity-50",
        curated && "border-l-4 border-l-green opacity-70",
        trailSent && !curated && "border-l-4 border-l-warning-default",
        flagged && "border-l-4 border-l-red",
        collapsed && "md:min-h-0 py-1"
      )}
    >
      <span id={descId} className="sr-only">
        {i18next.t("curation-desk.row.describe", {
          author: row.author,
          words: row.word_count ?? 0,
          window: windowKind,
        })}
      </span>

      <div className="flex w-full shrink-0 items-center gap-2 text-xs text-gray-600 dark:text-gray-400 sm:w-36 sm:flex-col sm:items-start">
        {/* The app-wide label: relative ("31m") with the full local date as the
            tooltip. The row used to print a bare UTC clock from md up, which
            curators read as local time; UTC stays on the labelled cursor and
            hand-off strings, where the shared number is the point. */}
        <time dateTime={row.created}>
          <TimeLabel created={row.created} className="font-mono" />
        </time>
        {!collapsed && <CurationWindowBadge created={row.created} payoutAt={row.payout_at} className="max-w-full !whitespace-normal" />}
      </div>

      {!collapsed && (
        <div
          className={clsx(
            "relative size-12 sm:size-16 shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-dark-default",
            // Phones get a smaller cover, but only when there is one: an empty grey
            // box would just push the title over for nothing.
            !thumb && "hidden sm:block"
          )}
        >
          {thumb && (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className={clsx("size-full object-cover", covered && "blur-md scale-125")}
            />
          )}
          {/* Covering, not removing: the score is a signal and a classifier fires on figure
              drawing, medical posts and swimwear, so a wrong call costs the curator one
              click rather than costing the author their curation. A curator who has turned
              NSFW on globally is not second-guessed. */}
          {thumb && covered && (
            <button
              type="button"
              aria-label={i18next.t("curation-desk.row.reveal-nsfw")}
              title={i18next.t("curation-desk.row.reveal-nsfw")}
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"
            >
              <UilEye className="size-4" aria-hidden />
            </button>
          )}
          {/* Source reads before the text does. From sm up the box renders even without
              a cover image, so an image-less Ecency post keeps the mark; the byline
              carries it instead wherever this box is not rendered (image-less rows below
              sm, and collapsed rows). Inset rather than overhanging: the parent clips
              to round the image. */}
          {/* Painted after the reveal overlay, so while covered it would otherwise intercept
              taps in its own 20px corner. Those taps do not merely miss the reveal: they
              reach the article handler, which OPENS the post and shows the image full size,
              the exact opposite of what covering it is for. Kept visible, made inert. */}
          <span
            className={clsx(
              "absolute bottom-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-white/90 dark:bg-dark-200/90",
              covered && "pointer-events-none"
            )}
          >
            <RowSourceMark row={row} />
          </span>
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
          <span role="presentation" className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <UserAvatar username={row.author} size="xsmall" className="size-4 rounded-full" />
            <span className="[&_.profile-popover-author]:inline">
              <ProfilePopover entry={entryStub} />
            </span>
          </span>
          <NewAccountChip authorCreated={row.author_created} />
          {row.is_new_author && (
            <Chip tone="green">{i18next.t("curation-desk.row.new-author", { n: row.author_post_count ?? 1 })}</Chip>
          )}
          {isRoster && isOnAbuseList(overlay?.flags) && (
            <Chip tone="red">{i18next.t("curation-desk.marks.abuse-list")}</Chip>
          )}
          <span className="inline-flex items-center gap-1">
            {/* The thumbnail owns the mark wherever the thumbnail box exists. */}
            <RowSourceMark
              row={row}
              className={collapsed ? undefined : thumb ? "hidden" : "sm:hidden"}
            />
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

      <CurationRowActions
        author={row.author}
        permlink={row.permlink}
        isRoster={isRoster}
        isTrial={isTrial}
        recommendationsEnabled={recommendationsEnabled}
        coarsePointer={coarsePointer}
        marked={!!teamMark}
        voteHidden={voteHidden}
        voteDimmed={voteDimmed}
        voteTitle={
          locked
            ? i18next.t("curation-desk.window.locked-tooltip", { pct: scalePct })
            : row.is_declined
              ? i18next.t("curation-desk.marks.declined")
              : i18next.t("curation-desk.actions.vote-key")
        }
        recommendHidden={locked || isOwnPost}
        href={href}
        className="lg:w-auto lg:pl-0 lg:self-start"
        onOpen={() => onOpen(row)}
        onVote={() => onVote(row)}
        onReviewed={() => onReviewed(row)}
        onClearMark={() => onClearMark(row)}
        onSnooze={() => onSnooze(row)}
        onFlag={() => onFlag(row)}
        onNote={() => onNote(row)}
      />
    </article>
  );
});
