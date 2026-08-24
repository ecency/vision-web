import { vi } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

let pathname = "/";
const toggleUiProp = vi.fn();
const useActiveAccount = vi.fn(() => ({ activeUser: { username: "tester" } as { username: string } | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ src, alt, ...rest }: any) => <img src={typeof src === "string" ? src : ""} alt={alt} {...rest} />
}));
vi.mock("next/dynamic", () => ({
  // Render the dynamically-imported in-navbar search as a lightweight stub.
  default: () => function MobileSearchStub() {
    return <input data-testid="mobile-search" aria-label="search input" />;
  }
}));
vi.mock("@/api/queries", () => ({ useHydrated: () => true }));
vi.mock("@/core/global-store", () => ({ useGlobalStore: (s: any) => s({ toggleUiProp }) }));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => useActiveAccount() }));
vi.mock("@/features/chat/mattermost-api", () => ({ useMattermostUnread: () => ({ data: undefined }) }));
vi.mock("@/utils", () => ({
  isInAppBrowser: () => false,
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@/defaults", () => ({ default: { logo: "/logo.png" } }));
vi.mock("@/features/shared/user-avatar", () => ({
  UserAvatar: ({ username }: { username: string }) => <span data-testid="avatar">{username}</span>
}));
vi.mock("@/features/shared/navbar/navbar-notifications-button", () => ({
  NavbarNotificationsButton: () => <button data-testid="notifications">notifs</button>
}));
vi.mock("@/features/shared/navbar/navbar-main-sidebar", () => ({ NavbarMainSidebar: () => null }));
vi.mock("@/features/shared/navbar/sidebar/navbar-side", () => ({ NavbarSide: () => null }));

import { NavbarMobile } from "@/features/shared/navbar/navbar-mobile";

function renderNav(over: Partial<React.ComponentProps<typeof NavbarMobile>> = {}) {
  const setMainBarExpanded = vi.fn();
  const setExpanded = vi.fn();
  const utils = render(
    <NavbarMobile
      step={2}
      setStepOne={vi.fn()}
      expanded={false}
      setExpanded={setExpanded}
      mainBarExpanded={false}
      setMainBarExpanded={setMainBarExpanded}
      {...over}
    />
  );
  return { setMainBarExpanded, setExpanded, ...utils };
}

describe("NavbarMobile", () => {
  beforeEach(() => {
    pathname = "/";
    vi.clearAllMocks();
    useActiveAccount.mockReturnValue({ activeUser: { username: "tester" } });
  });

  test("renders the brand cluster (menu + logo) and the primary tabs", () => {
    renderNav();
    expect(screen.getByAltText("Ecency")).toBeInTheDocument(); // logo
    expect(screen.getByLabelText("navbar.toggle-menu")).toBeInTheDocument(); // ☰
    expect(screen.getByLabelText("navbar.search")).toBeInTheDocument();
    expect(screen.getByLabelText("navbar.home")).toBeInTheDocument();
    expect(screen.getByLabelText("navbar.waves")).toBeInTheDocument();
    expect(screen.getByLabelText("navbar.chats")).toBeInTheDocument();
    expect(screen.getByLabelText("navbar.post")).toBeInTheDocument(); // compose FAB
    expect(screen.getByTestId("notifications")).toBeInTheDocument();
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  test("marks Home active via aria-current on the hot feed", () => {
    pathname = "/hot";
    renderNav();
    expect(screen.getByLabelText("navbar.home")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("navbar.chats")).not.toHaveAttribute("aria-current", "page");
  });

  test("tapping search expands an in-navbar search input and can be closed", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("navbar.search"));
    // search mode: brand/menu replaced by a close control + the search input
    expect(screen.getByLabelText("g.close")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-search")).toBeInTheDocument();
    expect(screen.queryByLabelText("navbar.toggle-menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("g.close"));
    expect(screen.getByLabelText("navbar.toggle-menu")).toBeInTheDocument();
  });

  test("keeps Home active across other feed sorts (e.g. /trending)", () => {
    pathname = "/trending";
    renderNav();
    expect(screen.getByLabelText("navbar.home")).toHaveAttribute("aria-current", "page");
  });

  test("marks Chats active via aria-current on the chats route", () => {
    pathname = "/chats";
    renderNav();
    expect(screen.getByLabelText("navbar.chats")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("navbar.home")).not.toHaveAttribute("aria-current", "page");
  });

  test("the menu button opens the browse/governance drawer", () => {
    const { setMainBarExpanded } = renderNav();
    fireEvent.click(screen.getByLabelText("navbar.toggle-menu"));
    expect(setMainBarExpanded).toHaveBeenCalledWith(true);
  });

  test("shows Login (not notifications/avatar) for logged-out users", () => {
    useActiveAccount.mockReturnValue({ activeUser: null });
    renderNav();
    expect(screen.getByText("g.login")).toBeInTheDocument();
    expect(screen.queryByTestId("avatar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("notifications")).not.toBeInTheDocument();
    // Home / Chats / brand stay available to anonymous users
    expect(screen.getByLabelText("navbar.home")).toBeInTheDocument();
    expect(screen.getByAltText("Ecency")).toBeInTheDocument();
  });
});
