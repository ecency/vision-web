"use client";

import React, { HTMLProps, useCallback, useContext, useId, useRef, useState } from "react";
import { DROPDOWN_FOCUSABLE, DropdownContext } from "@ui/dropdown/dropdown-context";

export { DROPDOWN_FOCUSABLE };
import useClickAway from "react-use/lib/useClickAway";
import { UIContext } from "@ui/core";
import { classNameObject, useFilteredProps } from "@ui/util";

export * from "./dropdown-item";
export * from "./dropdown-menu";
export * from "./dropdown-toggle";


/**
 * True when target sits in the open menu of a Dropdown rendered inside root.
 * Menus are portaled out of their Dropdown, so a container's own click-away
 * needs this instead of a DOM containment check, without also ignoring menus
 * that belong to other dropdowns on the page.
 */
export function isInOwnDropdownMenu(root: Element | null, target: EventTarget | null): boolean {
  const owner = (target as Element | null)?.closest?.("[data-dropdown-owner]")?.getAttribute("data-dropdown-owner");
  if (!root || !owner) return false;
  return Array.from(root.querySelectorAll("[data-dropdown-id]")).some(
    (el) => el.getAttribute("data-dropdown-id") === owner
  );
}

/** Focus the toggle of the Dropdown whose root is anchor. */
export function focusDropdownToggle(anchor: HTMLElement | null | undefined) {
  const toggle = anchor?.querySelector<HTMLElement>(".ecency-dropdown-toggle");
  const target = toggle?.matches(DROPDOWN_FOCUSABLE) ? toggle : toggle?.querySelector<HTMLElement>(DROPDOWN_FOCUSABLE);
  target?.focus();
}

interface Props {
  show?: boolean;
  setShow?: (v: boolean) => void;
  closeOnClickOutside?: boolean;
}

export function Dropdown(props: HTMLProps<HTMLDivElement> & Props) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // The menu is portaled out of this element (see DropdownMenu), so clicks in
  // it and popovers anchored in it count as inside through menuRef.
  const menuRef = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const keyboardOpenRef = useRef(false);
  const id = useId();
  const setRootRef = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
    setAnchor(el);
  }, []);
  const { openPopovers } = useContext(UIContext);

  useClickAway(ref, (e) => {
    if (menuRef.current?.contains(e.target as Node)) {
      return;
    }

    // An open click-popover anchored inside THIS dropdown (e.g. a confirm
    // popover whose buttons render in a portal outside our DOM) — keep the
    // menu mounted until the popover is answered; closing now would unmount
    // the popover before its buttons' click handlers can fire. Popovers open
    // elsewhere on the page don't block dismissal.
    const hostsOpenPopover = Array.from(openPopovers).some((popoverAnchor) =>
      ref.current?.contains(popoverAnchor) || menuRef.current?.contains(popoverAnchor)
    );
    if (hostsOpenPopover) {
      return;
    }

    setShow(false);

    if (!isInsideDropdown(e) && (props.closeOnClickOutside ?? true)) {
      setShow(false);
      props.setShow?.(false);
    }
  });
  const nativeProps = useFilteredProps(props, ["show", "setShow", "closeOnClickOutside"]);

  const isInsideDropdown = (e: Event) => {
    let target = e.target as HTMLElement | null;
    while (!target?.parentElement?.classList.contains("ecency-dropdown-menu") && target) {
      target = target?.parentElement ?? null;
    }

    return !!target;
  };

  const isOpen = props.show ?? show;

  return (
    <DropdownContext.Provider
      value={{
        show: isOpen,
        anchor,
        menuRef,
        keyboardOpenRef,
        id,
        setShow: (v) => {
          // Closing with focus inside the portaled menu (an item chosen from the
          // keyboard) would drop focus to <body>: hand it back to the toggle.
          const refocus =
            !v && typeof document !== "undefined" && !!menuRef.current?.contains(document.activeElement);
          setShow(v);
          props.setShow?.(v);
          if (refocus) focusDropdownToggle(ref.current);
        }
      }}
    >
      <div
        {...nativeProps}
        ref={setRootRef}
        data-dropdown-open={isOpen || undefined}
        data-dropdown-id={id}
        className={classNameObject({
          relative: true,
          "z-[10]": isOpen,
          "overflow-visible": isOpen,
          [props.className ?? ""]: !!props.className
        })}
      />
    </DropdownContext.Provider>
  );
}
