import { createContext, MutableRefObject } from "react";

export const DropdownContext = createContext<{
  show: boolean;
  setShow: (value: boolean) => void;
  // The Dropdown root the portaled menu is positioned against.
  anchor?: HTMLElement | null;
  // The portaled menu itself, so click-away treats clicks in it as inside.
  menuRef?: MutableRefObject<HTMLElement | null>;
  // Set when the toggle was activated from the keyboard, so the menu can take
  // focus: in a portal its items no longer follow the toggle in tab order.
  keyboardOpenRef?: MutableRefObject<boolean>;
  // Ties the portaled menu back to its Dropdown root (see isInOwnDropdownMenu).
  id?: string;
}>({
  show: false,
  setShow: (value: boolean) => {}
});

// Elements a keyboard user can land on inside a menu.
export const DROPDOWN_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
