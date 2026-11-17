import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

// The HiveSigner login callback (/auth?code=...) only signs in when the login
// was started in this tab: the authorize URL carries a one-time state value
// that the callback must bring back.

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  renew: vi.fn(),
  toggle: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => h.params
}));
vi.mock("@/api/mutations", () => ({
  useHsLoginRefresh: () => ({ mutateAsync: h.renew }),
  useRecordUserActivity: () => ({ mutateAsync: vi.fn(async () => undefined) })
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (pick: (s: any) => unknown) =>
    pick({ addUser: vi.fn(), setActiveUser: vi.fn(), toggleUiProp: h.toggle })
}));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry: { captureException: vi.fn() } }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<any>("@/utils/hive-signer")),
  validateToken: () => true
}));

import { AuthPage } from "@/app/auth/_page";
import { getAuthUrl } from "@/utils/hive-signer";

const stateOf = (url: string) => new URL(url).searchParams.get("state");

beforeEach(() => {
  sessionStorage.clear();
  h.push.mockClear();
  h.renew.mockReset();
  h.renew.mockResolvedValue({ username: "alice", access_token: "a", refresh_token: "r", expires_in: 1 });
});

describe("getAuthUrl", () => {
  it("carries a fresh state each time", () => {
    const a = stateOf(getAuthUrl("ecency.app", "https://ecency.com/auth"));
    const b = stateOf(getAuthUrl("ecency.app", "https://ecency.com/auth"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("AuthPage", () => {
  it("signs in when the callback brings back this tab's state", async () => {
    const state = stateOf(getAuthUrl("ecency.app", "https://ecency.com/auth"))!;
    h.params = new URLSearchParams({ code: "c", state });
    render(<AuthPage />);
    await waitFor(() => expect(h.renew).toHaveBeenCalledWith({ code: "c" }));
  });

  it.each([
    ["no state", { code: "c" }],
    ["another state", { code: "c", state: "0".repeat(32) }]
  ])("does not sign in with %s", async (_label, params) => {
    getAuthUrl("ecency.app", "https://ecency.com/auth");
    h.params = new URLSearchParams(params);
    render(<AuthPage />);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/"));
    expect(h.renew).not.toHaveBeenCalled();
  });

  it("survives the mount effect running twice (React strict mode)", async () => {
    const state = stateOf(getAuthUrl("ecency.app", "https://ecency.com/auth"))!;
    h.params = new URLSearchParams({ code: "c2", state });
    render(
      <React.StrictMode>
        <AuthPage />
      </React.StrictMode>
    );
    await waitFor(() => expect(h.renew).toHaveBeenCalledWith({ code: "c2" }));
    expect(h.push).not.toHaveBeenCalledWith("/");
  });

  it("uses a state only once", async () => {
    const state = stateOf(getAuthUrl("ecency.app", "https://ecency.com/auth"))!;
    h.params = new URLSearchParams({ code: "c", state });
    render(<AuthPage />).unmount();
    await waitFor(() => expect(h.renew).toHaveBeenCalledTimes(1));
    render(<AuthPage />);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/"));
    expect(h.renew).toHaveBeenCalledTimes(1);
  });
});
