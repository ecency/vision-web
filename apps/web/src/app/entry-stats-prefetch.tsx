"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getPostTipsQueryOptions, getProMembersQueryOptions } from "@ecency/sdk";

/*
  Warms the two auth-free queries that paint an entry page's final pixels
  (post tips and pro-members badges), firing with root hydration (#1668).

  Without this, both fetch only when their components mount — and those sit
  under the route-level streamed Suspense boundary, which React hydrates
  lazily AFTER the DeferredRender feature cascade, pushing the requests to
  ~4.5s although hydration completes ~2.9s. Prefetching from the root client
  tree dedupes cleanly: the later component mounts hit the fresh cache entry
  (staleTime 60s tips / 5min pro-members).

  Section names below must stay in lockstep with the entry-vs-section split
  in features/next-middleware/cache-policy.ts, which keeps the union in TWO
  places: NO_CACHE_PROFILE_SECTIONS (wallet/settings/permissions/referrals/
  insights) plus the inline section array in its 2-segment entry branch. A
  future section missing here costs exactly one throwaway 404 GET, nothing
  more.
*/
const PROFILE_SECTIONS = new Set([
  "wallet",
  "settings",
  "permissions",
  "referrals",
  "insights",
  "posts",
  "blog",
  "comments",
  "replies",
  "communities",
  "trail",
  "followers",
  "following",
  "rss",
  "rss.xml",
  "feed"
]);

// /@author/permlink or /:category/@author/permlink
const ENTRY_2 = /^\/@([\w.-]+)\/([a-z0-9-]+)\/?$/;
const ENTRY_3 = /^\/[^/@]+\/@([\w.-]+)\/([a-z0-9-]+)\/?$/;

export function EntryStatsPrefetch(): null {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!pathname) {
      return;
    }
    const match = ENTRY_2.exec(pathname) ?? ENTRY_3.exec(pathname);
    if (!match) {
      return;
    }
    // The query key must match what the entry components build from
    // entry.author, which is always lowercase on chain.
    const author = match[1].toLowerCase();
    const permlink = match[2];
    if (ENTRY_2.exec(pathname) && PROFILE_SECTIONS.has(permlink)) {
      return;
    }
    void queryClient.prefetchQuery(getPostTipsQueryOptions(author, permlink));
    void queryClient.prefetchQuery(getProMembersQueryOptions());
  }, [pathname, queryClient]);

  return null;
}
