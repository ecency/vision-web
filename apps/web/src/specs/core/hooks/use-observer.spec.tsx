import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useObserver } from "@/core/hooks/use-observer";
import { DEFAULT_OBSERVER } from "@/consts/observer";

const state = { activeUser: null as { username: string } | null };

vi.mock("@/core/global-store", () => ({
  useGlobalStore: vi.fn((selector: (s: any) => any) => selector(state))
}));

describe("useObserver", () => {
  it("resolves to the shared moderation account when logged out", () => {
    state.activeUser = null;

    const { result } = renderHook(() => useObserver());

    expect(result.current).toBe(DEFAULT_OBSERVER);
    expect(result.current).toBe("ecency");
  });

  it("resolves to the logged-in username", () => {
    state.activeUser = { username: "alice" };

    const { result } = renderHook(() => useObserver());

    expect(result.current).toBe("alice");
  });

  // The hydration contract. `activeUser` is null during SSR and stays null
  // through the first client render (client-init.tsx restores it in useMount),
  // so the observer must resolve identically in both. If this hook ever starts
  // reading the active-user cookie directly it would return the username on the
  // client while the server returned DEFAULT_OBSERVER, mismatching the markup
  // and the dehydrated query cache.
  it("resolves the same before the store rehydrates as it does on the server", () => {
    state.activeUser = null;
    const { result: serverPass } = renderHook(() => useObserver());

    state.activeUser = null;
    const { result: firstClientRender } = renderHook(() => useObserver());

    expect(firstClientRender.current).toBe(serverPass.current);
  });
});
