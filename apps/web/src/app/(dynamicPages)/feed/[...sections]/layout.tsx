import { prefetchGetPostsFeedQuery } from "@/api/queries";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { DEFAULT_OBSERVER } from "@/consts/observer";
import { Entry } from "@/entities";
import { EntryListThumbPreload } from "@/features/shared/entry-list-item/entry-list-thumb-preload";
import { EAGER_THUMB_CARD_COUNT } from "@/features/shared/entry-list-item/thumb-lcp";
import { cookies, headers } from "next/headers";
import React, { PropsWithChildren, Suspense } from "react";

interface Params {
  params: Promise<{ sections: string[] }>;
}

/**
 * Resolves the feed's topmost entries so the first eagerly-rendered thumbnail
 * can be preloaded.
 *
 * Shares the request-scoped query client with the page, and the client's 60s
 * staleTime means the page's own prefetch of the same key is a cache read, not
 * a second API call.
 */
async function FeedThumbPreload({ params }: Params) {
  const [filter = "hot", rawTag = ""] = (await params).sections;
  const tag = rawTag === "global" ? "" : rawTag;

  // Layouts get no searchParams; middleware forwards the query string.
  const search = new URLSearchParams((await headers()).get("x-search") ?? "");

  // A cursor archive page (?before=) renders a different slice than page 1, so
  // preloading the page-1 thumbnail there would fetch an image the page never
  // shows.
  if (search.has("before")) {
    return null;
  }

  const observer = (await cookies()).get(ACTIVE_USER_COOKIE_NAME)?.value || DEFAULT_OBSERVER;

  const feed = await prefetchGetPostsFeedQuery(filter, tag, 20, observer);
  const entries = ((feed?.pages?.[0] as Entry[] | undefined) ?? []).filter(Boolean);

  // FeedList drops reblogs client-side under ?no-reblog=true, which re-indexes
  // the list — so the eager window there starts at a different entry than the
  // raw feed's. Apply the same filter or the preload names a card the page
  // never renders.
  const rendered =
    search.get("no-reblog") === "true"
      ? entries.filter((entry) => !entry.reblogged_by || entry.reblogged_by.length === 0)
      : entries;

  return <EntryListThumbPreload entries={rendered.slice(0, EAGER_THUMB_CARD_COUNT)} />;
}

/**
 * Exists only to host the thumbnail preload.
 *
 * `loading.tsx` puts the page in a Suspense boundary, and React holds a
 * boundary's hoisted <link>s until that boundary flushes — which for this route
 * is after ~380KB of RSC payload has streamed, so a preload rendered by the
 * page buys nothing (measured: it landed at byte 566,134 of the response, 8KB
 * ahead of the <img> it was supposed to front-run). A layout renders OUTSIDE
 * the loading boundary, so this sibling boundary flushes as soon as the feed
 * data resolves, independent of how long the page takes to serialize.
 */
export default function FeedSectionsLayout({ children, params }: PropsWithChildren<Params>) {
  return (
    <>
      <Suspense fallback={null}>
        <FeedThumbPreload params={params} />
      </Suspense>
      {children}
    </>
  );
}
