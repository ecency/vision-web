import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));

import {
  assistRequestKey,
  forgetAssistRequestKey
} from "@/features/shared/ai-assist/assist-request-key";

describe("assistRequestKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps one key per user, action and text until it is forgotten", () => {
    const key = assistRequestKey("alice", "summarize", "text a");

    expect(assistRequestKey("alice", "summarize", "text a")).toBe(key);
    expect(assistRequestKey("alice", "summarize", "text b")).not.toBe(key);
    expect(assistRequestKey("alice", "improve", "text a")).not.toBe(key);
    expect(assistRequestKey("bob", "summarize", "text a")).not.toBe(key);

    forgetAssistRequestKey("alice", "summarize", "text a");
    expect(assistRequestKey("alice", "summarize", "text a")).not.toBe(key);
  });

  it("starts over once a kept key is older than the replay it could get", () => {
    const key = assistRequestKey("alice", "summarize", "old text");

    vi.advanceTimersByTime(11 * 60 * 60 * 1000);
    expect(assistRequestKey("alice", "summarize", "old text")).toBe(key);

    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(assistRequestKey("alice", "summarize", "old text")).not.toBe(key);
  });
});
