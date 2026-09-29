import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/api/queries", () => ({
  useHydrated: () => true
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
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
  beforeEach(() => setLoggedIn(false));

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
