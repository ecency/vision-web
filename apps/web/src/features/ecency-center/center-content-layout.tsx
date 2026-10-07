import i18next from "i18next";
import { Button } from "@ui/button";
import { classNameObject } from "@ui/util";

import React, { PropsWithChildren } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMountTransition } from "@/core/hooks";
import { closeSvg } from "@ui/svg";

interface Props {
  show: boolean;
  setShow: (show: boolean) => void;
}

export function CenterContentLayout({ show, setShow, children }: PropsWithChildren<Props>) {
  const pathname = usePathname();
  const { mounted, open } = useMountTransition(show, 150);

  return (
    <>
      {mounted && (
        <div
          className={classNameObject({
            "fixed bg-white dark:bg-dark-200 bottom-4 rounded-2xl overflow-hidden origin-bottom-left w-full max-w-[320px] sm:max-w-[400px] transition-[opacity,transform] duration-150":
              true,
            "opacity-100 scale-100": open,
            "opacity-0 scale-95": !open,
            "left-4": !pathname?.includes("decks"),
            "right-4": pathname?.includes("decks")
          })}
        >
          <div className="bg-gradient-primary-day dark:bg-gradient-primary-night text-white p-4 min-h-[100px] w-full rounded-t-2xl">
            <Image
              src="/assets/logo.svg"
              alt="logo"
              width={48}
              height={48}
              className="size-8 mb-4"
            />
            <h3 className="font-bold">{i18next.t("floating-faq.center")}</h3>
            <Button
              className={classNameObject({
                "absolute top-4 right-4 text-white hover:opacity-50 hover:text-white": true
              })}
              appearance="gray-link"
              onClick={() => setShow(false)}
              icon={closeSvg}
              aria-label={i18next.t("g.close", { defaultValue: "Close" })}
            />
          </div>
          <div className="border border-[--border-color] rounded-b-2xl overflow-hidden">
            {children}
          </div>
        </div>
      )}
    </>
  );
}
