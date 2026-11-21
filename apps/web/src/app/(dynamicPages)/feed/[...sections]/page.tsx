import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { DEFAULT_OBSERVER } from "@/consts/observer";
import { prefetchGetPostsFeedQuery } from "@/api/queries";
import { FeedLayout, FeedList, TagFeedHeader } from "../_components";
import { isCommunity } from "@/utils";
import React from "react";
import { Metadata, ResolvingMetadata } from "next";
import { redirect } from "next/navigation";
import { generateFeedMetadata, normalizeFeedTag } from "@/app/(dynamicPages)/feed/[...sections]/_helpers";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient, prefetchQuery } from "@/core/react-query";
import {
  stripActiveVotesFromDehydratedState,
  stripActiveVotesFromValue
} from "@/core/react-query/strip-active-votes";
import { getPromotedPostsQuery } from "@ecency/sdk";
import { withSlimEntries } from "@/core/entries/slim-entry";
import { EcencyConfigManager } from "@/config";
import { EntryListContent } from "@/features/shared/entry-list-content";
import { EntryArchivePager } from "@/features/shared/entry-archive-pager";
import {
  cursorToken,
  fetchRankedCursorPage,
  isArchivableTag,
  olderCursorToken,
  parseArchiveCursor
} from "@/features/seo/ranked-archive";
import { Entry } from "@/entities";
import { JsonLd, buildBreadcrumbJsonLd } from "@/features/structured-data";
import { getServerAppBase } from "@/utils/server-app-base";
import defaults from "@/defaults";
import { WavesOnboardingChecklist } from "@/features/waves/components/waves-onboarding-checklist";
import { AdventBanner } from "@/features/advent/advent-banner";

interface Props {
  params: Promise<{ sections: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { sections } = await props.params;
  const { before } = await props.searchParams;
  const [filter = "hot", rawTag = ""] = sections;
  const { tag } = normalizeFeedTag(rawTag);
  const cursor = isArchivableTag(filter, tag) ? parseArchiveCursor(before) : null;
  return generateFeedMetadata(filter, tag, cursor ? cursorToken(cursor) : undefined);
}

// Deliberately NO loading.tsx on this route (nor on any ancestor segment).
// A loading module wraps the page in a Suspense boundary, and because this page
// awaits the feed before returning JSX that boundary streams: six skeleton rows
// in the shell, the cards in hidden <div id="S:n"> chunks revealed only by the
// $RC scripts near the end of the document. Measured on alpha (WebPageTest
// MotoG Power / 4G-slow, 3 runs): LCP 9.07s, Speed Index 6.20s, Lighthouse
// perf 47, 5 hidden segments and 4 swap scripts — the worst route of the set.
// Without the boundary the first cards are plain shell HTML that paints as it
// streams. A <Suspense> around the list would not help either: Fizz outlines
// any completed boundary over 500 bytes once the shell has passed
// progressiveChunkSize (12.8 KB, and the head + navbar alone are ~25 KB), so
// the cards would again ship hidden plus a swap script. The route layout holds
// no boundary either: the thumbnail preload it used to wrap only re-emitted
// links the eager cards already hoist through next/image. Pinned by
// specs/app/feed-page-no-ssr-skeleton.spec.ts and
// specs/app/feed-page-ssr-stream.spec.tsx (#1786).
//
// Trade-offs accepted with no boundary above the cards:
//  - The cache-first loading state went with it. FeedLoading repainted the
//    reader's persisted rows during a client navigation; a route fallback is
//    the only thing React renders in that window, so keeping it meant keeping
//    the boundary. A client navigation now holds the previous page until the
//    RSC response lands, under the app-wide @bprogress bar mounted in
//    client-providers.tsx — so the wait is indicated, just not filled.
//    Rebuilding the repaint outside a boundary is #1789.
//  - Nothing flushes until this page's awaits resolve, so the navbar and
//    sidebar now wait on the feed fetch too. That is the deliberate trade:
//    a shell that paints early and then swaps the cards in seconds later
//    measured worse than one that arrives complete.
//  - Fizz only contains render errors at Suspense boundaries and there is no
//    error.tsx on this chain, so a throw in the SSR render of a card is a
//    full-page 500 (global-error) instead of the skeleton plus a client retry.
//    Neither branch can throw from data: both prefetchInfiniteQuery and the
//    archive's fetchQuery go through withSsrTimeout, which resolves undefined
//    on a rejection, and an empty archive page redirects. What is left is card
//    RENDER: treat every json_metadata reader on the card path (thumbnail
//    lookup, summary, tags, location) as untrusted input. /trending and the
//    other ranked feeds are the protected case — withSlimEntries blanks the
//    body before a card sees it, which starves the markdown tier of the image
//    lookup. The exposed URLs are the ones that skip slimming by design,
//    /feed/comments/@user and /feed/replies/@user, whose cards carry full
//    bodies; the image lookup on that path is guarded separately (#1790).
export default async function FeedPage({ params, searchParams }: Props) {
  const [filter = "hot", rawTag = ""] = (await params).sections;
  const { tag, queryable } = normalizeFeedTag(rawTag);
  const { before } = await searchParams;

  const cookiesStore = await cookies();
  // observer is for filtering muted users/content - always use logged-in user or "ecency".
  // Safe to personalise here (unlike profile/community/entry) because the feed
  // tiers are already marked user-specific in cache-policy.ts, so a logged-in
  // render never shares an edge-cache entry with another user.
  const loggedInUser = cookiesStore.get(ACTIVE_USER_COOKIE_NAME)?.value;
  const observer = loggedInUser || DEFAULT_OBSERVER;

  const basePath = `/${filter}/${tag}`;
  const cursor = queryable && isArchivableTag(filter, tag) ? parseArchiveCursor(before) : null;

  // A plain hashtag's feed carries a follow header, on the live page and on the
  // archive pages behind it alike. Communities have their own card, `my` is the
  // subscribed-communities feed, and the tags hivemind cannot query would only
  // show an empty feed under it.
  const showTagHeader =
    queryable &&
    tag !== "" &&
    tag !== "my" &&
    !isCommunity(tag) &&
    ["trending", "hot", "created"].includes(filter);

  // Cursor archive page: one O(1) fetch of the 20 posts older than the cursor,
  // fully server-rendered (no infinite scroll) with a crawlable pager.
  if (cursor) {
    const { entries, nextCursor } = await fetchRankedCursorPage(filter, tag, cursor, observer);
    if (entries.length === 0) {
      return redirect(basePath); // stale/invalid cursor -> clean first page
    }
    // Static wrapper (NOT FeedLayout): an archive page must not run FeedLayout's
    // live usePostsFeedQuery + 30s "new posts" polling, which would refetch the
    // latest feed and prepend it onto this older-posts view. The route layout
    // still provides the navbar/menu; we only need the list wrapper divs.
    return (
      <HydrationBoundary
        state={stripActiveVotesFromDehydratedState(dehydrate(getQueryClient()), loggedInUser)}
      >
        <div className="entry-list">
          {showTagHeader && <TagFeedHeader tag={tag} hasPosts={entries.length > 0} />}
          <div className="entry-list-body">
            <EntryListContent
              username=""
              loading={false}
              entries={stripActiveVotesFromValue(entries, loggedInUser)}
              sectionParam={filter}
              isPromoted={false}
              showEmptyPlaceholder={false}
            />
          </div>
          <EntryArchivePager
            basePath={basePath}
            olderCursor={nextCursor ? cursorToken(nextCursor) : null}
            showLatest={true}
          />
        </div>
      </HydrationBoundary>
    );
  }

  // Default (page 1): prefetch for hydration; add a crawlable "Older" link into
  // the cursor chain when the first page is full (infinite scroll = JS path).
  // A tag hivemind cannot accept renders the same empty feed whether or not we
  // ask it, so the doomed round trip (and the error it raises) is skipped.
  const [feed, appBase] = await Promise.all([
    queryable ? prefetchGetPostsFeedQuery(filter, tag, 20, observer) : undefined,
    getServerAppBase()
  ]);

  // Only prefetch promoted posts if promotions feature is enabled
  if (EcencyConfigManager.CONFIG.visionFeatures.promotions.enabled) {
    // Promoted rows render the same cards as the feed and are dehydrated into the
    // same payload, so they are slimmed on both sides of this query key.
    await prefetchQuery(withSlimEntries(getPromotedPostsQuery<Entry>()));
  }

  const firstPage = ((feed?.pages?.[0] as Entry[] | undefined) ?? []).filter(Boolean);
  const isTagHub = isArchivableTag(filter, tag);
  // "Older" chain entry for `created` tag hubs only — see olderCursorToken (the
  // SDK re-sorts pages by date, so trending/hot cursors would overlap; the
  // created chain already reaches every post). No pin-shrink here: tag feeds
  // have no pin-at-top semantics, so a short page means the tag really ended.
  const olderCursor = isTagHub && filter === "created" ? olderCursorToken(firstPage) : null;

  // Tag hubs get a BreadcrumbList (desktop SERPs show it in place of the raw URL trail).
  let breadcrumbJsonLd = null;
  if (isTagHub) {
    const base = appBase.replace(/\/+$/, "");
    breadcrumbJsonLd = buildBreadcrumbJsonLd([
      { name: defaults.name, url: base },
      { name: `#${tag}`, url: `${base}${basePath}` }
    ]);
  }

  return (
    <HydrationBoundary
      state={stripActiveVotesFromDehydratedState(dehydrate(getQueryClient()), loggedInUser)}
    >
      {breadcrumbJsonLd && <JsonLd data={breadcrumbJsonLd} />}
      <FeedLayout
        tag={tag}
        filter={filter}
        observer={observer}
        before={
          <>
            {/* Personal feed (/@user/feed) is where new users land after login;
                the card self-gates to fresh accounts and renders nothing otherwise. */}
            {filter === "feed" && <WavesOnboardingChecklist />}
            {/* shows itself from 29 November to 31 December, once a day */}
            <AdventBanner />
            {showTagHeader && <TagFeedHeader tag={tag} hasPosts={firstPage.length > 0} />}
          </>
        }
        after={
          olderCursor && (
            <EntryArchivePager basePath={basePath} olderCursor={olderCursor} showLatest={false} />
          )
        }
      >
        <FeedList filter={filter} tag={tag} observer={observer} />
      </FeedLayout>
    </HydrationBoundary>
  );
}
