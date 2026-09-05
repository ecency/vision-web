import Link from "next/link";
import i18next from "i18next";

export function LandingHeroActions() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mt-8">
        <Link
          className="get-started inline-flex items-center justify-center min-h-[3rem] px-7 py-3 rounded-full bg-blue-dark-sky-hover text-white font-semibold hover:bg-blue-dark-sky-active transition-colors"
          href="/signup?referral=ecency"
          prefetch={false}
        >
          {i18next.t("landing-page.get-started")}
        </Link>
        <Link
          href="/hot"
          prefetch={false}
          className="get-started secondary inline-flex items-center justify-center gap-3 min-h-[3rem] px-7 py-3 rounded-full border border-blue-dark-sky/30 bg-white dark:bg-dark-200 text-blue-dusk dark:text-blue-pastel font-semibold hover:bg-blue-dark-sky-040 dark:hover:bg-dark-default transition-colors"
        >
          {i18next.t("landing-page.explore")}
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <a
        href="#trending"
        className="scroll-down mt-7 inline-flex min-h-[2.75rem] items-center gap-2 text-sm text-gray-700 dark:text-gray-light hover:text-blue-dark-sky"
      >
        {i18next.t("landing-page.trending-now")}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </>
  );
}
