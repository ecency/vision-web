import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallWithQuorum = vi.hoisted(() => vi.fn());

vi.mock("../../hive-tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hive-tx")>()),
  callWithQuorum: mockCallWithQuorum,
}));

import { RPCError } from "../../hive-tx";
import { verifyPostOnAlternateNode } from "./verify-on-alternate-node";

describe("verifyPostOnAlternateNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return entry when quorum finds it", async () => {
    const mockEntry = { author: "author", permlink: "permlink", post_id: 123 };
    mockCallWithQuorum.mockResolvedValue(mockEntry);

    const result = await verifyPostOnAlternateNode("author", "permlink", "obs");

    // Normalized: a row with neither vote field states the vote as unknown.
    expect(result).toEqual({ ...mockEntry, observer_vote: null, observer_vote_for: null });
    expect(mockCallWithQuorum).toHaveBeenCalledWith(
      "bridge.get_post",
      { author: "author", permlink: "permlink", observer: "obs" },
      1,
      undefined,
      expect.any(Function)
    );
  });

  it("should return null when quorum returns null", async () => {
    mockCallWithQuorum.mockResolvedValue(null);

    const result = await verifyPostOnAlternateNode("author", "permlink", "");

    expect(result).toBeNull();
  });

  // #2002: callWithQuorum throws the same error whether every node answered
  // nothing or every node failed. Each node's outcome tells them apart.
  type Outcome = { node: string; result?: unknown; error?: unknown };
  function quorumSettling(outcomes: Outcome[], final: unknown = new Error("No more nodes available.")) {
    mockCallWithQuorum.mockImplementation(
      async (_m: string, _p: unknown, _q: number, _s: unknown, onNodeSettled?: (o: Outcome) => void) => {
        for (const o of outcomes) onNodeSettled?.(o);
        const found = outcomes.find((o) => o.result);
        if (found) return found.result;
        throw final;
      }
    );
  }

  it("rejects when every other node failed (no node answered)", async () => {
    quorumSettling([
      { node: "https://a", error: new Error("HTTP 503 from https://a") },
      { node: "https://b", error: new Error("HTTP 429 Rate Limited") },
      { node: "https://c", error: new Error("The operation was aborted due to timeout") }
    ]);

    await expect(verifyPostOnAlternateNode("author", "permlink", "")).rejects.toThrow();
  });

  it("rejects when the only node errors are not a not-found answer", async () => {
    const rpc = new RPCError({ message: "Internal Error", code: -32603 });
    quorumSettling([{ node: "https://a", error: rpc }]);

    await expect(verifyPostOnAlternateNode("author", "permlink", "")).rejects.toThrow();
  });

  it("resolves null when another node answered null", async () => {
    quorumSettling([
      { node: "https://a", error: new Error("HTTP 503 from https://a") },
      { node: "https://b", result: null }
    ]);

    await expect(verifyPostOnAlternateNode("author", "permlink", "")).resolves.toBeNull();
  });

  it("resolves null when another node asserted the post does not exist", async () => {
    const assert = new RPCError({
      message: "Assert Exception:Post author/permlink does not exist",
      code: -32602
    });
    quorumSettling([
      { node: "https://a", error: new Error("HTTP 429 Rate Limited") },
      { node: "https://b", error: assert }
    ]);

    await expect(verifyPostOnAlternateNode("author", "permlink", "")).resolves.toBeNull();
  });

  it("resolves the post when another node has it", async () => {
    const entry = { author: "author", permlink: "permlink" };
    quorumSettling([
      { node: "https://a", error: new Error("HTTP 503 from https://a") },
      { node: "https://b", result: entry }
    ]);

    await expect(verifyPostOnAlternateNode("author", "permlink", "")).resolves.toEqual({
      ...entry,
      observer_vote: null,
      observer_vote_for: null
    });
  });

  it("should reject response with mismatched author/permlink", async () => {
    const wrongEntry = { author: "other-author", permlink: "other-permlink", post_id: 999 };
    mockCallWithQuorum.mockResolvedValue(wrongEntry);

    const result = await verifyPostOnAlternateNode("author", "permlink", "");

    expect(result).toBeNull();
  });

  it("should accept response only when author and permlink match", async () => {
    const correctEntry = { author: "author", permlink: "permlink", post_id: 200 };
    mockCallWithQuorum.mockResolvedValue(correctEntry);

    const result = await verifyPostOnAlternateNode("author", "permlink", "");

    expect(result).toEqual({ ...correctEntry, observer_vote: null, observer_vote_for: null });
  });

  it("should return null for non-object response", async () => {
    mockCallWithQuorum.mockResolvedValue("unexpected string");

    const result = await verifyPostOnAlternateNode("author", "permlink", "");

    expect(result).toBeNull();
  });
});
