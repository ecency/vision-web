"use client";

import { useEffect, useState } from "react";
import { chevronUpSvg } from "@/features/ui/svg";
import i18next from "i18next";
import { Tooltip } from "@ui/tooltip";
import { useHideOnScroll } from "@/features/shared/navbar/use-hide-on-scroll";
import useMedia from "react-use/lib/useMedia";
import clsx from "clsx";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  // Share the bottom navbar + compose FAB's hide-on-scroll signal so the whole
  // bottom cluster moves as one: it slides away on scroll-down and returns on
  // scroll-up, keeping this control level with the FAB. Gated to the same
  // breakpoint as the SCSS transform, so the shared hook adds no scroll listener
  // on desktop, where the hidden state has no visual effect.
  const isMobile = useMedia("(max-width: 767px)", false);
  const hidden = useHideOnScroll(8, 56, isMobile);

  // Single effect with one stable handler: registering and removing the exact
  // same listener reference avoids a leak across the per-page mount/unmounts.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const detect = () => setVisible(window.scrollY > window.innerHeight);
    const onScrollOrResize = () => {
      clearTimeout(timer);
      timer = setTimeout(detect, 5);
    };

    detect();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <Tooltip content={i18next.t("scroll-to-top.title")}>
      <div
        className={clsx("scroll-to-top [&>svg]:size-5", visible && "visible", hidden && "navbar-hidden")}
        role="button"
        tabIndex={0}
        aria-label={i18next.t("scroll-to-top.title")}
        onClick={scrollToTop}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            scrollToTop();
          }
        }}
      >
        {chevronUpSvg}
      </div>
    </Tooltip>
  );
}
