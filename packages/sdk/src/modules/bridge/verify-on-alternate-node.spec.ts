import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallWithQuorum = vi.hoisted(() => vi.fn());

vi.mock("../../hive-tx", () => ({
  callWithQuorum: mockCallWithQuorum,
}));

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
      1
    );
  });

  it("should return null when quorum returns null", async () => {
    mockCallWithQuorum.mockResolvedValue(null);

    const result = await verifyPostOnAlternateNode("author", "permlink", "");

    expect(result).toBeNull();
  });

  it("should return null when quorum throws", async () => {
    mockCallWithQuorum.mockRejectedValue(new Error("quorum failed"));

    const result = await verifyPostOnAlternateNode("author", "permlink", "");

    expect(result).toBeNull();
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
