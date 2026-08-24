import { Suspense } from "react";
import { prefetchQuery, getQueryClient } from "@/core/react-query";
import { getAccountFullQueryOptions, QueryKeys } from "@ecency/sdk";
import {
  buildPictureSources,
  buildSrcSet,
  getEntryImageRawUrl,
  IMAGE_SIZES
} from "@ecency/render-helper";
import { entryLcpMatch } from "@/app/(dynamicPages)/entry/_helpers/entry-lcp-match";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { EntryPageContentClient } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-content-client";
import { EntryPageContentSSR } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-content-ssr";
import { EntryPageBreadcrumb } from "./_components/entry-page-breadcrumb";
import { buildEntryBreadcrumbs } from "./_components/entry-breadcrumbs";
import { EntryRelatedFooter } from "./_components/entry-related-footer";
import { dehydrate, defaultShouldDehydrateQuery, HydrationBoundary } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { stripAnonEntryCacheInPlace } from "@/core/react-query/strip-active-votes";
import { Metadata, ResolvingMetadata } from "next";
import { notFound, redirect } from "next/navigation";
import { generateEntryMetadata } from "../../../_helpers";
import defaults from "@/defaults.json";
import { getServerAppBase } from "@/utils/server-app-base";
import { entryCanonical } from "@/utils/entry-canonical";
import { JsonLd, buildArticleJsonLd, buildBreadcrumbJsonLd } from "@/features/structured-data";
import {
  EntryPageContextProvider,
  EntryPageCrossPostHeader,
  EntryPageEditHistory,
  EntryRenderBoundary,
  MdHandler
} from "./_components";
import { EntryNotFoundFallback } from "./_components/entry-not-found-fallback";
import { DeletedPostScreen } from "./_components/deleted-post-screen";
import { EntryPageDiscussionsWrapper } from "./_components/entry-page-discussions-wrapper";

interface Props {
  params: Promise<{ author: string; permlink: string; category: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * generateMetadata resolves the entry through `condenser_api.get_content`
 * because it is the only source of root_author / root_permlink — bridge.get_post
 * returns them empty, and the canonical logic needs them to point a reply at its
 * discussion root and to detect container/wave trees. That fetch lands in the
 * same request-scoped query cache the page dehydrates, so a SECOND full copy of
 * the entry (post body and voter array included) was being serialized to the
 * client purely as a side effect of building <head> tags. Nothing on this route
 * reads that query client-side; the page renders from the bridge copy.
 *
 * Dropping it at the dehydration boundary is deterministic, unlike removing the
 * query after use — generateMetadata and the page render share a request but
 * their order is not guaranteed.
 */
// The scope segments of a posts.content key, derived from the SDK builder itself
// rather than assumed. Two keys are generated with different arguments and the
// common leading segments are taken — those are exactly the parts that do NOT
// depend on author/permlink. Nothing here hardcodes how many scope segments
// there are or where they sit, so a reshaped key (say ["posts","v2","content",…])
// still yields the right discriminator.
//
// Matching the family rather than one exact key is deliberate: generateMetadata
// resolves the permlink with safeDecodeURIComponent().trim() while this page uses
// the raw param, so an exact-key comparison would silently miss whenever those
// differ and let the duplicate copy back in.
const METADATA_CONTENT_KEY_PREFIX = (() => {
  const a = QueryKeys.posts.content("\u0000a", "\u0000b");
  const b = QueryKeys.posts.content("\u0000c", "\u0000d");
  const shared: unknown[] = [];
  for (let i = 0; i < a.length && a[i] === b[i]; i++) {
    shared.push(a[i]);
  }
  return shared;
})();

function shouldDehydrateEntryQuery(query: Query): boolean {
  const queryKey = query.queryKey as readonly unknown[];
  const isMetadataContentQuery =
    METADATA_CONTENT_KEY_PREFIX.length > 0 &&
    METADATA_CONTENT_KEY_PREFIX.every((segment, index) => queryKey[index] === segment);
  if (isMetadataContentQuery) {
    return false;
  }
  return defaultShouldDehydrateQuery(query);
}

// NOTE: this is currently INERT — the route renders dynamically regardless,
// because the component awaits `searchParams` (?raw / ?history). Verified
// against the deployed build: `prerender-manifest.json` lists 0 dynamicRoutes
// and no prerendered entry page, so nothing is ISR-cached here. Kept so the
// intent survives if the route ever becomes statically renderable again.
//
// Anonymous HTML is instead cached at the edge and in the origin SSR cache via
// the Cache-Control tier that middleware assigns by pathname.
export const revalidate = 300;

export async function generateMetadata(
  props: Props,
  _parent: ResolvingMetadata
): Promise<Metadata> {
  const { author, permlink } = await props.params;
  if (!permlink || permlink === "undefined") {
    return {};
  }
  return generateEntryMetadata(author.replace(/%40/g, ""), permlink);
}

export default async function EntryPage({ params, searchParams }: Props) {
  const { author: username, permlink, category } = await params;
  const sParams = await searchParams;
  const isRawContent = sParams.raw !== undefined;

  const author = username.replace(/%40/g, "");
  // Anonymous requests get active_votes stripped out of everything that crosses
  // to the client (see below). Logged-in requests keep the full arrays, because
  // they are the only source of the viewer's own vote — entry-vote-btn derives
  // isVoted from entry.active_votes and there is no per-observer field to fall
  // back to. Reading the cookie costs nothing here: this route already awaits
  // searchParams, so it renders dynamically regardless.
  const loggedInUser = (await cookies()).get(ACTIVE_USER_COOKIE_NAME)?.value;
  const entryQueryOptions = EcencyEntriesCacheManagement.getEntryQueryByPath(author, permlink);
  const [fetchedEntry, account] = await Promise.all([
    prefetchQuery(entryQueryOptions),
    // Warm the query cache for child components that read account data.
    // Use author from URL params so this runs in parallel with the entry fetch.
    prefetchQuery(getAccountFullQueryOptions(author))
  ]);

  // Strip at the SOURCE, so the render only ever has ONE entry object.
  //
  // Flight dedupes by reference, and the entry reaches the client twice — as a
  // prop in the RSC tree and inside the dehydrated React Query state. If those
  // are different objects the whole entry, post body included, is serialized
  // twice, which on a low-vote post costs more than the voter array saves.
  //
  // stripAnonEntryCacheInPlace rewrites the cache and hands back the STORED
  // object, so the prop below and the dehydrated copy are one reference. (It has
  // to return the stored one: setQueryData applies structural sharing and stores
  // a third object that is neither the previous value nor the clone given to it.)
  const entry = stripAnonEntryCacheInPlace(getQueryClient(), fetchedEntry, loggedInUser);

  if (
    permlink.startsWith("wave-") ||
    (permlink.startsWith("re-ecencywaves-") && entry?.parent_author === "ecency.waves")
  ) {
    return redirect(`/waves/${author}/${permlink}`);
  }

  if (!entry) {
    // ?history shows deleted post content via comment-history API (client-side)
    if (sParams.history !== undefined) {
      return (
        <EntryPageContextProvider>
          <DeletedPostScreen username={author} permlink={permlink} />
        </EntryPageContextProvider>
      );
    }

    // EntryNotFoundFallback polls the blockchain for freshly published posts
    // that haven't been indexed yet, then falls back to deleted post screen
    return (
      <EntryPageContextProvider>
        <div className="app-content entry-page">
          <div className="the-entry">
            <EntryNotFoundFallback username={author} permlink={permlink} />
          </div>
        </div>
      </EntryPageContextProvider>
    );
  }

  // "Read next" and the other related columns are fetched + rendered server-side
  // inside EntryRelatedFooter (Suspense-wrapped below), so no prefetch here.

  // Preload the post's primary image as the likely LCP element, matching the
  // exact rendition the in-body <picture>/<img> will request so the preload is
  // a head start, not a double download. (getEntryImageRawUrl shares the
  // renderer's decodeImageSrc, so the proxy hash is byte-identical to the body.)
  //   - Eligible cover (static raster): the body renders <picture> and an
  //     avif-capable browser picks the avif <source>. Preload the SAME avif
  //     srcset, typed image/avif. We deliberately emit ONLY the avif preload:
  //     unlike <picture>, multiple typed image preloads do NOT "pick the first
  //     supported one" — a browser that supports both avif and webp would fetch
  //     BOTH, double-downloading the LCP on the majority of clients. A match
  //     preload would likewise mismatch the avif <source>. The trade-off: the
  //     shrinking webp-only/no-avif tail (Safari 16.0–16.3, very old Chromium)
  //     skips the typed preload and instead loads the body <picture>'s webp via
  //     the in-body fetchpriority="high" <img> — no head start, but a far
  //     smaller image than develop's CDN-cross-served match preload, so net LCP
  //     for that cohort is not worse.
  //   - Ineligible cover (gif/svg/extensionless/already-proxified): the body
  //     renders a bare format=match <img>, so preload that.
  //   - rawCover === null (the fast path couldn't resolve the cover URL — e.g. a
  //     parenthesized markdown image URL the MD parser bails on): emit NO preload.
  //     The body may still render an avif <picture>, so a match preload here would
  //     mismatch the avif <source> and double-download the LCP. The in-body
  //     fetchpriority="high" <img> still prioritizes the actual fetch.
  const rawCover = getEntryImageRawUrl(entry);
  const coverPicture = rawCover ? buildPictureSources(rawCover) : null;
  const lcpMatch = entryLcpMatch(rawCover);
  const lcpMatchSrcSet = lcpMatch ? buildSrcSet(lcpMatch) : "";

  // Structured data: only top-level posts get Article + breadcrumb. Comments
  // carry no headline of their own and would emit an invalid Article.
  // Use the canonical bare /@author/permlink URL (matches generateEntryMetadata)
  // rather than the category-prefixed path, which only 307-redirects to it.
  const base = (await getServerAppBase()).replace(/\/+$/, "");
  const entryUrl = entryCanonical(entry, base) ?? `${base}/@${entry.author}/${entry.permlink}`;
  // Breadcrumb trail shared by the visible <nav> and the BreadcrumbList JSON-LD
  // so the two never drift (and never surface a raw hive-id section).
  const breadcrumbs = buildEntryBreadcrumbs(entry, {
    siteName: defaults.name,
    base,
    entryUrl
  });

  const structuredData = entry.parent_author
    ? null
    : [
        buildArticleJsonLd({ entry, account, url: entryUrl, base }),
        buildBreadcrumbJsonLd(breadcrumbs.map((c) => ({ name: c.name, url: c.url })))
      ];


  // The cache was already stripped in place above, so dehydrate() emits the same
  // objects the props carry — no second strip, and no second copy.
  const hydrationState = dehydrate(getQueryClient(), {
    shouldDehydrateQuery: shouldDehydrateEntryQuery
  });

  return (
    <HydrationBoundary state={hydrationState}>
      {coverPicture ? (
        <link
          rel="preload"
          as="image"
          type="image/avif"
          imageSrcSet={coverPicture.avif}
          imageSizes={IMAGE_SIZES}
          fetchPriority="high"
        />
      ) : rawCover && lcpMatch ? (
        // Ineligible cover with a resolved raw URL → the body renders a bare
        // format=match <img>; preload the matching rendition. (When rawCover is
        // null we intentionally emit nothing — see the comment above.)
        <link
          rel="preload"
          as="image"
          href={lcpMatch}
          imageSrcSet={lcpMatchSrcSet || undefined}
          imageSizes={lcpMatchSrcSet ? IMAGE_SIZES : undefined}
          fetchPriority="high"
        />
      ) : null}
      <EntryPageContextProvider>
        <MdHandler />
        <div className="app-content entry-page bg-fixed bg-contain bg-gradient-to-tr from-blue-dark-sky/20 to-white dark:from-dark-default dark:to-black">
          <div className="the-entry">
            <EntryPageCrossPostHeader entry={entry} />
            {breadcrumbs.length > 0 && <EntryPageBreadcrumb items={breadcrumbs} />}
            {structuredData && <JsonLd data={structuredData} />}
            <EntryRenderBoundary>
              <EntryPageContentSSR entry={entry} isRawContent={isRawContent} />
              {/* Compact 3-column related footer (Read next / From author / In
                  community): durable server-rendered internal links so crawlers
                  can reach related posts beyond the sitemap. Suspense-wrapped so
                  its bounded feed fetches stream as a later chunk instead of
                  gating the post body's flush / LCP; the anchors still ship in
                  the same streamed HTML response. */}
              {/*
                content-visibility on the two big below-fold sections keeps
                them out of the first layout/paint pass; the intrinsic-size
                hints reserve approximate scroll height until they render.
                Both wrappers start off-screen on any normal post, which is
                the precondition for content-visibility:auto to help (#1668).
              */}
              <Suspense fallback={null}>
                <div className="[content-visibility:auto] [contain-intrinsic-size:auto_600px]">
                  <EntryRelatedFooter entry={entry} />
                </div>
              </Suspense>
              <EntryPageContentClient entry={entry} />
              <div className="[content-visibility:auto] [contain-intrinsic-size:auto_800px]">
                <EntryPageDiscussionsWrapper entry={entry} category={category} />
              </div>
            </EntryRenderBoundary>
          </div>
        </div>
        <EntryPageEditHistory entry={entry} />
      </EntryPageContextProvider>
    </HydrationBoundary>
  );
}
