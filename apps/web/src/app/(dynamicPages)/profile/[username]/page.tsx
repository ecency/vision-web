import { ProfileEntriesList, ProfileSearchContent } from "./_components";
import { prefetchGetPostsFeedQuery } from "@/api/queries";
import {
  prefetchQuery,
  prefetchRequired,
  getQueryClient,
  fetchInfiniteQuery
} from "@/core/react-query";
import { stripActiveVotesFromDehydratedState } from "@/core/react-query/strip-active-votes";
import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { getAccountFullQueryOptions, getSearchApiInfiniteQueryOptions } from "@ecency/sdk";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Metadata, ResolvingMetadata } from "next";
import {
  generateProfileMetadata,
  pinnedPermlink
} from "@/app/(dynamicPages)/profile/[username]/_helpers";
import { Entry, SearchResult } from "@/entities";
import type { SearchResponse } from "@ecency/sdk";
import type { InfiniteData } from "@tanstack/react-query";

interface Props {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

// Dynamic: reads the active_user cookie to strip active_votes from the SSR
// payload for anonymous requests only. The middleware still applies the
// `profile` tier Cache-Control (s-maxage=300, stale-while-revalidate=3600) by
// pathname, so the anon variant stays edge-cached on the same refresh window as
// the previous ISR revalidate.

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { username } = await props.params;
  return generateProfileMetadata(username.replace(/%40/g, ""));
}

export default async function Page({ params, searchParams }: Props) {
  const { username: usernameParam } = await params;
  const username = usernameParam.replace(/%40/g, "");
  const { query: searchParam } = await searchParams;
  const loggedInUser = (await cookies()).get(ACTIVE_USER_COOKIE_NAME)?.value;

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
      : prefetchGetPostsFeedQuery("posts", `@${username}`)
  ]);

  // `profile.pinned` is untrusted on-chain JSON, not a checked string. It flows
  // into getPostQueryOptions, which calls `permlink?.trim()` while building the
  // options object — before the `enabled` gate and outside the queryFn — so a
  // non-string pinned value throws here, ahead of the first flush, and now that
  // this route has no loading.tsx above it that throw is the whole document.
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
          section="posts"
          account={account}
          initialFeed={initialFeed}
          currentUser={loggedInUser}
        />
      )}
    </HydrationBoundary>
  );
}
