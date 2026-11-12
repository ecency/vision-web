import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCallRPC, mockCallRPCWithFallback } = vi.hoisted(() => {
  const mockCallRPC = vi.fn();
  return {
    mockCallRPC,
    // Default: answer with whatever mockCallRPC gives for the primary method,
    // so the shape tests below stay transport-agnostic.
    mockCallRPCWithFallback: vi.fn(),
  };
});

vi.mock("@/modules/core/hive-tx", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callRPC: mockCallRPC,
  callRPCWithFallback: mockCallRPCWithFallback,
}));

// Keep the DMCA filter as a pass-through so these tests stay focused on the
// array-guard logic rather than DMCA censoring.
vi.mock("@/modules/posts/utils/filter-dmca-entries", () => ({
  filterDmcaEntry: vi.fn((entries: unknown) => entries),
}));

import { bridgeV2Call, getAccountPosts, getPost, getPostsRanked } from "./requests";
import { config } from "@/hive-tx/config";

describe("bridge requests — non-array API responses", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallRPCWithFallback.mockImplementation(async (primary: { method: string; params: unknown }) => ({
      result: await mockCallRPC(primary.method, primary.params),
      method: primary.method,
    }));
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("getPostsRanked", () => {
    it("returns null and warns when the response is a truthy non-array", async () => {
      mockCallRPC.mockResolvedValue({ error: "unexpected shape" });

      const result = await getPostsRanked("trending");

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("get_ranked_posts returned object")
      );
    });

    it("returns null without warning when the response is null", async () => {
      mockCallRPC.mockResolvedValue(null);

      const result = await getPostsRanked("trending");

      expect(result).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("returns an empty array (not null) for an empty array response", async () => {
      mockCallRPC.mockResolvedValue([]);

      const result = await getPostsRanked("trending");

      expect(result).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("resolves posts when the response is a non-empty array", async () => {
      mockCallRPC.mockResolvedValue([
        { author: "alice", permlink: "p1", json_metadata: {} },
      ]);

      const result = await getPostsRanked("trending");

      expect(result).toHaveLength(1);
      expect(result?.[0]?.author).toBe("alice");
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("getAccountPosts", () => {
    it("returns null and warns when the response is a truthy non-array", async () => {
      mockCallRPC.mockResolvedValue({ error: "unexpected shape" });

      const result = await getAccountPosts("posts", "alice");

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("get_account_posts returned object")
      );
    });

    it("returns null without warning when the response is null", async () => {
      mockCallRPC.mockResolvedValue(null);

      const result = await getAccountPosts("posts", "alice");

      expect(result).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("returns an empty array (not null) for an empty array response", async () => {
      mockCallRPC.mockResolvedValue([]);

      const result = await getAccountPosts("posts", "alice");

      expect(result).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("resolves posts when the response is a non-empty array", async () => {
      mockCallRPC.mockResolvedValue([
        { author: "bob", permlink: "p1", json_metadata: {} },
      ]);

      const result = await getAccountPosts("posts", "bob");

      expect(result).toHaveLength(1);
      expect(result?.[0]?.author).toBe("bob");
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

// Issue #2056: a node that serves the vote-free v2 reads is asked for v2 only,
// and the Entry carries the observer's own vote instead of every vote.
describe("getPost on a node that serves bridge.get_post_v2", () => {
  const ORIGINAL_NODES = [...config.nodes];

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<Record<string, any>>("@/modules/core/hive-tx");
    mockCallRPC.mockImplementation(actual.callRPC);
    mockCallRPCWithFallback.mockImplementation(actual.callRPCWithFallback);
    config.nodes = ["https://v2-node.test"];
  });

  afterEach(() => {
    config.nodes = ORIGINAL_NODES;
    vi.restoreAllMocks();
  });

  it("makes exactly one bridge.get_post_v2 call and returns observer_vote without active_votes", async () => {
    const methods: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      methods.push(body.method);
      const result =
        body.method === "bridge.get_post_v2"
          ? {
              author: "alice",
              permlink: "p",
              category: "hive",
              json_metadata: {},
              stats: { flag_weight: 0, gray: false, hide: false, total_votes: 1059 },
              observer_vote: { rshares: 123, percent: 5000 },
            }
          : { author: "alice", permlink: "p", json_metadata: {}, active_votes: [{ voter: "bob", rshares: 123 }] };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const entry = await getPost("alice", "p", "bob");

    expect(methods).toEqual(["bridge.get_post_v2"]);
    expect(entry?.observer_vote).toEqual({ rshares: 123, percent: 5000 });
    expect(entry?.observer_vote_for).toBe("bob");
    expect(entry?.stats?.total_votes).toBe(1059);
    expect(entry).not.toHaveProperty("active_votes");
  });
});

// v1 bridge methods reject v2-only params ("got an unexpected keyword argument
// 'top_votes'", verified live on api.hive.blog and api.deathwing.me), so the
// same-node v1 fallback must not carry them.
describe("bridgeV2Call: the v1 fallback carries no v2-only params", () => {
  const ORIGINAL_NODES = [...config.nodes];

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<Record<string, any>>("@/modules/core/hive-tx");
    mockCallRPCWithFallback.mockImplementation(actual.callRPCWithFallback);
    config.nodes = ["https://old-node-topvotes.test"];
  });

  afterEach(() => {
    config.nodes = ORIGINAL_NODES;
    vi.restoreAllMocks();
  });

  it("asks v2 with top_votes, then v1 without it", async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      calls.push({ method: body.method, params: body.params });
      const reply =
        body.method === "bridge.get_post_v2"
          ? {
              error: {
                code: -32602,
                message: "Assert Exception:unknown method: bridge_apiget_post_v2",
                data: { extension: { assertion_expression: "unknown method: bridge_apiget_post_v2" } },
              },
            }
          : "top_votes" in body.params
            ? { error: { code: -32602, message: "got an unexpected keyword argument 'top_votes'" } }
            : { result: { author: "alice", permlink: "p", active_votes: [] } };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...reply }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const params = { author: "alice", permlink: "p", observer: "bob", top_votes: 3 };
    const result = await bridgeV2Call<{ author: string }>("get_post", params);

    expect(calls.map((c) => c.method)).toEqual(["bridge.get_post_v2", "bridge.get_post"]);
    expect(calls[0].params).toEqual(params);
    expect(calls[1].params).toEqual({ author: "alice", permlink: "p", observer: "bob" });
    expect(result.author).toBe("alice");
    // The caller's params object is left alone.
    expect(params.top_votes).toBe(3);
  });
});
