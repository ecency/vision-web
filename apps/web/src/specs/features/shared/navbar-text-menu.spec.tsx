import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/api/queries", () => ({
  useHydrated: () => true
}));

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current
}));

import { NavbarTextMenu } from "@/features/shared/navbar/navbar-text-menu";

const mockedUseActiveAccount = vi.mocked(useActiveAccount);

function setLoggedIn(loggedIn: boolean) {
  mockedUseActiveAccount.mockReturnValue({
    activeUser: loggedIn ? ({ username: "alice" } as never) : null,
    username: loggedIn ? "alice" : null,
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: loggedIn,
    error: null,
    refetch: vi.fn()
  } as ReturnType<typeof useActiveAccount>);
}

describe("NavbarTextMenu — auth-aware Decks/Communities slot", () => {
  beforeEach(() => {
    setLoggedIn(false);
    pathname.current = "/";
  });

  it("shows Communities (and hides Decks) for logged-out visitors", () => {
    render(<NavbarTextMenu />);

    expect(screen.getByRole("link", { name: "navbar.communities" }).getAttribute("href")).toBe(
      "/communities"
    );
    expect(screen.queryByRole("link", { name: "navbar.decks" })).toBeNull();
  });

  it("shows Decks (and hides Communities) once logged in", () => {
    setLoggedIn(true);
    render(<NavbarTextMenu />);

    expect(screen.getByRole("link", { name: "navbar.decks" }).getAttribute("href")).toBe("/decks");
    expect(screen.queryByRole("link", { name: "navbar.communities" })).toBeNull();
  });

  it("always keeps Discover and Waves regardless of auth", () => {
    render(<NavbarTextMenu />);

    expect(screen.getByRole("link", { name: "navbar.discover" }).getAttribute("href")).toBe(
      "/discover"
    );
    expect(screen.getByRole("link", { name: "navbar.waves" }).getAttribute("href")).toBe("/waves");
  });

  it.each([false, true])("ends with Raidstead, logged in: %s", (loggedIn) => {
    setLoggedIn(loggedIn);
    render(<NavbarTextMenu />);

    const links = screen.getAllByRole("link");
    expect(links[links.length - 1].getAttribute("href")).toBe("/raidstead");
    expect(links[links.length - 1].textContent).toBe("navbar.raidstead");
  });
});

describe("NavbarTextMenu — current section", () => {
  beforeEach(() => setLoggedIn(false));
  afterEach(() => {
    pathname.current = "/";
  });

  it("highlights Raidstead on the game page", () => {
    pathname.current = "/raidstead";
    render(<NavbarTextMenu />);
    expect(
      screen.getByRole("link", { name: "navbar.raidstead" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("highlights nothing on a post whose permlink starts with a section name", () => {
    pathname.current = "/@ecency/raidstead-your-community-against-the";
    render(<NavbarTextMenu />);
    for (const link of screen.getAllByRole("link"))
      expect(link.getAttribute("aria-current")).toBeNull();
  });
});

describe("NavbarTextMenu — links that do not fit", () => {
  // jsdom has no layout: fake each link's row (offsetTop) and drive the
  // ResizeObserver by hand, the way a resize, font load or relabel would.
  const rowOf = new Map<string, number>();
  let observed: Element[] = [];
  let fire = () => {};
  const offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");

  beforeEach(() => {
    setLoggedIn(false);
    rowOf.clear();
    observed = [];
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        return (rowOf.get(this.getAttribute("href") ?? "") ?? 0) * 48;
      }
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          fire = () => act(() => cb());
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (offsetTop) Object.defineProperty(HTMLElement.prototype, "offsetTop", offsetTop);
  });

  // hidden: true, since role queries skip visibility:hidden links by default
  const link = (href: string) =>
    screen.getAllByRole("link", { hidden: true }).find((a) => a.getAttribute("href") === href)!;

  it("watches every link as well as the menu, so a font load or relabel re-checks", () => {
    render(<NavbarTextMenu />);
    for (const a of screen.getAllByRole("link")) expect(observed).toContain(a);
    expect(observed).toContain(link("/discover").parentElement);
  });

  it("hides links on the clipped row and shows them again once they fit", () => {
    render(<NavbarTextMenu />);
    rowOf.set("/raidstead", 1);
    fire();
    expect(link("/raidstead").style.visibility).toBe("hidden");
    expect(link("/discover").style.visibility).toBe("");

    // e.g. the web font finished loading and the labels got narrower
    rowOf.clear();
    fire();
    expect(link("/raidstead").style.visibility).toBe("");
  });

  it("moves focus to the last visible link when the focused one is clipped", () => {
    render(<NavbarTextMenu />);
    link("/raidstead").focus();
    rowOf.set("/raidstead", 1);
    fire();
    expect(link("/raidstead").style.visibility).toBe("hidden");
    expect(document.activeElement).toBe(link("/communities"));
  });
});
