"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { proxifyImageSrc } from "@ecency/render-helper";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCurationPostQueryOptions,
  getCurationRecommendationsInfiniteQueryOptions,
  type CurationFlagReason,
  type CurationMyMark,
  type CurationRecommendationItem,
  type CurationRecommendationsSort,
  type CurationRosterFeedParams,
  type CurationRosterRow,
} from "@ecency/sdk";
import { Button } from "@ui/button";
import { UilEyeSlash } from "@tooni/iconscout-unicons-react";
import { EcencyConfigManager } from "@/config";
import { error as errorToast, success as successToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { useBottomPagination } from "@/core/hooks/use-bottom-pagination";
import { DetectBottom } from "@/features/shared/detect-bottom";
import { UserAvatar } from "@/features/shared/user-avatar";
import { dateToRelative } from "@/utils";
import { Chip } from "./curation-chip";
import { DAY_MS } from "./consts";
import { FlagDialog, NoteDialog, SnoozeDialog } from "./curation-action-dialogs";
import { RecommendBadge } from "./curation-mark-badges";
import { CurationQuickView } from "./curation-quick-view";
import { RecommenderChip } from "./curation-recommender";
import { type CurationRecommendHandle } from "./curation-recommend-btn";
import { CurationRowActions } from "./curation-row-actions";
import { useCurationTicker } from "./curation-ticker";
import { CurationWindowBadge } from "./curation-window-badge";
import { computeWindow, parseChainDate } from "./curation-window";
import {
  rosterFeedPrefix,
  recoDismissMutationKey,
  rosterFeedQueryOptions,
  useClearMark,
  useCoarsePointer,
  useCurationDismissReco,
  useCurationMark,
  useMyMarks,
  useViewerRole,
} from "./hooks";
import type { DeskRow, ViewerRole } from "./types";

/** How long a post stays open, and so how far back the marks index must reach. */
const OPEN_POST_MS = 7 * DAY_MS;

/** How often the curator list reads again, so a post a colleague handled leaves it. */
const ROSTER_REFRESH_MS = 60_000;

/** How recent a dismissal made in this tab must be to count as the reason its post left the list. */
const OWN_DISMISS_MS = 60_000;

/**
 * A roster row of `view=recommended`, which also carries what route 4 draws.
 * Optional, because a desk older than those fields answers without them.
 */
type RosterRecommendationRow = CurationRosterRow &
  Partial<Pick<CurationRecommendationItem, "recommenders" | "reasons" | "no_meta_count">>;

/**
 * A list row. `recommendersUnknown` marks a roster row from a desk too old to
 * send its recommenders: the viewer's own recommendation cannot be told apart
 * from none, so Recommend is withheld rather than offered as a duplicate.
 */
type ListItem = CurationRecommendationItem & { recommendersUnknown?: boolean };

function fromRosterRow(row: RosterRecommendationRow): ListItem {
  return {
    recommendersUnknown: row.recommenders === undefined,
    author: row.author,
    permlink: row.permlink,
    title: row.title,
    created: row.created,
    first_image: row.first_image ?? null,
    recommend_count: row.recommend_count,
    unique_recommenders: row.unique_recommenders,
    no_meta_count: row.no_meta_count ?? row.reco_no_meta_count ?? 0,
    reasons: row.reasons ?? {},
    recommenders: row.recommenders ?? [],
  };
}

/** Route 4 items carry no post_id, so the pair is the identity here. */
const keyOf = (post: { author: string; permlink: string }) => `${post.author}/${post.permlink}`;

/** Everything the mark and vote actions need to address a post. */
type PostRef = Pick<DeskRow, "author" | "permlink" | "title">;

/**
 * The drawer takes a desk row and route 4 answers a much thinner item, so it
 * opens on this stub and route 5 fills the rest in (rep, words, community,
 * payout) as soon as it answers. post_id is the one field with no answer at
 * all: the recommendations route does not carry it, and nothing reached from
 * here needs it, since a mark is addressed by author and permlink.
 */
function stubRow(item: CurationRecommendationItem): DeskRow {
  return {
    post_id: 0,
    author: item.author,
    permlink: item.permlink,
    title: item.title,
    created: item.created,
    app: null,
    is_ecency: false,
    community: null,
    community_title: null,
    tags: [],
    rep: null,
    is_new_author: false,
    author_post_count: null,
    word_count: null,
    image_count: 0,
    first_image: item.first_image ?? null,
    summary: null,
    edited_at: null,
    edit_count: 0,
    votes: null,
    pending_payout: null,
    payout_at: null,
    state: 0,
    trailed_by: null,
    voted_by: [],
    author_trailed_at: null,
    recommend_count: item.recommend_count,
    unique_recommenders: item.unique_recommenders,
    reco_no_meta_count: item.no_meta_count,
  };
}

function reasonsTooltip(item: CurationRecommendationItem): string {
  return Object.entries(item.reasons ?? {})
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([reason, n]) => `${i18next.t(`curation-desk.reasons.${reason}`)}: ${n}`)
    .join(", ");
}

interface RowProps {
  item: ListItem;
  canDismiss: boolean;
  isRoster: boolean;
  isTrial: boolean;
  username: string | undefined;
  recommendationsEnabled: boolean;
  coarsePointer: boolean;
  /** This viewer's own mark on the post, all route 4 can know about marks. */
  myMark: CurationMyMark | undefined;
  /** The marks index has not answered yet, so `myMark` proves nothing. */
  markStateUnknown: boolean;
  onOpen: (item: CurationRecommendationItem) => void;
  onVote: (item: CurationRecommendationItem) => void;
  onReviewed: (post: PostRef) => void;
  onClearMark: (post: PostRef) => void;
  onSnooze: (post: PostRef) => void;
  onFlag: (post: PostRef) => void;
  onNote: (post: PostRef) => void;
}

function RecommendationRow({
  item,
  canDismiss,
  isRoster,
  isTrial,
  username,
  recommendationsEnabled,
  coarsePointer,
  myMark,
  markStateUnknown,
  onOpen,
  onVote,
  onReviewed,
  onClearMark,
  onSnooze,
  onFlag,
  onNote,
}: RowProps) {
  const dismiss = useCurationDismissReco();
  const mine = item.recommenders.some((r) => r.username === username);
  // Same cover the queue row draws, from the same column, at the same proxy
  // width. Nothing is rendered without one: an empty grey box would only push
  // the title over.
  const thumb = item.first_image ? proxifyImageSrc(item.first_image, 200, 0, "match") : null;
  // Route 4 carries no payout_at, so the window is read from `created` alone:
  // it lists open posts, whose payout is seven days after that. Subscribed
  // here rather than in the view, the way the badge does it, so the 60 s tick
  // re-renders one row.
  const now = useCurationTicker();
  const windowState = computeWindow(item.created, null, now);
  const locked = windowState.kind === "locked";
  // The other end of the same story: the route serves open posts, but the
  // shared clock carries a row across its payout while the tab sits open, and
  // past that point a vote earns nothing and a recommendation points curators
  // at a post they cannot earn on either.
  const paid = windowState.kind === "paid";

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2 text-sm">
      {thumb && (
        <a
          href={`/@${item.author}/${item.permlink}`}
          tabIndex={-1}
          aria-hidden
          className="size-12 sm:size-14 shrink-0 overflow-hidden rounded-lg bg-gray-200 dark:bg-dark-default"
        >
          <img src={thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        </a>
      )}
      <div className="min-w-0 flex-1">
        <a href={`/@${item.author}/${item.permlink}`} className="font-semibold hover:underline line-clamp-2">
          {item.title || i18next.t("curation-desk.row.untitled", { author: item.author })}
        </a>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mt-0.5">
          <UserAvatar username={item.author} size="xsmall" className="size-4 rounded-full" />
          <span>@{item.author}</span>
          <span>{dateToRelative(item.created)}</span>
          {/* The list is a place to vote from now, so it says what a vote here
              would still earn. */}
          <CurationWindowBadge created={item.created} payoutAt={null} />
          <span title={reasonsTooltip(item)}>
            <RecommendBadge
              count={item.recommend_count}
              networks={item.unique_recommenders}
              noMeta={item.no_meta_count}
              recommenders={item.recommenders}
              showCollapse={isRoster}
            />
          </span>
          {/* The team overlay is not on this route; the viewer's own mark is,
              through their marks list, and it is the one this row can clear. */}
          {myMark && (
            <Chip
              tone={myMark.state === "flagged" ? "red" : myMark.state === "snoozed" ? "amber" : "gray"}
              title={i18next.t("curation-desk.marks.your-mark")}
            >
              {i18next.t(`curation-desk.mark-states.${myMark.state}`)}
            </Chip>
          )}
        </div>
        <ul className="flex flex-wrap gap-1 mt-1 text-[11px] text-gray-500">
          {item.recommenders.slice(0, 6).map((r) => (
            <li key={r.username} className="inline-flex items-center gap-1">
              @{r.username}
              {r.reason && <Chip tone="blue">{i18next.t(`curation-desk.reasons.${r.reason}`)}</Chip>}
              <RecommenderChip trusted={r.trusted} />
            </li>
          ))}
        </ul>
      </div>
      <CurationRowActions
        author={item.author}
        permlink={item.permlink}
        isRoster={isRoster}
        isTrial={isTrial}
        recommendationsEnabled={recommendationsEnabled}
        coarsePointer={coarsePointer}
        marked={!!myMark}
        markStateUnknown={markStateUnknown}
        voteHidden={paid || (locked && windowState.voteHidden)}
        voteDimmed={locked}
        voteTitle={
          locked
            ? i18next.t("curation-desk.window.locked-tooltip", { pct: windowState.scalePct })
            : i18next.t("curation-desk.actions.vote-key")
        }
        recommendHidden={locked || paid || username === item.author || !!item.recommendersUnknown}
        alreadyRecommended={mine}
        href={`/@${item.author}/${item.permlink}`}
        // Below lg the controls take their own line under the post, the way
        // the queue row lays them out.
        className="lg:w-auto lg:self-start"
        onOpen={() => onOpen(item)}
        onVote={() => onVote(item)}
        onReviewed={() => onReviewed(item)}
        onClearMark={() => onClearMark(item)}
        onSnooze={() => onSnooze(item)}
        onFlag={() => onFlag(item)}
        onNote={() => onNote(item)}
      >
        {canDismiss && (
          <Button
            size="xs"
            appearance="gray-link"
            className="!rounded-lg"
            disabled={dismiss.isPending}
            aria-label={i18next.t("curation-desk.reco.dismiss")}
            title={i18next.t("curation-desk.reco.dismiss")}
            onClick={() =>
              dismiss.mutate(
                { author: item.author, permlink: item.permlink, action: "dismiss" },
                { onError: (e) => errorToast(...formatError(e)) }
              )
            }
            icon={<UilEyeSlash />}
          >
            {coarsePointer ? i18next.t("curation-desk.reco.dismiss") : undefined}
          </Button>
        )}
      </CurationRowActions>
    </li>
  );
}

type Dialog =
  | { kind: "none" }
  | { kind: "snooze"; post: PostRef }
  | { kind: "flag"; post: PostRef }
  | { kind: "note"; post: PostRef };

/**
 * List of open posts with active recommendations, with the desk's row actions
 * on every row: the queue is not the only place a curator reads and handles a
 * post, and this list is where the network points them.
 *
 * Curators read the roster feed's recommended view, which leaves out what the
 * team already handled (curated, reviewed, snoozed or flagged). Route 4 is
 * public and edge cached, so it cannot know team marks; everyone else reads it.
 */
export function CurationRecommendationsView() {
  const viewer: ViewerRole = useViewerRole();
  const recommendationsEnabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.recommendations.enabled
  );
  const coarsePointer = useCoarsePointer();
  const [sort, setSort] = useState<CurationRecommendationsSort>("unique");
  const rosterParams = useMemo<CurationRosterFeedParams>(
    () => ({ view: "recommended", sort, hide_curated: true, hide_reviewed: true, hide_snoozed: true }),
    [sort]
  );
  // The list is part of what the sub-flag turns off, so a disabled build asks
  // for nothing. Neither list is asked for before the role is known, or a
  // curator would fetch the public list first and then their own.
  const publicQuery = useInfiniteQuery({
    ...getCurationRecommendationsInfiniteQueryOptions({ sort }),
    enabled: recommendationsEnabled && !viewer.isLoading && !viewer.isRoster,
  });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openKeyRef = useRef(openKey);
  openKeyRef.current = openKey;
  const rosterQuery = useInfiniteQuery({
    ...rosterFeedQueryOptions(viewer.username, rosterParams),
    enabled: recommendationsEnabled && viewer.isRoster && !!viewer.username,
    // Marks made here leave the list at once through the mark's cache update;
    // a colleague's mark or a trail vote arrives on the next read. It reads
    // only while one page is loaded and no drawer is open: an interval
    // refetches every loaded page, and a post leaving mid-read would take the
    // drawer, and a reply being written, with it.
    refetchInterval: (query) =>
      openKey || (query.state.data?.pages.length ?? 0) > 1 ? false : ROSTER_REFRESH_MS,
  });
  const query = viewer.isRoster ? rosterQuery : publicQuery;
  const items = useMemo<ListItem[]>(
    () =>
      viewer.isRoster
        ? (rosterQuery.data?.pages.flatMap((p) => p.items) ?? []).map((row) =>
            fromRosterRow(row as RosterRecommendationRow)
          )
        : (publicQuery.data?.pages.flatMap((p) => p.items) ?? []),
    [viewer.isRoster, rosterQuery.data, publicQuery.data]
  );
  const listLoading = viewer.isLoading || query.isLoading;
  const loadMore = useBottomPagination({
    data: query.data,
    dataUpdatedAt: query.dataUpdatedAt,
    hasNextPage: query.hasNextPage,
    isFetching: query.isFetching,
    fetchNextPage: query.fetchNextPage,
  });

  // Marks are per curator and route 4 carries no overlay, so what this tab can
  // say is what the viewer themselves marked. The mark mutations invalidate
  // this list, which is what moves a row's badge after an action here.
  const myMarks = useMyMarks(undefined, viewer.isRoster);
  const marks = useMemo(() => {
    const byPost = new Map<string, CurationMyMark>();
    for (const page of myMarks.data?.pages ?? []) for (const mark of page.items) byPost.set(keyOf(mark), mark);
    return byPost;
  }, [myMarks.data]);
  // A page holds the 50 most recent marks, and a missing entry is read as "not
  // marked", so one page is not an answer for a curator who marks more than
  // that in a week. It is bounded all the same: this route serves open posts,
  // so a mark on one of them was made inside the payout window, and the index
  // is complete as soon as the oldest loaded mark predates it. Never walks a
  // curator's whole history, and stops on a timestamp it cannot read rather
  // than paging forever.
  const marksFetchNextPage = myMarks.fetchNextPage;
  const marksPages = myMarks.data?.pages;
  useEffect(() => {
    if (!myMarks.hasNextPage || myMarks.isFetchingNextPage || myMarks.isError) return;
    const items = marksPages?.[marksPages.length - 1]?.items ?? [];
    const oldest = parseChainDate(items[items.length - 1]?.updated_at);
    if (oldest != null && oldest > Date.now() - OPEN_POST_MS) void marksFetchNextPage();
  }, [marksPages, myMarks.hasNextPage, myMarks.isFetchingNextPage, myMarks.isError, marksFetchNextPage]);
  // Until the index has answered, a row cannot tell an unmarked post from one
  // this curator already handled, so the control that would write over a mark
  // waits rather than guessing. Every other mark replaces the curator's own by
  // design, exactly as it does in the queue.
  const markStateUnknown = viewer.isRoster && (!myMarks.isSuccess || myMarks.isFetchingNextPage);

  // The post whose Vote control asked for the slider, not a bare flag: the
  // drawer only presses it once that post's entry resolves, and a curator who
  // steps to the next post meanwhile must not have their vote land there.
  const [voteFor, setVoteFor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const recommendRef = useRef<CurationRecommendHandle | null>(null);

  const queryClient = useQueryClient();
  // A dismissal made in this tab, from the row or from the drawer, is the one
  // departure the curator chose here, so it is never held. Read off the
  // mutation cache, where both dismiss controls leave their request, under
  // this account's key alone: the cache outlives an account switch.
  const dismissedHere = useCallback(
    (key: string) =>
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: recoDismissMutationKey(viewer.username), exact: true })
        .some((mutation) => {
          const vars = mutation.state.variables as { author?: string; permlink?: string; action?: string } | undefined;
          return (
            mutation.state.status !== "error" &&
            vars?.action === "dismiss" &&
            `${vars.author}/${vars.permlink}` === key &&
            Date.now() - mutation.state.submittedAt < OWN_DISMISS_MS
          );
        }),
    [queryClient, viewer.username]
  );

  // The drawer follows the loaded list, with one exception: a post that leaves
  // it while open for a reason the curator did not choose here (a refresh that
  // was already running when the drawer opened, an invalidation) stays in the
  // drawer, so a reply being written is not unmounted under them. Where it sat
  // is kept too, so Next lands on the post that took its place. Derived during
  // render: an effect would unmount the drawer for one commit first.
  const openIndex = openKey ? items.findIndex((item) => keyOf(item) === openKey) : -1;
  const lastOpenRef = useRef<{ key: string; item: ListItem; index: number } | null>(null);
  if (openKey && openIndex >= 0) lastOpenRef.current = { key: openKey, item: items[openIndex], index: openIndex };
  const held =
    openKey && openIndex < 0 && lastOpenRef.current?.key === openKey && !dismissedHere(openKey)
      ? lastOpenRef.current
      : null;
  const openItem = openIndex >= 0 ? items[openIndex] : (held?.item ?? null);
  // A selection with nothing to show (its post was dismissed here, or it never
  // loaded) is cleared, or it would keep the list refresh paused for good.
  useEffect(() => {
    if (openKey && !openItem) {
      setOpenKey(null);
      setVoteFor(null);
    }
  }, [openKey, openItem]);
  // The drawer reads route 5 for the recommender list under the same key, so
  // this upgrade costs no second request.
  const { data: post } = useQuery({
    ...getCurationPostQueryOptions(openItem?.author ?? "", openItem?.permlink ?? ""),
    enabled: !!openItem,
  });
  const drawerRow = useMemo<DeskRow | null>(() => {
    if (!openItem) return null;
    const stub = stubRow(openItem);
    return post && keyOf(post) === keyOf(openItem) ? { ...stub, ...post } : stub;
  }, [openItem, post]);
  const neighbour = useMemo(() => {
    const at = openIndex >= 0 ? openIndex + 1 : (held?.index ?? -1);
    const next = at >= 0 ? items[at] : undefined;
    return next ? stubRow(next) : null;
  }, [items, openIndex, held]);

  const move = useCallback(
    (delta: number) => {
      // From a held post, the post that took its place is next and the one
      // above it is previous.
      const at = openIndex >= 0 ? openIndex + delta : held ? held.index + (delta > 0 ? 0 : -1) : -1;
      const next = at >= 0 ? items[at] : undefined;
      if (!next) return;
      setVoteFor(null);
      setOpenKey(keyOf(next));
    },
    [items, openIndex, held]
  );

  const onOpen = useCallback((item: CurationRecommendationItem) => {
    setVoteFor(null);
    setOpenKey(keyOf(item));
  }, []);
  const onVote = useCallback((item: CurationRecommendationItem) => {
    const key = keyOf(item);
    setOpenKey(key);
    // The slider lives inside the drawer and only mounts once the entry query
    // resolves, so the drawer consumes this then.
    setVoteFor(key);
  }, []);
  const onClose = useCallback(() => {
    setOpenKey(null);
    setVoteFor(null);
  }, []);

  const mark = useCurationMark();
  const clearMark = useClearMark();
  const doMark = useCallback(
    async (
      post: PostRef,
      input: { state: "reviewed" | "snoozed" | "flagged" | "noted"; reason?: string; note?: string; snooze_until?: string },
      message: string
    ) => {
      // A team mark takes the post off a curator's list, and a drawer on a row
      // that left the list closes. So a drawer open on the marked post walks on
      // to the next one on the click, the way the queue does, and comes back if
      // the mark fails. A note is not a team mark and keeps the post listed.
      const key = keyOf(post);
      const at = items.findIndex((item) => keyOf(item) === key);
      const successor =
        at >= 0
          ? (items[at + 1] ?? items[at - 1])
          : held?.key === key
            ? (items[held.index] ?? items[held.index - 1])
            : undefined;
      const advancedTo = successor ? keyOf(successor) : null;
      const moved = input.state !== "noted" && openKeyRef.current === key;
      if (moved) {
        setVoteFor(null);
        setOpenKey(advancedTo);
      }
      try {
        // No lane: a mark made here was not earned in a queue, and the hand-off
        // reads the lane off the mark to say which one it was.
        await mark.mutateAsync({ row: post, ...input });
        successToast(message);
      } catch (e) {
        // Back to the post only while the drawer still sits where the advance
        // left it: a curator who closed it or moved on since keeps their place.
        if (moved && openKeyRef.current === advancedTo) setOpenKey(key);
        errorToast(...formatError(e));
      }
    },
    [mark, items, held]
  );

  const onReviewed = useCallback(
    (post: PostRef) => {
      if (!viewer.isRoster) return;
      void doMark(post, { state: "reviewed" }, i18next.t("curation-desk.live.reviewed", { title: post.title }));
    },
    [viewer.isRoster, doMark]
  );
  const onSaveNote = useCallback(
    (post: PostRef, note: string) => {
      if (!viewer.isRoster || !note) return;
      void doMark(post, { state: "noted", note }, i18next.t("curation-desk.live.noted"));
    },
    [viewer.isRoster, doMark]
  );
  const onClearMark = useCallback(
    async (post: PostRef) => {
      if (!viewer.isRoster) return;
      try {
        await clearMark.mutateAsync({ author: post.author, permlink: post.permlink });
        // A mark took the row out of the filtered queues, and this tab holds no
        // position to put it back at: the cache updater only reinserts against
        // a `restoreAt` the queue captured before its own mark. So the loaded
        // queues are marked stale instead and fetch an authoritative order,
        // rather than staying without a row that belongs in them again.
        queryClient.invalidateQueries({ queryKey: rosterFeedPrefix(viewer.username) });
        successToast(i18next.t("curation-desk.live.cleared"));
      } catch (e) {
        errorToast(...formatError(e));
      }
    },
    [viewer.isRoster, viewer.username, clearMark, queryClient]
  );
  const onSnooze = useCallback((post: PostRef) => viewer.isRoster && setDialog({ kind: "snooze", post }), [viewer.isRoster]);
  const onFlag = useCallback((post: PostRef) => viewer.isRoster && setDialog({ kind: "flag", post }), [viewer.isRoster]);
  const onNote = useCallback((post: PostRef) => viewer.isRoster && setDialog({ kind: "note", post }), [viewer.isRoster]);

  return (
    <div className="reading-surface rounded-2xl overflow-hidden">
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
      {listLoading && <p className="p-4 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>}
      {query.isError && <p className="p-4 text-sm text-red-030 dark:text-red-light-020" role="alert">{i18next.t("curation-desk.list.error")}</p>}
      {!listLoading && items.length === 0 && !query.isError && (
        <p className="p-6 text-sm text-gray-500 text-center">{i18next.t("curation-desk.reco-view.empty")}</p>
      )}
      <ul className="divide-y divide-[--border-color]" aria-label={i18next.t("curation-desk.reco-view.title")}>
        {items.map((item) => (
          <RecommendationRow
            key={keyOf(item)}
            item={item}
            // The dismiss route answers a trial curator with a 403.
            canDismiss={viewer.isRoster && !viewer.isTrial}
            isRoster={viewer.isRoster}
            isTrial={viewer.isTrial}
            username={viewer.username}
            recommendationsEnabled={recommendationsEnabled}
            coarsePointer={coarsePointer}
            myMark={marks.get(keyOf(item))}
            markStateUnknown={markStateUnknown}
            onOpen={onOpen}
            onVote={onVote}
            onReviewed={onReviewed}
            onClearMark={onClearMark}
            onSnooze={onSnooze}
            onFlag={onFlag}
            onNote={onNote}
          />
        ))}
      </ul>
      {query.hasNextPage && <DetectBottom onBottom={loadMore} />}

      <CurationQuickView
        row={drawerRow}
        neighbour={neighbour}
        viewer={viewer}
        recommendationsEnabled={recommendationsEnabled}
        voteOnOpen={!!openKey && voteFor === openKey}
        onVoteHandled={() => setVoteFor(null)}
        onClose={onClose}
        onPrev={() => move(-1)}
        onNext={() => move(1)}
        onReviewed={onReviewed}
        onSnooze={onSnooze}
        onFlag={onFlag}
        onNote={onNote}
        onSaveNote={onSaveNote}
        recommendRef={recommendRef}
      />

      {dialog.kind === "snooze" && (
        <SnoozeDialog
          title={dialog.post.title}
          onHide={() => setDialog({ kind: "none" })}
          onPick={(until, preset) => {
            setDialog({ kind: "none" });
            void doMark(
              dialog.post,
              { state: "snoozed", snooze_until: until },
              i18next.t("curation-desk.live.snoozed", { preset: i18next.t(`curation-desk.snooze.preset-${preset}`) })
            );
          }}
        />
      )}
      {dialog.kind === "flag" && (
        <FlagDialog
          title={dialog.post.title}
          onHide={() => setDialog({ kind: "none" })}
          onPick={(reason: CurationFlagReason, note) => {
            setDialog({ kind: "none" });
            void doMark(dialog.post, { state: "flagged", reason, note: note || undefined }, i18next.t("curation-desk.live.flagged"));
          }}
        />
      )}
      {dialog.kind === "note" && (
        <NoteDialog
          title={dialog.post.title}
          onHide={() => setDialog({ kind: "none" })}
          onSave={(note) => {
            setDialog({ kind: "none" });
            onSaveNote(dialog.post, note);
          }}
        />
      )}
    </div>
  );
}
