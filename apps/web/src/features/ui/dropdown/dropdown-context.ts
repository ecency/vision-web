import { createContext, MutableRefObject } from "react";

export const DropdownContext = createContext<{
  show: boolean;
  setShow: (value: boolean) => void;
  // The Dropdown root the portaled menu is positioned against.
  anchor?: HTMLElement | null;
  // The portaled menu itself, so click-away treats clicks in it as inside.
  menuRef?: MutableRefObject<HTMLElement | null>;
}>({
  show: false,
  setShow: (value: boolean) => {}
});
