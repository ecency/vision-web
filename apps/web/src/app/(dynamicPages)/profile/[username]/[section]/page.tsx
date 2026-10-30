import { ProfileEntriesList, ProfileSearchContent } from "../_components";
import { ProfileEntriesArchive } from "@/app/(dynamicPages)/profile/[username]/_components/profile-entries-archive";
import {
  fetchAuthorCursorPage,
  archiveCursor,
  cursorToken
} from "@/app/(dynamicPages)/profile/[username]/_helpers/author-archive";
import { prefetchGetPostsFeedQuery } from "@/api/queries";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { notFound, redirect } from "next/navigation";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import {
  getQueryClient,
  prefetchQuery,
  prefetchRequired,
  fetchInfiniteQuery
} from "@/core/react-query";
import { stripActiveVotesFromDehydratedState } from "@/core/react-query/strip-active-votes";
import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { getAccountFullQueryOptions, getSearchApiInfiniteQueryOptions } from "@ecency/sdk";
import { Metadata, ResolvingMetadata } from "next";
import {
  generateProfileMetadata,
  pinnedPermlink
} from "@/app/(dynamicPages)/profile/[username]/_helpers";
import { Entry, SearchResult } from "@/entities";
import type { InfiniteData } from "@tanstack/react-query";
import type { SearchResponse } from "@ecency/sdk";

// NO loading.tsx in this directory, on purpose (#1805). This segment serves
// /@user/{posts,blog,comments,replies}: the page awaits the account and the
// first feed page before it returns any JSX, so a loading module here is
// emitted PENDING — the skeleton goes in the shell and the cards land in a
// hidden <div id="S:n"> chunk that a $RC swap script reveals only once the
// parser reaches it. Measured on production with the module still in place,
// the first card sat at 69.2% of the document on /@ecency/comments (1 pending
// boundary, 2 hidden segments, 1 swap script), 68.2% on /replies and 62.0% on
// /blog; the already-fixed /@ecency index puts its first card at 15.2% with
// none of the three. profile-section-page-no-ssr-skeleton.spec.ts pins the
// absence here and on every ancestor segment.

/** The feed tabs this segment serves; any other section is a 404. */
const PROFILE_FEED_SECTIONS = ["", "posts", "comments", "replies", "blog"];

interface Props {
  params: Promise<{ username: string; section: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { username, section } = await props.params;
  const { query, before } = await props.searchParams;
  const cursor = archiveCursor(section, { query, before });
  return generateProfileMetadata(
    username.replace(/%40/g, ""),
    section,
    cursor ? cursorToken(cursor) : undefined
  );
}

export default async function Page({ params, searchParams }: Props) {
  const { username: usernameParam, section } = await params;
  const { query: searchParam, before: beforeParam } = await searchParams;
  const loggedInUser = (await cookies()).get(ACTIVE_USER_COOKIE_NAME)?.value;

  const username = usernameParam.replace(/%40/g, "");

  // An unknown section is a 404 whatever the account lookup does, so it is
  // answered before any lookup (and costs no upstream call).
  if (!PROFILE_FEED_SECTIONS.includes(section)) {
    return notFound();
  }

  // Cursor archive page (/@author/<section>?before=<author>/<permlink>): O(1),
  // one fetch of the 20 posts older than the cursor. Page 1 is the clean,
  // query-less default view; archiveCursor() returns null there.
  const cursor = archiveCursor(section, { query: searchParam, before: beforeParam });
  if (cursor) {
    const basePath = `/@${username}/${section}`;
    const [account, archive] = await Promise.all([
      prefetchRequired(getAccountFullQueryOptions(username)),
      fetchAuthorCursorPage(username, section, cursor)
    ]);
    // Stale/invalid cursor (nothing older than it): send to the clean first page.
    if (archive.entries.length === 0) {
      return redirect(basePath);
    }
    return (
      <HydrationBoundary
        state={stripActiveVotesFromDehydratedState(dehydrate(getQueryClient()), loggedInUser)}
      >
        <ProfileEntriesArchive
          section={section}
          account={account}
          entries={archive.entries}
          olderCursor={archive.nextCursor ? cursorToken(archive.nextCursor) : null}
          currentUser={loggedInUser}
        />
      </HydrationBoundary>
    );
  }

  // A missing account is notFound(); a lookup that failed throws a retryable
  // lookup-unavailable error instead (prefetchRequired).
  const [account, searchPages, prefetchedFeed] = await Promise.all([
    prefetchRequired(getAccountFullQueryOptions(username)),
    searchParam
      ? fetchInfiniteQuery(
          getSearchApiInfiniteQueryOptions(
            `${searchParam} author:${username} type:post`,
            "newest",
            false
          )
        )
      : Promise.resolve(undefined),
    searchParam
      ? Promise.resolve(undefined)
      : prefetchGetPostsFeedQuery(section, `@${username}`)
  ]);

  // Same untrusted read as the profile index — see pinnedPermlink(). This was
  // belt-and-braces while the segment had a loading.tsx above it, because the
  // throw was contained to the entries region. With that module gone the guard
  // is load-bearing: getPostQueryOptions trims the permlink while BUILDING the
  // options object, so a non-string `pinned` throws before the first flush and
  // would take the whole document.
  const pinned = pinnedPermlink(account.profile);
  if (pinned) {
    await prefetchQuery(EcencyEntriesCacheManagement.getEntryQueryByPath(username, pinned));
  }

  const firstPage = searchPages?.pages?.[0] as SearchResponse | undefined;
  // SDK SearchResult is a subset of the app's SearchResult; the API returns the full shape
  const results = (firstPage?.results ?? []) as unknown as SearchResult[];

  const searchData = results.length > 0
    ? results
        .slice()
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    : undefined;
  const initialFeed = prefetchedFeed as InfiniteData<Entry[], unknown> | undefined;

  return (
    <HydrationBoundary state={stripActiveVotesFromDehydratedState(dehydrate(getQueryClient()), loggedInUser)}>
      {searchData && searchData.length > 0 ? (
        <ProfileSearchContent items={searchData} />
      ) : (
        <ProfileEntriesList
          section={section}
          account={account}
          initialFeed={initialFeed}
          currentUser={loggedInUser}
        />
      )}
    </HydrationBoundary>
  );
}
