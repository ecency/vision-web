import { vi } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { IntentLink } from "@/features/shared/intent-link";
import { EntryLink } from "@/features/shared/entry-link";
import { ProfileLink } from "@/features/shared/profile-link";

function makeRouter() {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    hmrRefresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  };
}

function renderWithRouter(ui: React.ReactElement, router = makeRouter()) {
  const result = render(
    <AppRouterContext.Provider value={router as never}>{ui}</AppRouterContext.Provider>
  );
  return { ...result, router };
}

describe("IntentLink (#1593)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as Navigator & { connection?: unknown }).connection;
  });

  it("renders a plain anchor with the href and no viewport prefetch", () => {
    renderWithRouter(
      <IntentLink href="/@alice" className="x">
        alice
      </IntentLink>
    );
    const link = screen.getByRole("link", { name: "alice" });
    expect(link).toHaveAttribute("href", "/@alice");
    expect(link).toHaveClass("x");
  });

  it("prefetches once on hover with the same kind as a viewport prefetch", () => {
    const { router } = renderWithRouter(<IntentLink href="/@alice">alice</IntentLink>);
    const link = screen.getByRole("link");
    fireEvent.mouseEnter(link);
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    expect(router.prefetch).toHaveBeenCalledTimes(1);
    expect(router.prefetch).toHaveBeenCalledWith("/@alice", { kind: "auto" });
  });

  it("prefetches on touchstart, for readers without a hover", () => {
    const { router } = renderWithRouter(<IntentLink href="/hot/hive-125125">c</IntentLink>);
    fireEvent.touchStart(screen.getByRole("link"));
    expect(router.prefetch).toHaveBeenCalledWith("/hot/hive-125125", { kind: "auto" });
  });

  it("still calls the caller's own hover/touch/focus handlers", () => {
    const onMouseEnter = vi.fn();
    const onTouchStart = vi.fn();
    const onFocus = vi.fn();
    renderWithRouter(
      <IntentLink
        href="/@alice"
        onMouseEnter={onMouseEnter}
        onTouchStart={onTouchStart}
        onFocus={onFocus}
      >
        alice
      </IntentLink>
    );
    const link = screen.getByRole("link");
    fireEvent.mouseEnter(link);
    fireEvent.touchStart(link);
    fireEvent.focus(link);
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(onTouchStart).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("does not prefetch external links or links that open a new tab", () => {
    const { router } = renderWithRouter(
      <>
        <IntentLink href="https://maps.google.com/?q=1,2">map</IntentLink>
        <IntentLink href="/@alice" target="_blank">
          tab
        </IntentLink>
        <IntentLink href="/@alice" target="_BLANK">
          TAB
        </IntentLink>
        <IntentLink href="//evil.example/x">proto</IntentLink>
      </>
    );
    for (const name of ["map", "tab", "TAB", "proto"]) {
      fireEvent.mouseEnter(screen.getByRole("link", { name }));
    }
    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it("does not prefetch on a data-saver or 2g connection", () => {
    (navigator as Navigator & { connection?: unknown }).connection = { saveData: true };
    const { router } = renderWithRouter(<IntentLink href="/@alice">alice</IntentLink>);
    fireEvent.mouseEnter(screen.getByRole("link"));
    expect(router.prefetch).not.toHaveBeenCalled();

    (navigator as Navigator & { connection?: unknown }).connection = { effectiveType: "slow-2g" };
    const { router: second } = renderWithRouter(<IntentLink href="/@bob">bob</IntentLink>);
    fireEvent.mouseEnter(screen.getByRole("link", { name: "bob" }));
    expect(second.prefetch).not.toHaveBeenCalled();
  });

  it("is inert without an app router (tests, trees without a router)", () => {
    render(<IntentLink href="/@alice">alice</IntentLink>);
    expect(() => fireEvent.mouseEnter(screen.getByRole("link"))).not.toThrow();
  });

  it("swallows a prefetch that throws and lets the next intent retry", () => {
    const router = makeRouter();
    router.prefetch.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    renderWithRouter(<IntentLink href="/@alice">alice</IntentLink>, router);
    const link = screen.getByRole("link");
    expect(() => fireEvent.mouseEnter(link)).not.toThrow();
    fireEvent.mouseEnter(link);
    fireEvent.mouseEnter(link);
    expect(router.prefetch).toHaveBeenCalledTimes(2);
  });

  it("re-arms when the href changes", () => {
    const router = makeRouter();
    const { rerender } = render(
      <AppRouterContext.Provider value={router as never}>
        <IntentLink href="/@alice">who</IntentLink>
      </AppRouterContext.Provider>
    );
    fireEvent.mouseEnter(screen.getByRole("link"));
    rerender(
      <AppRouterContext.Provider value={router as never}>
        <IntentLink href="/@bob">who</IntentLink>
      </AppRouterContext.Provider>
    );
    fireEvent.mouseEnter(screen.getByRole("link"));
    expect(router.prefetch.mock.calls.map((c) => c[0])).toEqual(["/@alice", "/@bob"]);
  });
});

describe("shared link wrappers prefetch on intent only (#1593)", () => {
  it("EntryLink", () => {
    const { router } = renderWithRouter(
      <EntryLink entry={{ category: "hive-125125", author: "alice", permlink: "post" }}>
        post
      </EntryLink>
    );
    const link = screen.getByRole("link", { name: "post" });
    expect(link).toHaveAttribute("href", "/@alice/post");
    expect(router.prefetch).not.toHaveBeenCalled();
    fireEvent.mouseEnter(link);
    expect(router.prefetch).toHaveBeenCalledWith("/@alice/post", { kind: "auto" });
  });

  it("ProfileLink", () => {
    const afterClick = vi.fn();
    const { router } = renderWithRouter(
      <ProfileLink username="alice" afterClick={afterClick}>
        <span>alice</span>
      </ProfileLink>
    );
    const link = screen.getByRole("link", { name: "@alice" });
    fireEvent.mouseEnter(link);
    expect(router.prefetch).toHaveBeenCalledWith("/@alice", { kind: "auto" });
    // jsdom has no navigation; stop the default so only the click handlers run.
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(afterClick).toHaveBeenCalledTimes(1);
  });
});
