import Link from "next/link";
import i18next from "i18next";

// Evergreen, well-populated topics. These are crawler hub links: server-rendered
// anchors from the homepage into trending tag feeds, communities, and discover —
// so the site's highest-authority page funnels crawl budget into deep content.
const TOPICS = [
  "hive",
  "photography",
  "art",
  "life",
  "travel",
  "food",
  "gaming",
  "music",
  "technology",
  "news",
  "nature",
  "sports"
];

export function LandingExplore() {
  return (
    <section className="landing-explore relative z-[2] w-full" aria-labelledby="explore-heading">
      <div className="inner max-w-[1200px] mx-auto w-full px-5 md:px-8 py-6">
        <div className="rounded-3xl bg-blue-duck-egg dark:bg-dark-default border border-blue-dark-sky/10 p-6 md:p-8 grid md:grid-cols-[1fr_2fr] gap-6 md:gap-10">
          <div>
            <h2 id="explore-heading" className="text-2xl md:text-3xl tracking-tight font-bold mb-4">
              {i18next.t("landing-page.explore-topics")}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              <Link
                href="/communities"
                prefetch={false}
                className="text-sm font-semibold text-blue-dusk dark:text-blue-pastel hover:underline"
              >
                {i18next.t("landing-page.popular-communities")}
              </Link>
              <Link
                href="/discover"
                prefetch={false}
                className="text-sm font-semibold text-blue-dusk dark:text-blue-pastel hover:underline"
              >
                {i18next.t("landing-page.discover")}
              </Link>
            </div>
          </div>
          <ul className="flex flex-wrap items-center gap-2 p-0 m-0 list-none">
            {TOPICS.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/trending/${tag}`}
                  prefetch={false}
                  className="inline-flex items-center min-h-[2.75rem] rounded-xl border border-blue-dark-sky/20 bg-white dark:bg-dark-200 text-blue-dusk dark:text-blue-pastel px-4 py-2 text-sm font-medium hover:bg-blue-dark-sky-hover hover:text-white dark:hover:text-white transition-colors"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
