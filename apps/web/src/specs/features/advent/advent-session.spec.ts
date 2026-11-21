import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const rs = vi.hoisted(() => ({
  session: null as null | { account: string; token: string; expiresAt: string; ecency?: boolean },
  clearSession: vi.fn(),
  saveSession: vi.fn(),
  signOut: vi.fn(async () => ({ ok: true })),
  signIn: vi.fn(),
  signerFor: vi.fn(() => "ecency" as const)
}));
vi.mock("@/features/raidstead/client", () => ({
  loadSession: () => rs.session,
  clearSession: () => {
    rs.clearSession();
    rs.session = null;
  },
  saveSession: (s: typeof rs.session) => {
    rs.saveSession(s);
    rs.session = s;
  },
  raidsteadApi: { signOut: rs.signOut },
  signIn: rs.signIn,
  signerFor: rs.signerFor
}));
const hydration = vi.hoisted(() => ({ hydrated: false }));
vi.mock("@/api/queries", () => ({ useHydrated: () => hydration.hydrated }));

import { useAdventSession } from "@/features/advent/use-advent-session";

const live = (account: string, ecency = true) => ({
  account,
  token: "t-" + account,
  expiresAt: "2099-01-01T00:00:00Z",
  ecency
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  hydration.hydrated = false;
  rs.session = null;
});

describe("advent game session", () => {
  it("keeps a valid session through a reload, before the Ecency user is known", async () => {
    rs.session = live("maria");
    const { result, rerender } = renderHook(({ u }) => useAdventSession(u), {
      initialProps: { u: null as string | null }
    });
    expect(rs.clearSession).not.toHaveBeenCalled();
    hydration.hydrated = true;
    rerender({ u: "maria" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(rs.clearSession).not.toHaveBeenCalled();
    expect(rs.signOut).not.toHaveBeenCalled();
    expect(rs.signIn).not.toHaveBeenCalled();
  });

  it("leaves a Raidstead guest session alone while nobody is logged in", async () => {
    hydration.hydrated = true;
    rs.session = live("guestie", false);
    const { result } = renderHook(() => useAdventSession(null));
    await waitFor(() => expect(result.current.status).toBe("none"));
    expect(rs.clearSession).not.toHaveBeenCalled();
  });

  it("ends a session made for an Ecency login once logged out", async () => {
    hydration.hydrated = true;
    rs.session = live("maria");
    renderHook(() => useAdventSession(null));
    await waitFor(() => expect(rs.clearSession).toHaveBeenCalled());
    expect(rs.signOut).toHaveBeenCalled();
  });

  it("does not overwrite a session another tab saved meanwhile", async () => {
    hydration.hydrated = true;
    localStorage.setItem("ecency_active_user", JSON.stringify("maria"));
    rs.signIn.mockImplementation(async () => {
      rs.session = live("bob");
      return live("maria");
    });
    const { result } = renderHook(() => useAdventSession("maria"));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(rs.session?.account).toBe("bob");
  });

  it("drops only the session the server refused", async () => {
    hydration.hydrated = true;
    rs.session = live("maria");
    const { result } = renderHook(() => useAdventSession("maria"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    result.current.lost("an-older-token");
    expect(rs.clearSession).not.toHaveBeenCalled();
    result.current.lost("t-maria");
    expect(rs.clearSession).toHaveBeenCalled();
  });

  it("never uses a session for another account, and signs in as the reader", async () => {
    hydration.hydrated = true;
    rs.session = live("bob");
    // the Ecency login every tab shares
    localStorage.setItem("ecency_active_user", JSON.stringify("maria"));
    rs.signIn.mockResolvedValue(live("maria"));
    const { result } = renderHook(() => useAdventSession("maria"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(rs.clearSession).toHaveBeenCalled();
    expect(rs.session?.account).toBe("maria");
  });

  it("signs in again once after a refusal, then waits for the reader instead of looping", async () => {
    hydration.hydrated = true;
    localStorage.setItem("ecency_active_user", JSON.stringify("maria"));
    rs.signIn.mockImplementation(async () => live("maria"));
    const { result } = renderHook(() => useAdventSession("maria"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    result.current.lost("t-maria");
    await waitFor(() => expect(rs.signIn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    result.current.lost("t-maria");
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(rs.signIn).toHaveBeenCalledTimes(2);
  });
});
