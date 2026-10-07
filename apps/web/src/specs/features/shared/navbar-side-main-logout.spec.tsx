import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const { push, setActiveUser, deleteUser, pathname } = vi.hoisted(() => ({
  push: vi.fn(),
  setActiveUser: vi.fn(),
  deleteUser: vi.fn(),
  pathname: { current: "/" }
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push })
}));

vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ setActiveUser, deleteUser })
}));

import { NavbarSideMainLogout } from "@/features/shared/navbar/sidebar/navbar-side-main-logout";

function logOutAsAliceOn(path: string) {
  pathname.current = path;
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: { username: "alice" } as never,
    username: "alice",
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn()
  } as ReturnType<typeof useActiveAccount>);
  render(<NavbarSideMainLogout />);
  fireEvent.click(screen.getByText("user-nav.logout"));
  fireEvent.click(screen.getByText("user-nav.just-logout"));
}

describe("NavbarSideMainLogout", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    pathname.current = "/";
  });

  it.each(["/@alice", "/@alice/wallet"])("goes home after logging out on %s", (path) => {
    logOutAsAliceOn(path);
    expect(setActiveUser).toHaveBeenCalledWith(null);
    expect(push).toHaveBeenCalledWith("/");
  });

  it.each(["/@alicebob", "/@alicebob/wallet", "/@alice-bob"])(
    "stays put after logging out on %s",
    (path) => {
      logOutAsAliceOn(path);
      expect(setActiveUser).toHaveBeenCalledWith(null);
      expect(push).not.toHaveBeenCalled();
    }
  );
});
