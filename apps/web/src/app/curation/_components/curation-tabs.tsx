"use client";

import clsx from "clsx";
import i18next from "i18next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCurationStatusQueryOptions } from "@ecency/sdk";

const TABS = [
  { href: "/curation", key: "queue" },
  { href: "/curation/marks", key: "marks" },
  { href: "/curation/recommendations", key: "recommendations" },
  { href: "/curation/guide", key: "guide" },
] as const;

/** Queue / Marks / Recommendations / Guide, with counts from the status query. */
export function CurationTabs() {
  const pathname = usePathname() ?? "/curation";
  const onGuide = pathname.startsWith("/curation/guide");
  const { data: status } = useQuery({ ...getCurationStatusQueryOptions(), enabled: !onGuide });

  const counts: Record<string, number | undefined> = {
    queue: status?.counts?.unreviewed,
    recommendations: status?.counts?.recommended_posts,
  };

  return (
    <nav aria-label={i18next.t("curation-desk.tabs.aria")} className="flex flex-wrap items-center gap-1 text-sm">
      <h1 className="text-lg font-bold mr-3">{i18next.t("curation-desk.page-title")}</h1>
      {TABS.map((tab) => {
        const active = tab.href === "/curation" ? pathname === "/curation" : pathname.startsWith(tab.href);
        const count = counts[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "rounded-full px-3 py-1 flex items-center gap-1",
              active
                ? "bg-blue-dark-sky text-white"
                : "bg-white dark:bg-dark-200 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-default"
            )}
          >
            {i18next.t(`curation-desk.tabs.${tab.key}`)}
            {count != null && count > 0 && (
              <span className={clsx("rounded-full px-1.5 text-[11px]", active ? "bg-white/20" : "bg-gray-100 dark:bg-dark-default")}>{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
