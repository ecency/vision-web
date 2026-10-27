"use client";

import { searchIconSvg } from "@ui/icons";
import { Button } from "@ui/button";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "./navbar-search-dynamic";

const preloadSearch = () => {
  void import("@/features/shared/navbar/search");
};

/**
 * Desktop navbar search, collapsed to an icon. Clicking it opens the input over
 * the navbar to its left, so nothing else in the bar moves.
 *
 * Search stays mounted after the first open (only hidden when closed), so its
 * dialogs (transfer, bookmarks, drafts, gallery), which are portaled to body,
 * survive the search closing. The heavy chunk loads on hover/focus or click,
 * never on first paint. "/" opens it from the keyboard.
 */
export function NavbarSearchToggle() {
  const pathname = usePathname();
  const slotRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Never leave focus in the hidden input: "/" would read it as typing and
  // keyboard users would be lost. Escape hands focus back to the icon; other
  // closes just drop it, since the user is already moving somewhere else.
  const close = useCallback((returnFocus: boolean) => {
    const active = document.activeElement as HTMLElement | null;
    if (active && panelRef.current?.contains(active)) {
      if (returnFocus) {
        slotRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
      } else {
        active.blur();
      }
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    close(false);
  }, [pathname, close]);

  // "/" opens search, unless the user is typing or a dialog or sidebar is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) {
        return;
      }
      // Every modal and sidebar renders through @ui/modal, which unmounts when hidden.
      if (document.querySelector(".ecency-modal-content")) return;
      // The desktop bar also mounts (hidden) on phones; ignore it there.
      if (!slotRef.current?.offsetParent) return;
      e.preventDefault();
      setMounted(true);
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    // On first open the input mounts with autoFocus; on later opens refocus it.
    // Scoped to this panel: the mobile navbar has an input with the same id.
    panelRef.current?.querySelector("input")?.focus();

    const onPointerDown = (e: PointerEvent) => {
      // The icon lives in the slot too, so pressing it toggles instead of
      // closing here and reopening on click.
      if (!slotRef.current?.contains(e.target as Node)) close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const label = i18next.t("navbar.search");

  return (
    <div ref={slotRef} className="navbar-search-slot relative shrink-0">
      <Tooltip content={`${label} (/)`}>
        <Button
          appearance="gray-link"
          icon={searchIconSvg}
          aria-label={label}
          aria-expanded={open}
          onPointerEnter={preloadSearch}
          onFocus={preloadSearch}
          onClick={() => {
            setMounted(true);
            setOpen((v) => !v);
          }}
        />
      </Tooltip>
      {mounted && (
        <div
          ref={panelRef}
          role="search"
          className={
            open
              ? "absolute right-0 top-1/2 z-[110] w-[min(400px,50vw)] -translate-y-1/2"
              : "hidden"
          }
          // Submitting or picking a suggestion is done with search. Closing here
          // also covers a new query on /search, where only ?q changes and the
          // pathname effect above never fires.
          onKeyDown={(e) => {
            if (e.key === "Enter") close(false);
          }}
          onClick={(e) => {
            // Every link in the dropdown (suggestion, quick action, "more
            // results") ends the search; they carry no shared class to match.
            if ((e.target as HTMLElement).closest("a")) close(false);
          }}
        >
          <Search autoFocus={true} />
        </div>
      )}
    </div>
  );
}
