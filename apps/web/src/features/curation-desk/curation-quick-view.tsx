"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import i18next from "i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UilAngleUp,
  UilAngleDown,
  UilArrowRight,
  UilBell,
  UilCheck,
  UilCommentAlt,
  UilCommentAltNotes,
  UilExclamationTriangle,
  UilExternalLinkAlt,
  UilGift,
  UilTimes,
} from "@tooni/iconscout-unicons-react";
import { getAccountPostsQueryOptions, getCurationPostQueryOptions, type CurationRecommender } from "@ecency/sdk";
import { Button } from "@ui/button";
import { ModalSidebar } from "@ui/modal/modal-sidebar";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { PostContentRenderer } from "@/features/shared/post-content-renderer";
import { EntryVoteBtn } from "@/features/shared/entry-vote-btn";
import { EntryVotes } from "@/features/shared/entry-votes";
import { EntryPayout } from "@/features/shared/entry-payout";
import { EntryTipBtn } from "@/features/shared/entry-tip-btn";
import { LoginRequired } from "@/features/shared/login-required";
import { UserAvatar } from "@/features/shared/user-avatar";
import { dateToRelative } from "@/utils";
import type { Entry } from "@/entities";
import { error as errorToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { EcencyConfigManager } from "@/config";
import { QUICK_VIEW_PREFETCH_DEBOUNCE_MS } from "./consts";
import { Chip } from "./curation-chip";
import { appLabel } from "./curation-queue-display";
import { CurationRecommendBtn, type CurationRecommendHandle } from "./curation-recommend-btn";
import { RecommenderChip } from "./curation-recommender";
import { CurationReplyBox } from "./curation-reply-box";
import { useCurationTicker } from "./curation-ticker";
import { CurationWindowBadge } from "./curation-window-badge";
import { computeWindow, formatUtcHm } from "./curation-window";
import { useCurationDismissReco } from "./hooks";
import type { DeskRow, ViewerRole } from "./types";

const HIVE_IMAGE_HOSTS = ["images.ecency.com", "images.hive.blog", "files.peakd.com", "img.inleo.io", "cdn.liketu.com", "img.leopedia.io"];

interface Props {
  row: DeskRow | null;
  neighbour: DeskRow | null;
  viewer: ViewerRole;
  recommendationsEnabled: boolean;
  /** The `v` key asked for the vote slider; consumed once the entry arrives. */
  voteOnOpen?: boolean;
  recommendOnOpen?: boolean;
  /** The `c` key: open the reply box once the entry is here. */
  commentOnOpen?: boolean;
  /** The `p` key: open the Points transfer once the entry is here. */
  tipOnOpen?: boolean;
  onRecommendHandled?: () => void;
  onVoteHandled?: () => void;
  onCommentHandled?: () => void;
  onTipHandled?: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReviewed: (row: DeskRow) => void;
  onSnooze: (row: DeskRow) => void;
  onFlag: (row: DeskRow) => void;
  onNote: (row: DeskRow) => void;
  onSaveNote: (row: DeskRow, note: string) => void;
  /**
   * Set to the row key while this drawer's reply box is open, so the queue view
   * can still tell that the curator was mid-reply after the drawer is gone.
   */
  replyOpenFor?: React.MutableRefObject<string | null>;
  recommendRef: React.Ref<CurationRecommendHandle>;
}

function imagesOnHive(entries: Entry[] | undefined): { hive: number; total: number } {
  let hive = 0;
  let total = 0;
  for (const e of entries ?? []) {
    const images: string[] = Array.isArray(e.json_metadata?.image) ? e.json_metadata.image : [];
    for (const url of images) {
      total++;
      if (HIVE_IMAGE_HOSTS.some((h) => url.includes(h))) hive++;
    }
  }
  return { hive, total };
}

function cadencePerDay(entries: Entry[] | undefined): number | null {
  if (!entries || entries.length < 2) return null;
  const times = entries.map((e) => Date.parse(`${e.created}Z`)).filter(Number.isFinite);
  if (times.length < 2) return null;
  const span = Math.max(...times) - Math.min(...times);
  if (span <= 0) return null;
  return (times.length / (span / 86_400_000));
}

/**
 * Presses a button that lives inside the drawer once it is actually there.
 * The drawer's surface mounts a frame after `show` flips, so with a cached
 * entry the first render already has the entry and none of the buttons yet:
 * a press on that render hit nothing and the request was consumed all the
 * same. The wait is bounded, and the request is handed back either way, so a
 * button that never mounts (signed out, no entry) cannot pin it.
 */
function usePressWhenMounted(
  active: boolean,
  find: () => HTMLElement | null | undefined,
  onHandled: (() => void) | undefined
) {
  const handledRef = useRef(onHandled);
  handledRef.current = onHandled;
  useEffect(() => {
    if (!active) return;
    let tries = 0;
    let frame = 0;
    const attempt = () => {
      const button = find();
      if (button) {
        button.click();
        handledRef.current?.();
      } else if (tries++ < 120) {
        frame = requestAnimationFrame(attempt);
      } else {
        handledRef.current?.();
      }
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [active, find]);
}

/**
 * Right drawer with the full post. One entry fetch on expand through the
 * shared entry cache; the immediate neighbour is prefetched only while the
 * drawer is open, after a 300 ms debounce, so a curator holding j on a closed
 * drawer never fires a burst of bridge.get_post calls.
 */
export function CurationQuickView({
  row,
  neighbour,
  viewer,
  recommendationsEnabled,
  voteOnOpen,
  recommendOnOpen,
  commentOnOpen,
  tipOnOpen,
  onRecommendHandled,
  onVoteHandled,
  onCommentHandled,
  onTipHandled,
  onClose,
  onPrev,
  onNext,
  onReviewed,
  onSnooze,
  onFlag,
  onNote,
  onSaveNote,
  replyOpenFor,
  recommendRef,
}: Props) {
  const queryClient = useQueryClient();
  const author = row?.author ?? "";
  const permlink = row?.permlink ?? "";
  const open = !!row;

  const { data: entry, isLoading, refetch: refetchEntry } = useQuery({
    ...EcencyEntriesCacheManagement.getEntryQueryByPath(author, permlink),
    enabled: open && !!author && !!permlink,
  });
  // The top voters come with a single-post read (top_votes). A feed or waves
  // row may have seeded this cache without them; read the open post once more
  // in that case. Once per row: a post read that still has none (no votes,
  // or a node that answered v1 with an empty list) is not retried.
  const topVotesReadFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${author}/${permlink}`;
    if (!open || !entry || entry.top_votes !== undefined || topVotesReadFor.current === key) return;
    topVotesReadFor.current = key;
    void refetchEntry();
  }, [open, entry, author, permlink, refetchEntry]);
  const { data: post } = useQuery({
    ...getCurationPostQueryOptions(author, permlink),
    enabled: open && !!author && !!permlink,
  });
  const { data: authorPosts } = useQuery({
    ...getAccountPostsQueryOptions(author, "posts", "", "", 5, "", open && !!author),
  });

  // Neighbour prefetch: drawer open only, one row, debounced.
  useEffect(() => {
    if (!open || !neighbour) return;
    const handle = setTimeout(() => {
      void queryClient.prefetchQuery(
        EcencyEntriesCacheManagement.getEntryQueryByPath(neighbour.author, neighbour.permlink)
      );
    }, QUICK_VIEW_PREFETCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [open, neighbour?.author, neighbour?.permlink, queryClient]);

  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open, author, permlink]);

  // The `v` key: the slider only exists once the entry query resolved, so the
  // press waits for the entry instead of a fixed delay that missed a slow fetch.
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const findVote = useCallback(() => drawerRef.current?.querySelector<HTMLElement>('.entry-vote-btn[role="button"]'), []);
  usePressWhenMounted(open && !!voteOnOpen && !!entry, findVote, onVoteHandled);

  // The `c` and `p` keys wait for the entry the same way, then press the
  // button itself: both buttons sit behind the sign-in prompt, so a signed-out
  // reader gets that prompt from the key too.
  // The post the box is open for, so a cached next post never renders one
  // frame of the previous post's open box (and its autofocus) before a reset.
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const replyOpen = replyFor != null && replyFor === `${author}/${permlink}`;
  const setReplyOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const key = `${author}/${permlink}`;
      setReplyFor((current) => {
        const isOpen = current === key;
        const open = typeof next === "function" ? next(isOpen) : next;
        return open ? key : null;
      });
    },
    [author, permlink]
  );
  // No cleanup on unmount: the queue view reads this AFTER the drawer has gone,
  // which is exactly the moment a cleanup would have wiped it. Clearing is
  // row-keyed instead, so closing the box for this post cannot clear another's.
  useEffect(() => {
    if (!replyOpenFor) return;
    const key = `${author}/${permlink}`;
    if (replyOpen) replyOpenFor.current = key;
    else if (replyOpenFor.current === key) replyOpenFor.current = null;
  }, [replyOpen, author, permlink, replyOpenFor]);

  const commentRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const findComment = useCallback(() => commentRef.current, []);
  usePressWhenMounted(open && !!commentOnOpen && !!entry, findComment, onCommentHandled);
  const tipRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const findTip = useCallback(() => tipRef.current, []);
  usePressWhenMounted(open && !!tipOnOpen && !!entry, findTip, onTipHandled);

  // The `x` key: the recommend button mounts with the drawer, so the trigger
  // waits for the mounted handle (a few frames at most) instead of a fixed delay.
  const recommendHandledRef = useRef(onRecommendHandled);
  recommendHandledRef.current = onRecommendHandled;
  useEffect(() => {
    if (!open || !recommendOnOpen || !row) return;
    let tries = 0;
    let frame = 0;
    const attempt = () => {
      const handle = (recommendRef as React.RefObject<CurationRecommendHandle | null>).current;
      if (handle) {
        handle.trigger();
        recommendHandledRef.current?.();
      } else if (tries++ < 120) {
        frame = requestAnimationFrame(attempt);
      } else {
        recommendHandledRef.current?.();
      }
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [open, recommendOnOpen, row, recommendRef]);

  const now = useCurationTicker();
  const windowState = useMemo(
    () => (row ? computeWindow(row.created, row.payout_at, now) : null),
    [row, now]
  );

  const dismiss = useCurationDismissReco();
  const [noteDraft, setNoteDraft] = useState("");
  useEffect(() => setNoteDraft(""), [author, permlink]);

  const snapshot = useMemo(() => ({ images: imagesOnHive(authorPosts), cadence: cadencePerDay(authorPosts) }), [authorPosts]);
  const mine: CurationRecommender | undefined = post?.recommenders?.find((r) => r.username === viewer.username);
  const topVoters = useMemo(
    () =>
      // The strongest voters ride along with the entry: v2 `top_votes`
      // (requested on single-post reads), or derived from a v1 list by the
      // SDK normalizer. No voter list is paged for five names.
      (entry?.top_votes ?? [])
        .slice()
        .sort((a, b) => Number(b.rshares ?? 0) - Number(a.rshares ?? 0))
        .slice(0, 5),
    [entry?.top_votes]
  );

  if (!row) return null;
  const overlay = row.overlay;
  const isOwn = viewer.username === row.author;
  // A vote in these windows earns little or nothing, so pointing curators at
  // the post is not worth an on-chain op.
  const recommendClosed = windowState?.kind === "locked" || windowState?.kind === "paid";
  const recoDismissed = !!overlay?.reco_dismissed_at;
  // The dismiss route is mod and curator only; a trial curator gets a 403.
  const canDismissReco = viewer.isRoster && !viewer.isTrial;
  const title = row.title?.trim() || i18next.t("curation-desk.row.untitled", { author: row.author });
  const href = `/@${row.author}/${row.permlink}`;
  // The tip dialog sends Points where the instance has them and HIVE elsewhere;
  // the label says which.
  const tipLabel = EcencyConfigManager.CONFIG.visionFeatures.points.enabled
    ? "curation-desk.actions.points"
    : "curation-desk.actions.tip";

  return (
    <ModalSidebar show={open} setShow={(v) => !v && onClose()} placement="right" className="min-w-[90%] md:min-w-[44rem]">
      <div ref={drawerRef} data-curation-drawer className="flex flex-col h-full" aria-label={i18next.t("curation-desk.quick-view.aria")}>
        <div className="flex items-start gap-2 p-3 border-b border-[--border-color]">
          <Button size="xs" appearance="gray-link" className="!rounded-lg" aria-label={i18next.t("curation-desk.quick-view.prev")} title={i18next.t("curation-desk.quick-view.prev")} onClick={onPrev} icon={<UilAngleUp />} />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-tight line-clamp-2">{title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mt-1">
              <UserAvatar username={row.author} size="xsmall" className="size-4 rounded-full" />
              <span>@{row.author}</span>
              {row.rep != null && <span>{i18next.t("curation-desk.row.rep", { rep: row.rep })}</span>}
              {entry?.author_reputation == null && row.author_post_count != null && (
                <span>{i18next.t("curation-desk.quick-view.posts", { count: row.author_post_count })}</span>
              )}
              {/* The list says the source with a glyph and a tooltip, which a touch
                  device cannot hover and a keyboard cannot focus. This is the
                  non-hover path to the same fact, one keystroke away on every row. */}
              <Chip tone="gray">
                {row.is_ecency
                  ? i18next.t("curation-desk.row.source-ecency")
                  : appLabel(row.app) || i18next.t("curation-desk.row.app-unknown")}
              </Chip>
              <span>{row.community_title ?? row.community ?? row.tags?.[0] ?? ""}</span>
              {row.word_count != null && <span>{i18next.t("curation-desk.row.words", { count: row.word_count })}</span>}
              <span>{dateToRelative(row.created)}</span>
              <CurationWindowBadge created={row.created} payoutAt={row.payout_at} />
            </div>
            {viewer.isRoster && overlay?.signals && (
              <p className="text-[11px] text-gray-500 mt-1">{i18next.t("curation-desk.quick-view.signals-hint")}</p>
            )}
          </div>
          <Button size="xs" appearance="gray-link" className="!rounded-lg" aria-label={i18next.t("curation-desk.quick-view.next")} title={i18next.t("curation-desk.quick-view.next")} onClick={onNext} icon={<UilAngleDown />} />
          <Button ref={closeRef as React.Ref<HTMLButtonElement | HTMLAnchorElement>} size="xs" appearance="gray-link" className="!rounded-lg" aria-label={i18next.t("g.close")} onClick={onClose} icon={<UilTimes />} />
        </div>

        {/* One scroller on a phone: the two panes used to be grid rows inside an
            `overflow-hidden` box, so they split the drawer's height between them
            and the post was read through a half-height window with the sidebar
            clipped below it. From lg they are columns again, each scrolling on
            its own. */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:grid lg:grid-cols-[1fr_16rem] lg:overflow-hidden">
          <div className="p-4 lg:min-h-0 lg:overflow-y-auto">
            {isLoading && <div className="animate-pulse h-40 rounded-xl bg-gray-200 dark:bg-dark-default" />}
            {!isLoading && !entry && <p className="text-sm text-gray-500">{i18next.t("curation-desk.quick-view.not-found")}</p>}
            {entry && (
              <>
                <PostContentRenderer
                  className="entry-body markdown-view"
                  value={entry.body}
                  images={Array.isArray(entry.json_metadata?.image) ? entry.json_metadata.image : undefined}
                />
                {/* `relative`: the vote slider anchors to this row rather than to
                    its own 18 px chevron, so it opens below every control here
                    instead of on top of Comment and Points. */}
                <div className="relative flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-[--border-color]">
                  <EntryVoteBtn entry={entry} isPostSlider />
                  <EntryVotes entry={entry} />
                  <EntryPayout entry={entry} />
                  <div className="ml-auto flex items-center gap-1">
                    {/* The reply editor draws nothing for a signed-out reader, so the
                        button asks them to sign in instead of toggling an empty box. */}
                    <LoginRequired promptOnAnon>
                      <Button
                        ref={commentRef as React.Ref<HTMLButtonElement | HTMLAnchorElement>}
                        size="sm"
                        appearance="gray-link"
                        className="!rounded-lg"
                        aria-label={i18next.t("curation-desk.actions.comment-key")}
                        aria-pressed={replyOpen}
                        title="c"
                        onClick={() => setReplyOpen((v) => !v)}
                        icon={<UilCommentAlt />}
                      >
                        {i18next.t("curation-desk.actions.comment")}
                      </Button>
                    </LoginRequired>
                    <EntryTipBtn
                      entry={entry}
                      trigger={(openTip) => (
                        <Button
                          ref={tipRef as React.Ref<HTMLButtonElement | HTMLAnchorElement>}
                          size="sm"
                          appearance="gray-link"
                          className="!rounded-lg"
                          aria-label={i18next.t(`${tipLabel}-key`)}
                          title="p"
                          onClick={openTip}
                          icon={<UilGift />}
                        >
                          {i18next.t(tipLabel)}
                        </Button>
                      )}
                    />
                  </div>
                </div>
                <CurationReplyBox
                  key={`${entry.author}/${entry.permlink}`}
                  entry={entry}
                  open={replyOpen}
                  onClose={() => setReplyOpen(false)}
                />
              </>
            )}
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l lg:min-h-0 lg:overflow-y-auto border-[--border-color] p-3 text-xs flex flex-col gap-4">
            <section>
              <h3 className="font-semibold mb-1">{i18next.t("curation-desk.quick-view.author-snapshot")}</h3>
              <ul className="flex flex-col gap-0.5 text-gray-600 dark:text-gray-400">
                {snapshot.cadence != null && <li>{i18next.t("curation-desk.quick-view.cadence", { rate: snapshot.cadence.toFixed(1) })}</li>}
                {snapshot.images.total > 0 && (
                  <li>{i18next.t("curation-desk.quick-view.images-on-hive", { hive: snapshot.images.hive, total: snapshot.images.total })}</li>
                )}
                {row.author_trailed_at && <li>{i18next.t("curation-desk.marks.author-trailed", { when: dateToRelative(row.author_trailed_at) })}</li>}
                {(authorPosts ?? []).slice(0, 5).map((p) => (
                  <li key={p.permlink} className="truncate">
                    <a href={`/@${p.author}/${p.permlink}`} target="_blank" rel="noopener" className="hover:underline">
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1">{i18next.t("curation-desk.quick-view.rewards")}</h3>
              <ul className="flex flex-col gap-0.5 text-gray-600 dark:text-gray-400">
                <li>
                  {i18next.t("curation-desk.marks.payout", {
                    amount: (row.pending_payout ?? row.pending_payout_est ?? 0).toFixed(2),
                    votes: row.votes ?? entry?.stats?.total_votes ?? 0,
                  })}
                </li>
                {row.rshares_total != null && row.rshares_total > 0 && row.rshares_after_24h != null && (
                  <li>{i18next.t("curation-desk.quick-view.late-rshares", { pct: Math.round((100 * row.rshares_after_24h) / row.rshares_total) })}</li>
                )}
                {topVoters.map((v) => (
                  <li key={v.voter}>@{v.voter}</li>
                ))}
              </ul>
            </section>

            {viewer.isRoster && (
              <section>
                <h3 className="font-semibold mb-1">{i18next.t("curation-desk.quick-view.team")}</h3>
                <ul className="flex flex-col gap-1">
                  {(overlay?.marks ?? []).map((m) => (
                    <li key={`${m.curator}-${m.state}`} className="flex flex-col">
                      <span>
                        <Chip tone={m.state === "flagged" ? "red" : m.state === "snoozed" ? "amber" : "gray"}>
                          {i18next.t(`curation-desk.mark-states.${m.state}`)}
                        </Chip>{" "}
                        @{m.curator} · {dateToRelative(m.updated_at)}
                      </span>
                      {m.reason && (!viewer.isTrial || m.curator === viewer.username) && (
                        <span className="text-gray-500">{i18next.t(`curation-desk.flag-reasons.${m.reason}`, { defaultValue: m.reason })}</span>
                      )}
                      {m.note && (!viewer.isTrial || m.curator === viewer.username) && (
                        <span className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{m.note}</span>
                      )}
                    </li>
                  ))}
                  {(overlay?.marks?.length ?? 0) === 0 && <li className="text-gray-500">{i18next.t("curation-desk.quick-view.no-marks")}</li>}
                </ul>
                <div className="mt-2 flex flex-col gap-1">
                  <textarea
                    className="w-full rounded-lg border border-[--border-color] bg-transparent p-2 text-xs"
                    rows={2}
                    maxLength={500}
                    value={noteDraft}
                    placeholder={i18next.t("curation-desk.note.placeholder")}
                    aria-label={i18next.t("curation-desk.note.placeholder")}
                    onChange={(e) => setNoteDraft(e.target.value)}
                  />
                  <Button
                    size="xs"
                    className="self-end !rounded-lg"
                    disabled={!noteDraft.trim()}
                    aria-label={i18next.t("curation-desk.note.save")}
                    onClick={() => {
                      onSaveNote(row, noteDraft.trim());
                      setNoteDraft("");
                    }}
                  >
                    {i18next.t("curation-desk.note.save")}
                  </Button>
                </div>
              </section>
            )}

            <section>
              <h3 className="font-semibold mb-1">
                {i18next.t("curation-desk.quick-view.recommenders", { count: post?.recommend_count ?? row.recommend_count })}
              </h3>
              {post && post.recommenders.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {post.recommenders.map((r) => (
                    <li key={r.username} className="flex items-center gap-1">
                      <UserAvatar username={r.username} size="xsmall" className="size-4 rounded-full" />
                      <span>@{r.username}</span>
                      {r.rep != null && <span className="text-gray-500">({r.rep})</span>}
                      {r.reason && <Chip tone="blue">{i18next.t(`curation-desk.reasons.${r.reason}`)}</Chip>}
                      {r.is_self && <Chip tone="gray">{i18next.t("curation-desk.reco.author")}</Chip>}
                      <RecommenderChip trusted={r.trusted} />
                      <span className="text-gray-500 ml-auto">{dateToRelative(r.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">{i18next.t("curation-desk.quick-view.no-recommenders")}</p>
              )}
              {viewer.isRoster && post && post.recommend_count > post.unique_recommenders && (
                <p className="text-gray-500 mt-1">
                  {i18next.t("curation-desk.reco.collapse", { accounts: post.recommend_count, networks: post.unique_recommenders })}
                </p>
              )}
              {canDismissReco && ((post?.recommend_count ?? 0) > 0 || recoDismissed) && (
                <Button
                  size="xs"
                  appearance="gray-link"
                  className="mt-1 !rounded-lg"
                  disabled={dismiss.isPending}
                  aria-label={i18next.t(recoDismissed ? "curation-desk.reco.restore" : "curation-desk.reco.dismiss")}
                  onClick={() =>
                    dismiss.mutate(
                      { author: row.author, permlink: row.permlink, action: recoDismissed ? "restore" : "dismiss" },
                      { onError: (e) => errorToast(...formatError(e)) }
                    )
                  }
                >
                  {i18next.t(recoDismissed ? "curation-desk.reco.restore" : "curation-desk.reco.dismiss")}
                </Button>
              )}
              {recoDismissed && (
                <p className="text-gray-500 mt-1">
                  {i18next.t("curation-desk.reco.dismissed-at", { time: formatUtcHm(overlay?.reco_dismissed_at) })}
                </p>
              )}
            </section>
          </aside>
        </div>

        {/* Sticky, and split into a worded primary pair and a glyph row. On a
            phone the bar used to be one wrapped line of seven small icon
            buttons at the bottom of a drawer whose panes were clipped, so the
            two controls the queue actually runs on, reviewed and next, were the
            hardest to find. `sticky` because the drawer surface is its own
            scroller: the bar stays on screen whatever the content does. */}
        <div
          role="toolbar"
          aria-label={i18next.t("curation-desk.row.actions")}
          className="sticky bottom-0 z-10 flex flex-col gap-1.5 border-t border-[--border-color] bg-white p-2 dark:bg-dark-700 md:flex-row md:flex-wrap md:items-center md:gap-1"
        >
          <div className="flex items-center gap-2 md:gap-1">
            {viewer.isRoster && (
              <Button
                size="sm"
                className="flex-1 !rounded-lg md:flex-none"
                aria-label={i18next.t("curation-desk.actions.reviewed-key")}
                title="r"
                onClick={() => onReviewed(row)}
                icon={<UilCheck />}
              >
                {i18next.t("curation-desk.actions.reviewed")}
              </Button>
            )}
            {/* Was labelled "Skip", which is the same move down the list but not
                a phrase a curator looks for when they want the next post. */}
            <Button
              size="sm"
              appearance="secondary"
              outline
              className="flex-1 !rounded-lg md:flex-none"
              aria-label={i18next.t("curation-desk.actions.next-key")}
              title="j / s"
              onClick={onNext}
              icon={<UilArrowRight />}
            >
              {i18next.t("curation-desk.actions.next")}
            </Button>
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-1">
            {viewer.isRoster && (
              <>
                <Button size="sm" appearance="gray-link" className="!rounded-lg" aria-label={i18next.t("curation-desk.actions.snooze")} title="z" onClick={() => onSnooze(row)} icon={<UilBell />}>
                  {i18next.t("curation-desk.actions.snooze")}
                </Button>
                <Button size="sm" appearance="gray-link" className="!rounded-lg" aria-label={i18next.t("curation-desk.actions.flag")} title="f" onClick={() => onFlag(row)} icon={<UilExclamationTriangle />}>
                  {i18next.t("curation-desk.actions.flag")}
                </Button>
                <Button size="sm" appearance="gray-link" className="!rounded-lg" aria-label={i18next.t("curation-desk.actions.note")} title="n" onClick={() => onNote(row)} icon={<UilCommentAltNotes />}>
                  {i18next.t("curation-desk.actions.note")}
                </Button>
              </>
            )}
            {recommendationsEnabled && !recommendClosed && (!isOwn || mine?.is_self) && (
              <CurationRecommendBtn ref={recommendRef} author={row.author} permlink={row.permlink} alreadyRecommended={!!mine} />
            )}
            <Button size="sm" appearance="gray-link" className="!rounded-lg ml-auto after:!hidden" href={href} target="_blank" rel="noopener" aria-label={i18next.t("curation-desk.actions.open")} title={i18next.t("curation-desk.actions.open-key")} icon={<UilExternalLinkAlt />}>
              {i18next.t("curation-desk.actions.open")}
            </Button>
          </div>
        </div>
      </div>
    </ModalSidebar>
  );
}
