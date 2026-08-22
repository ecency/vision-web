"use client";

import React, { lazy, Suspense, useEffect, useState } from "react";
import usePrevious from "react-use/lib/usePrevious";
import * as ls from "@/utils/local-storage";
import useMount from "react-use/lib/useMount";
import { NavbarMobile } from "./navbar-mobile";
import { NavbarDesktop } from "./navbar-desktop";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Theme } from "@/enums";
import { classNameObject } from "@ui/util";
import { useClientTheme } from "@/api/queries";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const LoginDialog = lazy(() =>
  import("@/features/shared/login").then((m) => ({ default: m.LoginDialog }))
);

const NotificationsDialog = lazy(() =>
  import("@/features/shared/notifications").then((m) => ({ default: m.NotificationsDialog }))
);

interface Props {
  step?: number;
  setStepOne?: () => void;
  setStepTwo?: () => void;
  experimental?: boolean; // Use this flag for testing something
}

export function Navbar({ setStepOne, setStepTwo, step, experimental = false }: Props) {
  const { activeUser } = useActiveAccount();
  const [theme, toggleTheme] = useClientTheme();

  const router = useRouter();
  const query = useSearchParams();
  const pathname = usePathname();
  const previousPathname = usePrevious(pathname);

  const [transparentVerify, setTransparentVerify] = useState(false);
  const [smVisible, setSmVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mainBarExpanded, setMainBarExpanded] = useState(false);

  const previousActiveUser = usePrevious(activeUser);

  useMount(() => {
    // referral check / redirect
    if (location.pathname === "/signup" && query?.has("referral")) {
      router.push(`/signup?referral=${query.get("referral")}`);
    }
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", handleSetTheme);

    return () => {
      document.getElementsByTagName("body")[0].classList.remove("overflow-hidden");
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .removeEventListener("change", handleSetTheme);
    };
  });

  useEffect(() => {
    if (smVisible) {
      document.getElementsByTagName("body")[0].classList.add("overflow-hidden");
    } else {
      document.getElementsByTagName("body")[0].classList.remove("overflow-hidden");
    }
  }, [smVisible]);

  useEffect(() => {
    if (previousPathname !== pathname || previousActiveUser !== activeUser) {
      if (pathname === "/" && !activeUser) {
        setStepOne && setStepOne();
      } else {
        setStepTwo && setStepTwo();
      }
    }
  }, [pathname, previousPathname, activeUser, previousActiveUser, setStepOne, setStepTwo]);

  useEffect(() => {
    if (!pathname) {
      setTransparentVerify(false);
      return;
    }
    setTransparentVerify(
      pathname.startsWith("/hot") ||
        pathname.startsWith("/created") ||
        pathname.startsWith("/trending")
    );
  }, [pathname]);

  const handleSetTheme = () => {
    const useSystem = ls.get("use_system_theme", false);
    let theme = ls.get("theme");
    if (useSystem) {
      theme =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? Theme.night
          : Theme.day;
    }
    toggleTheme?.(theme);
  };

  return (
    <div
      className={classNameObject({
        "fixed z-20 top-[unset] bottom-0 md:top-0 md:bottom-[unset] left-0 right-0 flex flex-col justify-start":
          true,
        "md:p-2": experimental
      })}
      id="sticky-container"
    >
      <NavbarMobile
        expanded={expanded}
        setExpanded={setExpanded}
        mainBarExpanded={mainBarExpanded}
        setMainBarExpanded={setMainBarExpanded}
        step={step}
      />
      <NavbarDesktop
        transparentVerify={transparentVerify}
        mainBarExpanded={mainBarExpanded}
        setMainBarExpanded={setMainBarExpanded}
        step={step}
        setStepOne={setStepOne}
        setSmVisible={setSmVisible}
        experimental={experimental}
      />
      <Suspense fallback={null}>
        <LoginDialog />
        {/*Do not remove from here because it`s controlling by global store*/}
        <NotificationsDialog />
      </Suspense>
    </div>
  );
}
