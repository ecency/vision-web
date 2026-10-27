"use client";

import React, { useEffect, useRef } from "react";
import { IntentLink } from "@/features/shared/intent-link";
import i18next from "i18next";
import i18n from "i18next";
import { EcencyConfigManager } from "@/config";
import { usePathname } from "next/navigation";
import { classNameObject } from "@ui/util";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useHydrated } from "@/api/queries";
import { isPathInSection } from "@/utils/path-section";

export function NavbarTextMenu() {
  const pathname = usePathname();
  const { activeUser } = useActiveAccount();
  const hydrated = useHydrated();

  // Decks only pays off once you can build and save one, so logged-out visitors
  // see Communities (a content-rich discovery surface) in that slot instead.
  // Gate on `hydrated` so server and first client render agree (no mismatch).
  const isLoggedIn = hydrated && !!activeUser;

  const ITEMS = [
    {
      link: "/discover",
      label: i18next.t("navbar.discover"),
      show: true
    },
    {
      link: "/waves",
      label: i18n.t("navbar.waves"),
      show: EcencyConfigManager.selector(({ visionFeatures }) => visionFeatures.waves.enabled)
    },
    isLoggedIn
      ? {
          link: "/decks",
          label: i18next.t("navbar.decks"),
          show: EcencyConfigManager.selector(({ visionFeatures }) => visionFeatures.decks.enabled)
        }
      : {
          link: "/communities",
          label: i18next.t("navbar.communities"),
          show: true
        },
    {
      link: "/raidstead",
      label: i18next.t("navbar.raidstead"),
      show: EcencyConfigManager.selector(({ visionFeatures }) => visionFeatures.raidstead.enabled)
    }
  ];

  const visibleItems = ITEMS.filter((item) => item.show);

  // Links that wrapped to the clipped row are out of sight; hide them for real
  // so keyboard focus cannot land on them (and scroll the menu). Which links
  // wrap changes when the menu resizes and also when a link's own width does
  // (web font loaded, label translated), so watch the menu and every link.
  const menuRef = useRef<HTMLDivElement>(null);
  const linksKey = visibleItems.map((item) => item.link).join();
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const links = Array.from(menu.children) as HTMLElement[];
      const firstRowTop = links[0]?.offsetTop ?? 0;
      const wrapped = links.filter((link) => link.offsetTop > firstRowTop);
      const shown = links.filter((link) => !wrapped.includes(link));
      // Never hide the link the user is on without moving them somewhere visible.
      if (wrapped.some((link) => link === document.activeElement)) {
        shown[shown.length - 1]?.focus();
      }
      links.forEach((link) => {
        link.style.visibility = wrapped.includes(link) ? "hidden" : "";
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(menu);
    Array.from(menu.children).forEach((link) => observer.observe(link));
    return () => observer.disconnect();
  }, [linksKey]);

  return (
    // One row tall with overflow hidden: links that do not fit wrap to a second,
    // clipped row, so the menu loses links from its end only when out of room.
    <div
      ref={menuRef}
      className="text-menu flex flex-1 min-w-0 flex-wrap items-center justify-start h-12 py-0.5 px-1 overflow-hidden md:ml-4 md:mr-2"
    >
      {visibleItems.map((item) => {
        const active = isPathInSection(pathname, item.link);
        return (
          <IntentLink
            key={item.link}
            className={classNameObject({
              "text-sm font-semibold duration-300 hover:opacity-75 mt-0 px-2 py-0.5 rounded-2xl": true,
              "text-gunmetal dark:text-white": !active,
              "bg-blue-duck-egg text-blue-dark-sky dark:bg-dark-default": active
            })}
            href={item.link}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </IntentLink>
        );
      })}
    </div>
  );
}
