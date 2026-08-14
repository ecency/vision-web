import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";

const getConfigValue = vi.fn();
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (...args: unknown[]) => getConfigValue(...args)
  }
}));

// The dialog is lazy-loaded and pulls the whole mutation/SDK chain; the hook's
// contract is only whether it is mounted, so stand it in with a marker.
vi.mock("next/dynamic", () => ({
  default: () => () => null
}));

import { useRcTopupAction } from "@/features/shared/rc-topup/use-rc-topup-action";

describe("useRcTopupAction", () => {
  const openSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "open", { value: openSpy, writable: true });
  });

  describe("when the RC top-up product is live", () => {
    beforeEach(() => getConfigValue.mockReturnValue(true));

    it("mounts the dialog rather than navigating away", () => {
      const { result } = renderHook(() => useRcTopupAction("alice"));

      expect(result.current.dialog).toBeNull();
      act(() => result.current.openTopup());

      expect(result.current.dialog).not.toBeNull();
      expect(openSpy).not.toHaveBeenCalled();
    });

    /**
     * Regression: the dialog resolves its account from useActiveAccount and
     * its mutation spends that account's Points. Left mounted across a switch
     * it would spend account B's Points for a shortfall belonging to A.
     */
    it("closes the dialog when the active account changes", () => {
      const { result, rerender } = renderHook(({ user }) => useRcTopupAction(user), {
        initialProps: { user: "alice" }
      });

      act(() => result.current.openTopup());
      expect(result.current.dialog).not.toBeNull();

      rerender({ user: "bob" });

      expect(result.current.dialog).toBeNull();
    });

    it("closes the dialog on sign-out", () => {
      const { result, rerender } = renderHook(({ user }) => useRcTopupAction(user), {
        initialProps: { user: "alice" as string | undefined }
      });

      act(() => result.current.openTopup());
      rerender({ user: undefined });

      expect(result.current.dialog).toBeNull();
    });

    it("stays open across an unrelated re-render", () => {
      const { result, rerender } = renderHook(({ user }) => useRcTopupAction(user), {
        initialProps: { user: "alice" }
      });

      act(() => result.current.openTopup());
      rerender({ user: "alice" });

      expect(result.current.dialog).not.toBeNull();
    });
  });

  describe("when the RC top-up product is off", () => {
    beforeEach(() => getConfigValue.mockReturnValue(false));

    it("falls back to the boost purchase page for that account", () => {
      const { result } = renderHook(() => useRcTopupAction("alice"));

      act(() => result.current.openTopup());

      expect(result.current.dialog).toBeNull();
      const [url] = openSpy.mock.calls[0];
      expect(url).toContain("username=alice");
      expect(url).toContain("type=boost");
    });

    it("opens the fallback without leaking the opener or the referrer", () => {
      const { result } = renderHook(() => useRcTopupAction("alice"));

      act(() => result.current.openTopup());

      const [, target, features] = openSpy.mock.calls[0];
      expect(target).toBe("_blank");
      expect(features).toContain("noopener");
      expect(features).toContain("noreferrer");
    });

    it("encodes account names that would otherwise break the query string", () => {
      const { result } = renderHook(() => useRcTopupAction("a b&c"));

      act(() => result.current.openTopup());

      expect(openSpy.mock.calls[0][0]).toContain("username=a%20b%26c");
    });

    it("does nothing without a signed-in account", () => {
      const { result } = renderHook(() => useRcTopupAction(undefined));

      act(() => result.current.openTopup());

      expect(openSpy).not.toHaveBeenCalled();
    });
  });
});
