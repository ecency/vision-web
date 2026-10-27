import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const nav = vi.hoisted(() => ({ pathname: "/trending" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock("@/features/shared/navbar/search", () => ({ Search: () => null }));
// The real SuggestionList, so the test sees the real dropdown markup (an earlier
// hand-written mock had a class the real links lack, and hid a bug).
const selected = vi.hoisted(() => vi.fn());
vi.mock("@/features/shared/navbar/navbar-search-dynamic", async () => {
  const { SuggestionList } = await vi.importActual<
    typeof import("@/features/shared/suggestion-list")
  >("@/features/shared/suggestion-list");
  const modeItems = [
    {
      header: "actions",
      items: ["suggestion"],
      renderer: (x: string) => <span>{x}</span>,
      onSelect: selected
    }
  ];
  return {
    Search: ({ autoFocus }: { autoFocus?: boolean }) => (
      <SuggestionList items={[]} modeItems={modeItems} searchValue="query">
        <input type="text" id="navbar-search" aria-label="search input" autoFocus={autoFocus} />
      </SuggestionList>
    )
  };
});

import { NavbarSearchToggle } from "@/features/shared/navbar/navbar-search-toggle";

// jsdom does no layout, so offsetParent is always null; the shortcut uses it to
// skip the hidden desktop bar on phones. Pretend the bar is visible.
const offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    }
  });
});
afterAll(() => {
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, "offsetParent", offsetParent);
});

const toggle = () => screen.getByRole("button", { name: "navbar.search" });
const input = () => screen.queryByLabelText("search input");
const pressSlash = () => {
  const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
};
const NavbarTextMenuStub = () => <a href="#">menu link</a>;
const isOpen = () => toggle().getAttribute("aria-expanded") === "true";

describe("NavbarSearchToggle", () => {
  it("renders only the icon until first opened", () => {
    render(<NavbarSearchToggle />);
    expect(toggle()).toBeInTheDocument();
    expect(input()).toBeNull();
  });

  it("opens on click and focuses the input", () => {
    render(<NavbarSearchToggle />);
    fireEvent.click(toggle());
    expect(isOpen()).toBe(true);
    expect(input()).toHaveFocus();
  });

  it("closes on Escape and on an outside press, keeping the search mounted", () => {
    render(
      <>
        <NavbarSearchToggle />
        <p>outside</p>
      </>
    );
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(isOpen()).toBe(false);
    // Kept mounted so dialogs opened from search survive it closing.
    expect(input()).toBeInTheDocument();

    fireEvent.click(toggle());
    expect(isOpen()).toBe(true);
    expect(input()).toHaveFocus();
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(isOpen()).toBe(false);
  });

  it("stays open when pressing inside the search", () => {
    render(<NavbarSearchToggle />);
    fireEvent.click(toggle());
    fireEvent.pointerDown(input()!);
    expect(isOpen()).toBe(true);
  });

  it("opens with the / key", () => {
    render(<NavbarSearchToggle />);
    const event = pressSlash();
    expect(isOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it("returns focus to the icon on Escape, so / can reopen search", () => {
    render(<NavbarSearchToggle />);
    fireEvent.click(toggle());
    expect(input()).toHaveFocus();
    fireEvent.keyDown(input()!, { key: "Escape" });
    expect(isOpen()).toBe(false);
    expect(toggle()).toHaveFocus();
    pressSlash();
    expect(isOpen()).toBe(true);
    expect(input()).toHaveFocus();
  });

  it("closes and releases focus on submit, covering a new query on /search", () => {
    render(<NavbarSearchToggle />);
    fireEvent.click(toggle());
    fireEvent.keyDown(input()!, { key: "Enter" });
    expect(isOpen()).toBe(false);
    expect(input()).not.toHaveFocus();
  });

  it("closes when a suggestion or quick action is picked", () => {
    render(<NavbarSearchToggle />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByText("suggestion"));
    expect(selected).toHaveBeenCalledWith("suggestion");
    expect(isOpen()).toBe(false);
  });

  it("closes on more results, which can stay on the same pathname", () => {
    render(<NavbarSearchToggle />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByText("g.more-results"));
    expect(isOpen()).toBe(false);
  });

  it("ignores / while a dialog or sidebar is open", () => {
    render(
      <>
        <NavbarSearchToggle />
        <div className="ecency-modal-content">
          <button>close</button>
        </div>
      </>
    );
    screen.getByRole("button", { name: "close" }).focus();
    pressSlash();
    expect(isOpen()).toBe(false);
  });

  it("focuses its own input, not the mobile one with the same id", () => {
    render(
      <>
        <input id="navbar-search" aria-label="mobile search" />
        <NavbarSearchToggle />
      </>
    );
    fireEvent.click(toggle());
    fireEvent.keyDown(input()!, { key: "Escape" });
    fireEvent.click(toggle());
    expect(input()).toHaveFocus();
  });

  it("draws the open field in the anchor, and pressing inside it keeps it open", () => {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-testid", "menu-area");
    document.body.appendChild(anchor);
    try {
      render(
        <>
          <NavbarTextMenuStub />
          <NavbarSearchToggle anchor={anchor} />
        </>
      );
      fireEvent.click(toggle());
      expect(anchor).toContainElement(input());
      fireEvent.pointerDown(input()!);
      expect(isOpen()).toBe(true);
      fireEvent.pointerDown(screen.getByText("menu link"));
      expect(isOpen()).toBe(false);
    } finally {
      anchor.remove();
    }
  });

  it("ignores / while typing in another field", () => {
    render(
      <>
        <NavbarSearchToggle />
        <textarea aria-label="comment" />
      </>
    );
    fireEvent.keyDown(screen.getByLabelText("comment"), { key: "/" });
    expect(isOpen()).toBe(false);
  });

  it("closes when the route changes", () => {
    const { rerender } = render(<NavbarSearchToggle />);
    fireEvent.click(toggle());
    nav.pathname = "/created";
    rerender(<NavbarSearchToggle />);
    expect(isOpen()).toBe(false);
  });
});
