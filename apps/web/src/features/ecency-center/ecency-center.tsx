import { CenterButton } from "@/features/ecency-center/center-button";
import { CenterContent } from "@/features/ecency-center/center-content";
import { CenterContentLayout } from "@/features/ecency-center/center-content-layout";
import { useMemo, useRef, useState } from "react";
import useClickAway from "react-use/lib/useClickAway";
import { usePathname } from "next/navigation";
import { classNameObject } from "@ui/util";

export function EcencyCenter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  const pathname = usePathname();
  const isSubmitPage = useMemo(
    () =>
      pathname?.includes("submit") ||
      pathname?.includes("edit") ||
      pathname?.includes("draft") ||
      pathname?.includes("publish"),
    [pathname]
  );
  useClickAway(rootRef, () => show && setShow(false));

  return isSubmitPage ? (
    <></>
  ) : (
    <div
      ref={rootRef}
      className={classNameObject({
        "fixed z-[202] bottom-4 ecency-center": true,
        "left-4": !pathname?.includes("decks"),
        "right-4": pathname?.includes("decks")
      })}
    >
      <CenterButton onClick={() => setShow(!show)} />
      <CenterContentLayout show={show} setShow={setShow}>
        <CenterContent />
      </CenterContentLayout>
    </div>
  );
}
