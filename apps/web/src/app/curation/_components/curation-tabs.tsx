"use client";

import clsx from "clsx";
import i18next from "i18next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCurationStatusQueryOptions, type CurationStatus } from "@ecency/sdk";
import { EcencyConfigManager } from "@/config";
import { useViewerRole } from "@/features/curation-desk/hooks";

const TABS = [
  { href: "/curation", key: "queue" },
  { href: "/curation/marks", key: "marks" },
  { href: "/curation/recommendations", key: "recommendations" },
  { href: "/curation/guide", key: "guide" }
] as const;

/** The invitation, for readers who are not on the roster. Curators are already in. */
const APPLY_TAB = { href: "/curation/apply", key: "apply" } as const;

/** The roster tab is admin-only, and the page refuses anyone else besides. */
const ROSTER_TAB = { href: "/curation/roster", key: "roster" } as const;

/** The counts as the desk sends them; the curator's recommendation count is newer than the SDK type. */
type StatusCounts = CurationStatus["counts"] & { recommended_unhandled?: number };

/** Queue / Marks / Recommendations / Guide, with counts from the status query. */
export function CurationTabs() {
  const pathname = usePathname() ?? "/curation";
  const onGuide = pathname.startsWith("/curation/guide");
  const { data: status } = useQuery({ ...getCurationStatusQueryOptions(), enabled: !onGuide });
  // The recommendations route answers notFound while the sub-flag is off, so
  // the tab that points at it goes with it.
  const recommendationsEnabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.recommendations.enabled
  );
  const applicationsEnabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.applications.enabled
  );
  const base = recommendationsEnabled ? TABS : TABS.filter((tab) => tab.key !== "recommendations");
  const { role, isRoster, isLoading: roleLoading } = useViewerRole();
  // The apply tab is for people outside the roster, including logged-out readers.
  // Until the role is known it stays hidden rather than inviting a curator to apply.
  const withApply =
    applicationsEnabled && !isRoster && !roleLoading ? [...base, APPLY_TAB] : base;
  const tabs = role === "admin" ? [...base, ROSTER_TAB] : withApply;

  // The recommendations tab opens a different list per role, so its badge
  // counts that list: curators read the roster's recommended view, which leaves
  // out what the team handled, and everyone else reads the public list. Until
  // the role is known the tab does not know which list it opens, so it shows no
  // count rather than the wrong one. A desk older than the curator count
  // answers without it, and the public count stands in.
  const statusCounts = status?.counts as StatusCounts | undefined;
  const counts: Record<string, number | undefined> = {
    queue: statusCounts?.unreviewed,
    recommendations: roleLoading
      ? undefined
      : isRoster
        ? (statusCounts?.recommended_unhandled ?? statusCounts?.recommended_posts)
        : statusCounts?.recommended_posts
  };

  return (
    <div className="px-2">
      <h1 className="text-2xl font-bold tracking-tight">{i18next.t("curation-desk.page-title")}</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {i18next.t("curation-desk.page-intro")}
      </p>
      <nav
        aria-label={i18next.t("curation-desk.tabs.aria")}
        className="mt-5 flex items-center gap-5 overflow-x-auto border-b border-[--border-color] text-sm"
      >
        {tabs.map((tab) => {
          const active =
            tab.href === "/curation" ? pathname === "/curation" : pathname.startsWith(tab.href);
          const count = counts[tab.key];
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 font-medium transition-colors focus-visible:outline-blue-dark-sky",
                active
                  ? "border-blue-dark-sky text-blue-dark-sky"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-blue-dark-sky"
              )}
            >
              {i18next.t(`curation-desk.tabs.${tab.key}`)}
              {count != null && count > 0 && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                    active ? "bg-blue-dark-sky/10" : "bg-gray-100 dark:bg-dark-default"
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
