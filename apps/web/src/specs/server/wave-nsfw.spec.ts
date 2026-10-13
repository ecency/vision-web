import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWaveFlaggedNsfw } from "@/server/wave-nsfw";

describe("isWaveFlaggedNsfw", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (body: unknown, ok = true) => ({ ok, json: async () => body });

  it("is true when the API names this wave as flagged", async () => {
    fetchMock.mockResolvedValue(answer({ flagged: ["alice/wave-1"] }));
    expect(await isWaveFlaggedNsfw("alice", "wave-1")).toBe(true);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/private-api/waves/nsfw");
    expect(url.searchParams.get("author")).toBe("alice");
    expect(url.searchParams.get("permlink")).toBe("wave-1");
  });

  it("asks for the account the way the API stores it", async () => {
    fetchMock.mockResolvedValue(answer({ flagged: ["alice/wave-1"] }));
    expect(await isWaveFlaggedNsfw("@Alice", "wave-1")).toBe(true);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("author")).toBe("alice");
  });

  it("is false when the answer does not name this wave", async () => {
    for (const body of [{ flagged: [] }, { flagged: ["alice/other"] }, { flagged: "alice/wave-1" }, {}, null, []]) {
      fetchMock.mockResolvedValue(answer(body));
      expect(await isWaveFlaggedNsfw("alice", "wave-1")).toBe(false);
    }
  });

  it("fails to false and never throws: an unreachable API must not blank a wave page", async () => {
    fetchMock.mockResolvedValue(answer({ flagged: ["alice/wave-1"] }, false));
    expect(await isWaveFlaggedNsfw("alice", "wave-1")).toBe(false);
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await isWaveFlaggedNsfw("alice", "wave-1")).toBe(false);
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error("not json"); } });
    expect(await isWaveFlaggedNsfw("alice", "wave-1")).toBe(false);
  });

  it("asks nothing without both halves of the key", async () => {
    expect(await isWaveFlaggedNsfw("", "wave-1")).toBe(false);
    expect(await isWaveFlaggedNsfw("alice", "")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds the wait", async () => {
    fetchMock.mockResolvedValue(answer({ flagged: [] }));
    await isWaveFlaggedNsfw("alice", "wave-1");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
