"use client";

import { useEffect, useRef } from "react";

export interface CurationKeyHandlers {
  next: () => void;
  prev: () => void;
  toggleQuickView: () => void;
  vote: () => void;
  reviewed: () => void;
  reviewedUpToHere: () => void;
  skip: () => void;
  snooze: () => void;
  flag: () => void;
  note: () => void;
  recommend: () => void;
  openExternal: () => void;
  help: () => void;
}

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * True when a keydown must be ignored: an editable target, an open modal
 * (`#modal-dialog-container` has children) other than the desk's own quick
 * view drawer, an open vote slider (it renders inline in `.tooltiptext`, not
 * in the modal container) or a Ctrl/Meta/Alt chord.
 */
export function isKeyboardInert(
  event: Pick<KeyboardEvent, "target" | "ctrlKey" | "metaKey" | "altKey">,
  doc: Document = document
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (target && typeof target.tagName === "string") {
    if (EDITABLE.has(target.tagName) || target.isContentEditable) return true;
    if (target.closest?.('[contenteditable="true"]')) return true;
  }
  const modal = doc.getElementById("modal-dialog-container");
  if (modal) {
    for (const child of Array.from(modal.children)) {
      if (!child.querySelector("[data-curation-drawer]")) return true;
    }
  }
  if (doc.querySelector('.entry-vote-btn[aria-expanded="true"]')) return true;
  return false;
}

/** Maps one keydown to a handler name, or null. */
export function keyToAction(event: Pick<KeyboardEvent, "key" | "shiftKey">): keyof CurationKeyHandlers | null {
  const { key, shiftKey } = event;
  if (shiftKey) {
    if (key === "R") return "reviewedUpToHere";
    if (key === "O") return "openExternal";
    if (key === "?") return "help";
    return null;
  }
  switch (key) {
    case "j":
    case "ArrowDown":
      return "next";
    case "k":
    case "ArrowUp":
      return "prev";
    case "Enter":
    case "o":
      return "toggleQuickView";
    case "v":
      return "vote";
    case "r":
      return "reviewed";
    case "s":
    case "ArrowRight":
      return "skip";
    case "z":
      return "snooze";
    case "f":
      return "flag";
    case "n":
      return "note";
    case "x":
      return "recommend";
    case "?":
      return "help";
    default:
      return null;
  }
}

/**
 * One document keydown listener for the desk. The quick view drawer is the
 * one modal that keeps the keys alive (it carries `data-curation-drawer`).
 */
export function useCurationKeyboard(handlers: CurationKeyHandlers, enabled: boolean) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = keyToAction(event);
      if (!action) return;
      if (isKeyboardInert(event)) return;
      event.preventDefault();
      handlersRef.current[action]();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
