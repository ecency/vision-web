import Link from "next/link";
import i18next from "i18next";
import { getPostsRankedQueryOptions } from "@ecency/sdk";
import { catchPostImage } from "@ecency/render-helper";
import { prefetchQuery } from "@/core/react-query";
import { withCardOnlyPageEntries } from "@/core/entries/slim-entry";
import { isNsfwEntry } from "@/utils/nsfw-detection";
import { Entry } from "@/entities";

const LIMIT = 8;

function TrendingHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h2 id="trending-heading" className="text-3xl md:text-4xl tracking-tight font-bold">
          {i18next.t("landing-page.trending-now")}
        </h2>
        <p className="text-gray-700 dark:text-gray-light mt-2">
          {i18next.t("landing-page.trending-now-desc")}
        </p>
      </div>
      <Link
        href="/trending"
        prefetch={false}
        className="inline-flex min-h-[2.75rem] items-center gap-2 text-sm font-semibold text-blue-dusk dark:text-blue-pastel hover:underline"
      >
        {i18next.t("landing-page.see-more")} <span aria-hidden="true">↗</span>
      </Link>
    </div>
  );
}

/**
 * Server-rendered "Trending now" strip for the anonymous landing page.
 *
 * The whole point is SEO + click-through: real post links sit in the initial
 * HTML so crawlers follow the homepage's authority into fresh content, and
 * first-time visitors see the actual product instead of marketing copy.
 *
 * The strip reads a title, an author and a thumbnail. It renders no body and no
 * vote state, so the page is fetched card-only: both go before anything is
 * cached, and this render holds a list of links rather than 8 posts and every
 * voter record attached to them (#1559).
 *
 * prefetchQuery has a built-in SSR timeout and swallows errors (returns
 * undefined), so a slow/failed RPC degrades to "no strip" rather than breaking
 * "/". Thumbnails are lazy-loaded except the first: on a phone the hero is short
 * enough that the first card's thumbnail is the largest thing in the viewport,
 * i.e. the LCP element. Streamed in through Suspense and marked lazy it was
 * invisible to the preload scanner and waited for layout, which PageSpeed
 * reported as ~1.3 s of load delay (#1594). Eager + fetchpriority=high lets the
 * browser request it the moment its markup arrives.
 */
export async function LandingTrending() {
  const data = (await prefetchQuery(
    withCardOnlyPageEntries(getPostsRankedQueryOptions("trending", "", "", LIMIT))
  )) as Entry[] | undefined;

  const entries = (data ?? []).filter((e) => e.title && !isNsfwEntry(e)).slice(0, LIMIT);

  if (entries.length === 0) {
    return null;
  }

  const cards = entries.map((entry) => ({
    entry,
    thumb: catchPostImage(entry, 320, 180, "match")
  }));
  // The LCP candidate is the first card that actually renders a thumbnail: a
  // text-only post at the top would otherwise take the hint while the next
  // card's image, the one the reader sees, stays lazy.
  const lcpIndex = cards.findIndex((card) => card.thumb);

  return (
    <section className="landing-trending relative z-[2] w-full" aria-labelledby="trending-heading">
      <div className="inner max-w-[1200px] mx-auto w-full px-5 md:px-8 py-12 md:py-16">
        <TrendingHeader />

        <ul className="grid grid-flow-col auto-cols-[82%] sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto snap-x snap-mandatory sm:overflow-visible sm:snap-none p-0 px-5 pb-4 m-0 -mx-5 sm:mx-0 sm:px-0 scroll-px-5 sm:scroll-px-0 list-none">
          {cards.map(({ entry, thumb }, index) => {
            // Canonical entry URL is the bare /@author/permlink form; the
            // category-prefixed path 307-redirects to it, so link direct.
            const href = `/@${entry.author}/${entry.permlink}`;
            const tag = entry.community_title || `#${entry.category}`;
            return (
              <li key={`${entry.author}/${entry.permlink}`} className="snap-start min-w-0">
                <Link
                  href={href}
                  prefetch={false}
                  className="group block h-full rounded-2xl overflow-hidden bg-white dark:bg-dark-default border border-[--border-color] text-indigo-dark dark:text-white-500 hover:border-blue-dark-sky/50 hover:shadow-lg transition-shadow focus-visible:!outline-offset-[-3px]"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      loading={index === lcpIndex ? "eager" : "lazy"}
                      fetchPriority={index === lcpIndex ? "high" : undefined}
                      decoding="async"
                      width={320}
                      height={180}
                      className="w-full h-[160px] object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-[160px] flex items-center justify-center bg-blue-duck-egg dark:bg-dark-200 text-blue-dark-sky"
                    >
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7m-7 4h5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="h-[136px] p-4">
                    <span className="block truncate text-xs font-medium text-blue-dusk dark:text-blue-pastel mb-2">
                      {tag}
                    </span>
                    <span className="block h-11 font-semibold line-clamp-2 leading-snug group-hover:text-blue-dark-sky">
                      {entry.title}
                    </span>
                    <span className="block text-sm text-gray-700 dark:text-gray-light mt-3 truncate">
                      @{entry.author}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * Suspense fallback. Reserves the strip's height so streaming the real content
 * in does not shift the hero/marketing layout (CLS), while the shell (hero =
 * the LCP element) flushes immediately without waiting on the trending RPC.
 */
export function LandingTrendingSkeleton() {
  return (
    <section
      className="landing-trending relative z-[2] w-full"
      aria-labelledby="trending-heading"
      aria-busy="true"
    >
      <div className="inner max-w-[1200px] mx-auto w-full px-5 md:px-8 py-12 md:py-16">
        <TrendingHeader />
        <ul
          aria-hidden="true"
          className="grid grid-flow-col auto-cols-[82%] sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto snap-x snap-mandatory sm:overflow-visible sm:snap-none p-0 px-5 pb-4 m-0 -mx-5 sm:mx-0 sm:px-0 scroll-px-5 sm:scroll-px-0 list-none"
        >
          {Array.from({ length: LIMIT }).map((_, i) => (
            <li
              key={i}
              className="snap-start min-w-0 h-[298px] overflow-hidden rounded-2xl border border-[--border-color] bg-white dark:bg-dark-default motion-safe:animate-pulse"
            >
              <div className="h-[160px] bg-blue-duck-egg dark:bg-dark-200" />
              <div className="p-4 space-y-3">
                <div className="h-3 w-20 rounded bg-gray-200 dark:bg-dark-400" />
                <div className="h-4 w-full rounded bg-gray-200 dark:bg-dark-400" />
                <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-dark-400" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
