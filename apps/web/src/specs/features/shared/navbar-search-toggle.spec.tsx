import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const nav = vi.hoisted(() => ({ pathname: "/trending" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/features/shared/navbar/search", () => ({ Search: () => null }));
vi.mock("@/features/shared/navbar/navbar-search-dynamic", () => ({
  Search: ({ autoFocus }: { autoFocus?: boolean }) => (
    <input id="navbar-search" aria-label="search input" autoFocus={autoFocus} />
  )
}));

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
const input = () => document.getElementById("navbar-search");
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
    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(isOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(true);
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
