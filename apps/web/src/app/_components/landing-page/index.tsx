import i18next from "i18next";
import Link from "next/link";
import { initI18next } from "@/features/i18n";
import defaults from "@/defaults.json";
import { LandingHeroActions } from "./landing-hero-actions";
import { LandingSubscribeForm } from "./landing-subscribe-form";
import { NewsletterGate } from "@/features/newsletter/runtime";
import { LandingSignInLink } from "./landing-sign-in-link";
import { LandingDownloadLinks } from "./landing-download-links";
import { Suspense } from "react";
import { LandingTrending, LandingTrendingSkeleton } from "./landing-trending";
import { LandingExplore } from "./landing-explore";
import { hostingApi } from "@/features/hosting-signup/hosting-api";

/**
 * Anonymous landing page — conversion-first, mobile-first.
 *
 * Everything above the fold (logo + hero text + CTAs + stats) is plain
 * server-rendered HTML styled with Tailwind utilities that already ship in the
 * global stylesheet. The page no longer imports a route-specific SCSS bundle,
 * so the hero (the LCP element) is not gated behind a ~91KB render-blocking
 * <link>. Heavy illustrated marketing sections were removed; the value prop is
 * carried by a compact icon row plus the live trending strip + topic hubs,
 * which double as crawl entry points into deep content.
 *
 * Inline SVG feature icons avoid pulling the @ui/svg barrel onto this path.
 */
const FEATURES = [
  {
    key: "own",
    title: "landing-page.true-ownership",
    desc: "landing-page.feature-own-desc",
    icon: (
      <path d="M12 2 4 6v6c0 5 3.4 7.7 8 10 4.6-2.3 8-5 8-10V6l-8-4Zm0 6a2.2 2.2 0 0 1 1 4.2V15a1 1 0 1 1-2 0v-2.8A2.2 2.2 0 0 1 12 8Z" />
    )
  },
  {
    key: "earn",
    title: "landing-page.earn-money",
    desc: "landing-page.feature-earn-desc",
    icon: (
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.9 15.4v.8a.9.9 0 0 1-1.8 0v-.8a3.4 3.4 0 0 1-2.4-1.6.9.9 0 0 1 1.5-1 1.7 1.7 0 0 0 1.5.8c.9 0 1.5-.4 1.5-1s-.5-.9-1.7-1.2c-1.4-.4-2.9-.9-2.9-2.8a2.9 2.9 0 0 1 2.4-2.7v-.8a.9.9 0 0 1 1.8 0v.8a3.2 3.2 0 0 1 2.1 1.4.9.9 0 1 1-1.5 1 1.5 1.5 0 0 0-1.3-.7c-.8 0-1.4.4-1.4.9 0 .6.5.8 1.7 1.1 1.4.4 2.9 1 2.9 2.9a2.9 2.9 0 0 1-2.4 2.6Z" />
    )
  },
  {
    key: "open",
    title: "landing-page.decentralization",
    desc: "landing-page.feature-open-desc",
    icon: (
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a14.7 14.7 0 0 0-1-4.6A8 8 0 0 1 18.9 11ZM12 4c.9 0 2.2 2.3 2.6 7H9.4C9.8 6.3 11.1 4 12 4ZM4.6 13h3a14.7 14.7 0 0 0 1 4.6A8 8 0 0 1 4.6 13Zm3-2h-3a8 8 0 0 1 4-4.6 14.7 14.7 0 0 0-1 4.6ZM12 20c-.9 0-2.2-2.3-2.6-7h5.2C14.2 17.7 12.9 20 12 20Zm2.4-.4a14.7 14.7 0 0 0 1-4.6h3a8 8 0 0 1-4 4.6Z" />
    )
  }
];

// Inline brand glyphs (single-path, simple-icons) drawn with currentColor so
// they inherit the link colour and stay visible in BOTH day and night themes.
// The old footer-*.svg assets were near-white (#F2F2F2), built for a dark
// footer, so they were invisible on the new light footer.
const SOCIALS = [
  {
    key: "youtube",
    href: "https://youtube.com/ecency",
    label: "YouTube",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
  },
  {
    key: "x",
    href: "https://twitter.com/ecency_official",
    label: "X",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
  },
  {
    key: "telegram",
    href: "https://t.me/ecency",
    label: "Telegram",
    path: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
  },
  {
    key: "discord",
    href: "https://discord.me/ecency",
    label: "Discord",
    path: "M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
  }
];

export async function LandingPage() {
  await initI18next();
  const t = i18next.t.bind(i18next);

  return (
    <div className="landing-wrapper relative w-full">
      {/* HERO — fully server-rendered, the LCP element */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-duck-egg to-blue-dark-sky-030 dark:from-dark-default dark:to-dark-200">
        <div className="max-w-[1000px] mx-auto px-4 pt-14 pb-12 md:pt-24 md:pb-16 text-center">
          {/* Brand kicker (eyebrow) above the headline. The navbar already
              carries the logo, so the hero leads with the name as a small,
              uppercase, letter-spaced label - distinct in treatment from the
              headline so it reads as a brand prefix, not a competing heading.
              Text only, so the hero stays an all-text LCP (no image request). */}
          <p className="mb-3 font-bold uppercase tracking-[0.2em] text-blue-dark-sky dark:text-gray-pinkish text-sm md:text-base">
            {defaults.name}
          </p>
          <h1 className="font-extrabold tracking-tight leading-[1.05] text-blue-dark-sky dark:text-gray-pinkish text-[2rem] sm:text-5xl md:text-6xl">
            {t("landing-page.hero-title")}
          </h1>
          <p className="mt-4 mx-auto max-w-xl font-light text-gray-700 dark:text-gray-light text-lg md:text-2xl">
            {t("landing-page.what-is-ecency")}
          </p>

          <LandingHeroActions />

          <ul className="mt-10 flex flex-wrap justify-center items-center gap-x-5 gap-y-2 p-0 m-0 list-none text-sm md:text-base text-gray-700 dark:text-gray-light">
            <li>
              <strong className="text-blue-dark-sky dark:text-gray-pinkish">130M+</strong>{" "}
              {t("landing-page.posts")}
            </li>
            <li aria-hidden="true" className="opacity-40">
              ·
            </li>
            <li>
              <strong className="text-blue-dark-sky dark:text-gray-pinkish">200K+</strong>{" "}
              {t("landing-page.new-users")}
            </li>
            <li aria-hidden="true" className="opacity-40">
              ·
            </li>
            <li>
              <strong className="text-blue-dark-sky dark:text-gray-pinkish">446M</strong>{" "}
              {t("landing-page.points-distrubuted")}
            </li>
            <li aria-hidden="true" className="opacity-40">
              ·
            </li>
            <li>
              <strong className="text-blue-dark-sky dark:text-gray-pinkish">1M+</strong>{" "}
              {t("landing-page.daily-visitors")}
            </li>
          </ul>
        </div>
      </section>

      {/* Real product first: live trending posts (SEO + click-through). Streams
          via Suspense so the hero flushes immediately. */}
      <Suspense fallback={<LandingTrendingSkeleton />}>
        <LandingTrending />
      </Suspense>

      {/* Topic hubs — crawl entry points into deep content */}
      <LandingExplore />

      {/* Managed blog hosting promo. Subtle single-row card matching the site's
          card vocabulary, gated on the same check the /hosting page uses so it
          only shows when hosting is configured. Inline SVG keeps the @ui/svg
          barrel off this path. */}
      {hostingApi.isConfigured() && (
        <section className="relative z-[2] w-full" aria-labelledby="hosting-promo-heading">
          <div className="inner max-w-[1200px] mx-auto w-full px-4 py-4">
            <Link
              href="/hosting"
              className="group flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 rounded-2xl border border-[--border-color] bg-white dark:bg-dark-200 px-5 py-5 transition-shadow hover:shadow-md"
            >
              <span className="inline-flex items-center justify-center size-11 shrink-0 rounded-lg bg-blue-dark-sky-040 dark:bg-dark-default text-blue-dark-sky">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 5v9h14V9H5Zm1.5-3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="hosting-promo-heading" className="text-lg font-semibold">
                  {t("hosting.landing-title")}
                </h2>
                <p className="mt-1 opacity-70">{t("hosting.landing-description")}</p>
              </div>
              <span className="shrink-0 font-semibold text-blue-dark-sky group-hover:underline">
                {t("hosting.landing-action")}
              </span>
            </Link>
          </div>
        </section>
      )}

      {/* Why Ecency — compact value prop replacing the old illustrated sections */}
      <section className="relative z-[2] w-full" aria-labelledby="why-heading">
        <div className="inner max-w-[1200px] mx-auto w-full px-4 py-10">
          <h2 id="why-heading" className="text-2xl md:text-3xl font-bold mb-6">
            {t("landing-page.why-ecency")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.key}
                className="rounded-xl border border-[--border-color] bg-white dark:bg-dark-200 p-5"
              >
                <span className="inline-flex items-center justify-center size-11 rounded-lg bg-blue-dark-sky-040 dark:bg-dark-default text-blue-dark-sky">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    {f.icon}
                  </svg>
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(f.title)}</h3>
                <p className="mt-1 opacity-70">{t(f.desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download */}
      <section className="relative z-[2] w-full" id="download">
        <div className="inner max-w-[1200px] mx-auto w-full px-4 py-10">
          <div className="rounded-2xl border border-[--border-color] bg-blue-duck-egg dark:bg-dark-200 px-5 py-8 text-center">
            <h2 className="text-2xl md:text-3xl font-bold">
              {t("landing-page.download-our-application")}
            </h2>
            <p className="mt-2 opacity-70">{t("landing-page.download-our-application-desc-1")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-2 [&_a]:h-12 [&_a]:px-5 [&_a]:rounded-full [&_a]:border [&_a]:border-[--border-color] [&_a]:bg-white [&_a]:dark:bg-dark-default [&_a]:font-medium [&_a]:transition-shadow hover:[&_a]:shadow-md [&_img]:size-5 [&_svg]:size-5">
              <LandingDownloadLinks
                iosIcon={`${defaults.base}/assets/icon-apple.svg`}
                iosIconWhite={`${defaults.base}/assets/icon-apple-white.svg`}
                androidIcon={`${defaults.base}/assets/icon-android.png`}
                androidIconWhite={`${defaults.base}/assets/icon-android-white.svg`}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-[2] w-full border-t border-[--border-color] mt-4">
        <div className="inner max-w-[1200px] mx-auto w-full px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <nav className="flex flex-col gap-2" aria-label={t("landing-page.about")}>
              <Link href="/about" className="opacity-70 hover:opacity-100">
                {t("landing-page.about")}
              </Link>
              <Link href="/contributors" className="opacity-70 hover:opacity-100">
                {t("landing-page.community-contributors")}
              </Link>
              <Link href="/faq" className="opacity-70 hover:opacity-100">
                {t("landing-page.faq")}
              </Link>
              <Link href="/terms-of-service" className="opacity-70 hover:opacity-100">
                {t("landing-page.terms-of-service")}
              </Link>
              <Link href="/privacy-policy" className="opacity-70 hover:opacity-100">
                {t("landing-page.privacy-policy")}
              </Link>
            </nav>
            <nav className="flex flex-col gap-2" aria-label={t("landing-page.discover")}>
              <Link href="/discover" className="opacity-70 hover:opacity-100">
                {t("landing-page.discover")}
              </Link>
              <span className="opacity-70 hover:opacity-100">
                <LandingSignInLink />
              </span>
              <Link href="/communities" className="opacity-70 hover:opacity-100">
                {t("landing-page.communities")}
              </Link>
              <Link href="/creator-economy" className="opacity-70 hover:opacity-100">
                {t("landing-page.creator-economy")}
              </Link>
              <Link href="/faq" className="opacity-70 hover:opacity-100">
                {t("landing-page.help")}
              </Link>
              <Link href="/mobile" className="opacity-70 hover:opacity-100">
                {t("landing-page.get-mobile-app")}
              </Link>
            </nav>

            <div className="col-span-2">
              <NewsletterGate>
                <h2 className="text-lg font-semibold">{t("landing-page.subscribe-us")}</h2>
                <div className="mt-3 [&_form]:flex [&_form]:flex-wrap [&_form]:gap-2 [&_input]:flex-1 [&_input]:min-w-[12rem] [&_input]:h-11 [&_input]:px-3 [&_input]:rounded-lg [&_input]:border [&_input]:border-[--border-color] [&_input]:bg-white [&_input]:dark:bg-dark-200 [&_select]:h-11 [&_select]:px-3 [&_select]:rounded-lg [&_select]:border [&_select]:border-[--border-color] [&_select]:bg-white [&_select]:dark:bg-dark-200 [&_button]:h-11 [&_button]:px-5 [&_button]:rounded-lg [&_button]:bg-blue-dark-sky [&_button]:text-white [&_button]:font-medium">
                  <LandingSubscribeForm />
                </div>
                <p className="mt-2 text-sm opacity-60">{t("landing-page.subscribe-paragraph")}</p>
                <p className="mt-1 text-xs opacity-60">{t("landing-page.subscribe-disclosure")}</p>
              </NewsletterGate>
              <ul className="mt-4 flex gap-4 p-0 m-0 list-none">
                {SOCIALS.map((s) => (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      className="inline-flex text-gray-600 dark:text-gray-light hover:text-blue-dark-sky transition-colors"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d={s.path} />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3 border-t border-[--border-color] pt-6">
            <img
              src={defaults.logo}
              alt={defaults.name}
              width={36}
              height={36}
              className="size-9"
            />
            <p className="m-0 text-sm opacity-60">
              {t("landing-page.copy-rights", { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
