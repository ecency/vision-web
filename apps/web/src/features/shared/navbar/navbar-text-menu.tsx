"use client";

import React, { Fragment } from "react";
import { IntentLink } from "@/features/shared/intent-link";
import i18next from "i18next";
import i18n from "i18next";
import { EcencyConfigManager } from "@/config";
import { usePathname } from "next/navigation";
import { classNameObject } from "@ui/util";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useHydrated } from "@/api/queries";

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
        }
  ];

  const visibleItems = ITEMS.filter((item) => item.show);

  return (
    <div className="hidden sm:flex md:hidden xl:flex text-menu items-center gap-4 justify-center h-full md:mr-2">
      {visibleItems.map((item, i) => (
        <Fragment key={i}>
          <IntentLink
            key={item.link}
            className={classNameObject({
              "text-sm font-semibold duration-300 hover:opacity-75 mt-0 px-2 py-0.5 rounded-2xl":
                true,
              "text-gunmetal dark:text-white": !pathname?.includes(item.link),
              "bg-blue-duck-egg text-blue-dark-sky dark:bg-dark-default": pathname?.includes(
                item.link
              )
            })}
            href={item.link}
          >
            {item.label}
          </IntentLink>
          {i !== visibleItems.length - 1 && (
            <i
              key={"circle" + item.label}
              className="size-2 bg-gray-200 dark:bg-dark-default rounded-full"
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}
