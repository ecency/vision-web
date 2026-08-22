import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { DEFAULT_OBSERVER } from "@/consts/observer";
import { prefetchGetPostsFeedQuery } from "@/api/queries";
import { FeedLayout, FeedList } from "../_components";
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
          <div className="entry-list-body">
            <EntryListContent
              username=""
              loading={false}
              entries={stripActiveVotesFromValue(entries, loggedInUser)}
              sectionParam={filter}
              isPromoted={false}
              showEmptyPlaceholder={false}
            />
            <EntryArchivePager
              basePath={basePath}
              olderCursor={nextCursor ? cursorToken(nextCursor) : null}
              showLatest={true}
            />
          </div>
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
      <FeedLayout tag={tag} filter={filter} observer={observer}>
        {/* Personal feed (/@user/feed) is where new users land after login;
            the card self-gates to fresh accounts and renders nothing otherwise. */}
        {filter === "feed" && <WavesOnboardingChecklist />}
        <FeedList filter={filter} tag={tag} observer={observer} />
        {olderCursor && (
          <EntryArchivePager basePath={basePath} olderCursor={olderCursor} showLatest={false} />
        )}
      </FeedLayout>
    </HydrationBoundary>
  );
}
