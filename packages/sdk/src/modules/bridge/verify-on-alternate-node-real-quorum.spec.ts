import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { config } from "../../hive-tx/config";
import { verifyPostOnAlternateNode } from "./verify-on-alternate-node";

// #2002 against the REAL callWithQuorum: it shuffles every configured node,
// so the node that answered null on the primary call is asked again.
const LAG = "https://lag.test";
const B = "https://b.test";
const C = "https://c.test";

function rpc(init: any, payload: Record<string, unknown>) {
  const body = JSON.parse(String(init?.body ?? "{}"));
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...payload }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verifyPostOnAlternateNode with the real callWithQuorum", () => {
  const ORIGINAL_NODES = [...config.nodes];

  beforeEach(() => {
    config.nodes = [LAG, B, C];
    // The shuffle keeps config order: the lagging node is asked first, the
    // worst case for the double-check.
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });

  afterEach(() => {
    config.nodes = ORIGINAL_NODES;
    vi.restoreAllMocks();
  });

  it("rejects when the lagging node answers null again and every other node fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).startsWith(LAG) ? rpc(init, { result: null }) : new Response("down", { status: 503 })
    );

    await expect(verifyPostOnAlternateNode("alice", "p", "", LAG)).rejects.toThrow(/503/);
    // The other nodes were asked.
    expect(fetchSpy.mock.calls.some(([url]) => String(url).startsWith(B))).toBe(true);
  });

  it("throws the last node error, with the quorum error as its cause", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).startsWith(LAG) ? rpc(init, { result: null }) : new Response("down", { status: 503 })
    );
    const error = await verifyPostOnAlternateNode("alice", "p", "", LAG).catch((e) => e);
    expect(String(error.message)).toContain("503");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("resolves null when another node answers null", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).startsWith(C) ? new Response("down", { status: 503 }) : rpc(init, { result: null })
    );
    await expect(verifyPostOnAlternateNode("alice", "p", "", LAG)).resolves.toBeNull();
  });

  it.each([
    "Assert Exception:Post alice/p does not exist",
    "Assert Exception:invalid account char",
    "Assert Exception:invalid account name length: `a`",
    "Assert Exception:Post alice/p was deleted",
  ])("resolves null when another node answers %s", async (message) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).startsWith(B)
        ? rpc(init, { error: { code: -32602, message } })
        : String(url).startsWith(LAG)
          ? rpc(init, { result: null })
          : new Response("down", { status: 503 })
    );
    await expect(verifyPostOnAlternateNode("alice", "p", "", LAG)).resolves.toBeNull();
  });

  it("a node that cannot serve the method is a failure, not an answer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).startsWith(LAG)
        ? rpc(init, { result: null })
        : rpc(init, {
            error: {
              code: -32003,
              message:
                "Assert Exception:api_itr != data._registered_apis.end(): Could not find API bridge",
            },
          })
    );
    await expect(verifyPostOnAlternateNode("alice", "p", "", LAG)).rejects.toThrow(/Could not find API/);
  });

  it("finds the post on another node after the lagging node's null", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).startsWith(LAG)
        ? rpc(init, { result: null })
        : rpc(init, { result: { author: "alice", permlink: "p", active_votes: [] } })
    );
    const entry = await verifyPostOnAlternateNode("alice", "p", "", LAG);
    expect(entry?.author).toBe("alice");
  });

  it("a pool of one node: its null is the answer", async () => {
    config.nodes = [LAG];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url: any, init: any) =>
      rpc(init, { result: null })
    );
    await expect(verifyPostOnAlternateNode("alice", "p", "", LAG)).resolves.toBeNull();
  });
});
