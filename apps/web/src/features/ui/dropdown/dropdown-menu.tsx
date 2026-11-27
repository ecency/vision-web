import React, { HTMLProps, useCallback, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { flip, hide, Placement, shift } from "@floating-ui/dom";
import { useFloating } from "@floating-ui/react-dom";
import { DROPDOWN_FOCUSABLE, DropdownContext } from "@ui/dropdown/dropdown-context";
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
  const { show, setShow, anchor, menuRef, keyboardOpenRef, id } = useContext(DropdownContext);

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
    menuRef?.current?.querySelector<HTMLElement>(DROPDOWN_FOCUSABLE)?.focus();
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
      data-dropdown-owner={id}
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setShow(false);
          return;
        }
        if (e.key !== "Tab") return;
        // Tab moves between items. Leaving the menu closes it and hands focus
        // back to the toggle first, so tab order carries on from the toggle
        // instead of from the end of the page where the menu is portaled.
        const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(DROPDOWN_FOCUSABLE));
        const edge = e.shiftKey ? items[0] : items[items.length - 1];
        if (document.activeElement !== edge) return;
        // Shift+Tab from the first item lands on the toggle itself.
        if (e.shiftKey) e.preventDefault();
        setShow(false);
      }}
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
