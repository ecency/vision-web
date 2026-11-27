import React, { HTMLProps, useCallback, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { flip, hide, Placement, shift } from "@floating-ui/dom";
import { useFloating } from "@floating-ui/react-dom";
import { DropdownContext } from "@ui/dropdown/dropdown-context";
import { classNameObject, safeAutoUpdate, useFilteredProps } from "@ui/util";

interface Props {
  align?: "left" | "right" | "top" | "bottom" | "rightBottom" | "end";
  size?: "small" | "medium" | "large";
}

const PLACEMENTS: Record<NonNullable<Props["align"]>, Placement> = {
  left: "bottom-start",
  bottom: "bottom-start",
  right: "bottom-end",
  end: "bottom-end",
  top: "top-start",
  rightBottom: "top-end"
};

// The menu renders in a portal with fixed positioning, so no ancestor with
// overflow hidden/auto or content-visibility can clip it (a last comment's menu
// lost its Delete item that way). It flips when there is no room below.
export function DropdownMenu(props: Omit<HTMLProps<HTMLDivElement>, "size"> & Props) {
  const { show, anchor, menuRef, keyboardOpenRef } = useContext(DropdownContext);

  const nativeProps = useFilteredProps(props, ["align"]);

  const { refs, floatingStyles, middlewareData } = useFloating({
    strategy: "fixed",
    placement: PLACEMENTS[props.align ?? "left"],
    // hide: once the toggle scrolls out of its scroll box, the menu must not
    // keep floating over the page.
    middleware: [flip(), shift({ padding: 8 }), hide()],
    whileElementsMounted: safeAutoUpdate,
    elements: { reference: anchor ?? null }
  });

  const setFloating = useCallback(
    (el: HTMLDivElement | null) => {
      refs.setFloating(el);
      if (menuRef) menuRef.current = el;
    },
    [refs, menuRef]
  );

  useEffect(() => {
    if (!show || !keyboardOpenRef?.current) return;
    keyboardOpenRef.current = false;
    menuRef?.current?.querySelector<HTMLElement>('[role="menuitem"]:not([tabindex="-1"]), a[href]')?.focus();
  }, [show, keyboardOpenRef, menuRef]);

  if (!show || typeof document === "undefined") {
    return <></>;
  }

  const container = document.getElementById("popper-container") ?? document.body;

  // Opens with a fast CSS scale-in (compositor-only); closes instantly —
  // native menus vanish on dismiss, and an instant close reads as snappier.
  return createPortal(
    <div
      ref={setFloating}
      style={{
        ...floatingStyles,
        visibility: middlewareData.hide?.referenceHidden ? "hidden" : undefined
      }}
      className="z-[1110]"
    >
      <div
        {...nativeProps}
        className={classNameObject({
          "ecency-dropdown-menu flex flex-col items-start border border-[--border-color] rounded-xl bg-white dark:bg-dark-200 animate-scale-in":
            true,
          "origin-top": props.align !== "top" && props.align !== "rightBottom",
          "origin-bottom": props.align === "top" || props.align === "rightBottom",
          "min-w-[200px] py-2 gap-2 pr-3": !props.size || props.size === "medium",
          "min-w-[150px] py-1 gap-1 pr-2": !props.size || props.size === "small",
          "max-w-[calc(100vw-1.5rem)]": true,
          [props.className ?? ""]: !!props.className
        })}
      />
    </div>,
    container
  );
}
