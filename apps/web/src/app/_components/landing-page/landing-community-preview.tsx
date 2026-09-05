import i18next from "i18next";
import Link from "next/link";

/** Static topic artwork: no fetched images, client bundle, or layout shift. */
export function LandingCommunityPreview() {
  return (
    <div className="relative hidden lg:block min-w-0 py-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 m-auto size-[380px] rounded-full border border-blue-dark-sky/20"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 m-auto size-[290px] rounded-full bg-blue-dark-sky/5"
      />
      <div className="relative ml-5 mr-10 -rotate-3 overflow-hidden rounded-3xl border border-white dark:border-dark-400 bg-white dark:bg-dark-default shadow-xl">
        <Link href="/trending/photography" prefetch={false} className="group block p-3">
          <div className="overflow-hidden rounded-2xl bg-[#d8ecf1]">
            <svg
              viewBox="0 0 400 235"
              width="400"
              height="235"
              className="w-full h-auto"
              fill="none"
              aria-hidden="true"
            >
              <path fill="#d8ecf1" d="M0 0h400v235H0z" />
              <circle cx="290" cy="64" r="30" fill="#fff6d9" />
              <path d="m0 182 99-114 87 111L285 95l115 90v50H0Z" fill="#8fb8c0" />
              <path d="m99 68-28 32 27-8 23 4Z" fill="#f4fafb" />
              <path d="m0 213 152-96 111 99 74-59 63 47v31H0Z" fill="#4c858e" />
              <path d="M0 212c82-29 155 31 231 0s112-10 169 1v22H0Z" fill="#245967" />
              <path d="M0 227c110-20 176 15 265-2 50-10 91-5 135 1v9H0Z" fill="#163e50" />
            </svg>
          </div>
          <div className="flex items-center justify-between gap-3 px-2 py-4">
            <span className="font-semibold text-indigo-dark dark:text-white group-hover:text-blue-dark-sky">
              #photography
            </span>
            <span aria-hidden="true" className="text-blue-dark-sky">
              ↗
            </span>
          </div>
        </Link>
      </div>
      <Link
        href="/trending/art"
        prefetch={false}
        className="absolute -right-1 -top-2 w-36 rotate-6 overflow-hidden rounded-2xl border border-white dark:border-dark-400 bg-white dark:bg-dark-default p-2 shadow-lg"
      >
        <svg
          viewBox="0 0 128 104"
          width="128"
          height="104"
          className="w-full h-auto rounded-xl"
          fill="none"
          aria-hidden="true"
        >
          <path fill="#f5e9df" d="M0 0h128v104H0z" />
          <circle cx="89" cy="30" r="29" fill="#ee997b" />
          <path d="M15 104V49a28 28 0 0 1 56 0v55" fill="#746ba7" />
          <path d="M40 104V63a27 27 0 0 1 54 0v41" fill="#343e77" />
          <path d="M0 84h128v20H0z" fill="#dfbe97" />
        </svg>
        <span className="block px-1 py-2 text-sm font-semibold">
          #art <span aria-hidden="true">↗</span>
        </span>
      </Link>
      <div className="relative -mt-4 ml-16 mr-0 rotate-2 rounded-2xl border border-[--border-color] bg-white dark:bg-dark-default p-4 shadow-lg flex items-center gap-3">
        <span
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-dark-sky text-white"
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <path
              d="m8 12 3 3 5-6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold">{i18next.t("landing-page.true-ownership")}</p>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-light">
            {i18next.t("landing-page.powered-by-hive")}
          </p>
        </div>
      </div>
    </div>
  );
}
