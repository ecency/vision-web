import { CenterButton } from "@/features/ecency-center/center-button";
import { CenterContent } from "@/features/ecency-center/center-content";
import { CenterContentLayout } from "@/features/ecency-center/center-content-layout";
import { useMemo, useRef, useState } from "react";
import useClickAway from "react-use/lib/useClickAway";
import { usePathname } from "next/navigation";
import { classNameObject } from "@ui/util";
import { isEditorPath, isPathInSection } from "@/utils/path-section";

export function EcencyCenter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  const pathname = usePathname();
  const isSubmitPage = useMemo(() => isEditorPath(pathname), [pathname]);
  const onDecks = isPathInSection(pathname, "/decks");
  useClickAway(rootRef, () => show && setShow(false));

  return isSubmitPage ? (
    <></>
  ) : (
    <div
      ref={rootRef}
      className={classNameObject({
        "fixed z-[202] bottom-4 ecency-center": true,
        "left-4": !onDecks,
        "right-4": onDecks
      })}
    >
      <CenterButton onClick={() => setShow(!show)} />
      <CenterContentLayout show={show} setShow={setShow}>
        <CenterContent />
      </CenterContentLayout>
    </div>
  );
}
