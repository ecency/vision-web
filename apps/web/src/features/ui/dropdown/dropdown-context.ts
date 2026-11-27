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
}>({
  show: false,
  setShow: (value: boolean) => {}
});
