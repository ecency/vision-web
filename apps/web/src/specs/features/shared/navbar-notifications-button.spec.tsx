import { vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

type UnreadResult = { data: number | undefined; isPlaceholderData: boolean };
let unreadResult: UnreadResult = { data: undefined, isPlaceholderData: false };

vi.mock("@tanstack/react-query", () => ({ useQuery: () => unreadResult }));
vi.mock("@ecency/sdk", () => ({ getNotificationsUnreadCountQueryOptions: vi.fn(() => ({})) }));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (s: any) => s({ toggleUiProp: vi.fn(), globalNotifications: true })
}));
vi.mock("@/core/hooks", () => ({
  useActiveAccount: () => ({ activeUser: { username: "tester" } })
}));
vi.mock("@/utils", () => ({ getAccessToken: vi.fn(() => "mock-token") }));
vi.mock("@/config", () => ({
  EcencyConfigManager: { Conditional: ({ children }: any) => <>{children}</> }
}));
vi.mock("@ui/tooltip", () => ({ Tooltip: ({ children }: any) => <>{children}</> }));
vi.mock("@ui/button", () => ({
  Button: ({ iconClassName, icon, appearance, onAnimationEnd, ...rest }: any) => (
    <button data-testid="bell" data-icon-class={iconClassName} {...rest} />
  )
}));
vi.mock("@ui/svg", () => ({ bellSvg: null, bellOffSvg: null }));

import { NavbarNotificationsButton } from "@/features/shared/navbar/navbar-notifications-button";

const ringing = () =>
  screen.getByTestId("bell").getAttribute("data-icon-class")?.includes("animate-bell-ring");

describe("NavbarNotificationsButton", () => {
  beforeEach(() => {
    unreadResult = { data: undefined, isPlaceholderData: false };
  });

  test("the count loaded on page load does not ring the bell", () => {
    // The first request is running: the options' placeholder 0 is shown.
    unreadResult = { data: 0, isPlaceholderData: true };
    const { rerender } = render(<NavbarNotificationsButton />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();

    unreadResult = { data: 5, isPlaceholderData: false };
    rerender(<NavbarNotificationsButton />);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(ringing()).toBe(false);
  });

  test("a count that rises while the page is open rings the bell", () => {
    unreadResult = { data: 5, isPlaceholderData: false };
    const { rerender } = render(<NavbarNotificationsButton />);
    expect(ringing()).toBe(false);

    unreadResult = { data: 6, isPlaceholderData: false };
    rerender(<NavbarNotificationsButton />);

    expect(screen.getByText("6")).toBeInTheDocument();
    expect(ringing()).toBe(true);
  });

  test("no count yet renders no badge", () => {
    render(<NavbarNotificationsButton />);
    expect(screen.getByTestId("bell")).toHaveAttribute("aria-label", "user-nav.notifications");
  });
});
