import Link from "next/link";
import i18next from "i18next";
import { getPostsRankedQueryOptions } from "@ecency/sdk";
import { catchPostImage } from "@ecency/render-helper";
import { prefetchQuery } from "@/core/react-query";
import { withCardOnlyPageEntries } from "@/core/entries/slim-entry";
import { isNsfwEntry } from "@/utils/nsfw-detection";
import { Entry } from "@/entities";

const LIMIT = 8;

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
 * "/". Thumbnails are below the hero and lazy-loaded, keeping the page light.
 */
export async function LandingTrending() {
  const data = (await prefetchQuery(
    withCardOnlyPageEntries(getPostsRankedQueryOptions("trending", "", "", LIMIT))
  )) as Entry[] | undefined;

  const entries = (data ?? [])
    .filter((e) => e.title && !isNsfwEntry(e))
    .slice(0, LIMIT);

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="landing-trending relative z-[2] w-full" aria-labelledby="trending-heading">
      <div className="inner max-w-[1200px] mx-auto w-full px-4 py-10">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 id="trending-heading" className="text-2xl md:text-3xl font-bold">
              {i18next.t("landing-page.trending-now")}
            </h2>
            <p className="opacity-70 mt-1">{i18next.t("landing-page.trending-now-desc")}</p>
          </div>
          <Link href="/trending" className="link-read-more whitespace-nowrap">
            {i18next.t("landing-page.see-more")}
          </Link>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-0 m-0 list-none">
          {entries.map((entry) => {
            // Canonical entry URL is the bare /@author/permlink form; the
            // category-prefixed path 307-redirects to it, so link direct.
            const href = `/@${entry.author}/${entry.permlink}`;
            const thumb = catchPostImage(entry, 320, 180, "match");
            const tag = entry.community_title || `#${entry.category}`;
            return (
              <li key={`${entry.author}/${entry.permlink}`}>
                <Link
                  href={href}
                  className="block h-full rounded-xl overflow-hidden bg-white dark:bg-dark-200 border border-[--border-color] hover:shadow-lg transition-shadow"
                >
                  {thumb && (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={320}
                      height={180}
                      className="w-full h-[160px] object-cover"
                    />
                  )}
                  <div className="p-3">
                    <span className="block font-semibold line-clamp-2 leading-snug">
                      {entry.title}
                    </span>
                    <span className="block text-sm opacity-60 mt-2 truncate">
                      @{entry.author} · {tag}
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
    <section className="landing-trending relative z-[2] w-full" aria-hidden="true">
      <div className="inner max-w-[1200px] mx-auto w-full px-4 py-10">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-dark-200 mb-6 animate-pulse" />
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-0 m-0 list-none">
          {Array.from({ length: LIMIT }).map((_, i) => (
            <li
              key={i}
              className="h-[232px] rounded-xl bg-gray-100 dark:bg-dark-200 animate-pulse"
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
