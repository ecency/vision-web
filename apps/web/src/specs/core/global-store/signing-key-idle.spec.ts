import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSigningKeyActions,
  createSigningKeyState,
  SIGNING_KEY_IDLE_MS
} from "@/core/global-store/modules/signing-key-module";

// A key entered to sign is dropped after the same idle window as the session
// active key (utils/session-active-key.ts), not kept for the life of the page.

function store() {
  let state = createSigningKeyState();
  const actions = createSigningKeyActions(
    (partial) => {
      state = { ...state, ...partial };
    },
    () => state
  );
  return { actions, get: () => state };
}

afterEach(() => vi.useRealTimers());

describe("signing key", () => {
  it("is dropped once the idle window passes", () => {
    vi.useFakeTimers();
    const s = store();
    s.actions.setSigningKey("5JZABPReZZqYBvrFYDAhmN6NQ6r9wDn9B9FnXPNLixhBaAyRbsq");
    vi.advanceTimersByTime(SIGNING_KEY_IDLE_MS - 1);
    expect(s.get().signingKey).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(s.get().signingKey).toBeNull();
  });

  it("restarts the window when set again", () => {
    vi.useFakeTimers();
    const s = store();
    s.actions.setSigningKey("a");
    vi.advanceTimersByTime(SIGNING_KEY_IDLE_MS - 10);
    s.actions.setSigningKey("b");
    vi.advanceTimersByTime(SIGNING_KEY_IDLE_MS - 10);
    expect(s.get().signingKey).toBe("b");
  });

  it("is the same window as the session active key: two hours", () => {
    expect(SIGNING_KEY_IDLE_MS).toBe(2 * 60 * 60 * 1000);
  });
});
