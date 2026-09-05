import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFetchRouter } from "./curation-test-utils";

const ensureValidToken = vi.hoisted(() => vi.fn(async (username: string) => `token-for-${username}`));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken,
}));

import { curationDeskApi } from "@/features/curation-desk/curation-desk-api";

describe("curationDeskApi", () => {
  let router: ReturnType<typeof installFetchRouter>;

  beforeEach(() => {
    ensureValidToken.mockClear();
    router = installFetchRouter().on(/curation-desk\//, () => ({ ok: true, row: null, items: [], overlay: [], deltas: { marks: [], flags: [], signals: [] } }));
  });

  afterEach(() => vi.unstubAllGlobals());

  const wrappers: Array<[string, () => Promise<unknown>]> = [
    ["roster-feed", () => curationDeskApi.rosterFeed("alice", { sort: "queue" })],
    ["tick", () => curationDeskApi.tick("alice", { since: null, need: [], visible: [] })],
    ["mark", () => curationDeskApi.mark("alice", { author: "a", permlink: "p", state: "reviewed" })],
    ["mark-clear", () => curationDeskApi.markClear("alice", { author: "a", permlink: "p" })],
    ["marks", () => curationDeskApi.myMarks("alice", { state: "snoozed" })],
    ["cursor", () => curationDeskApi.cursor("alice", { post_id: 1, action: "advance" })],
    ["recommend-meta", () => curationDeskApi.recommendMeta("alice", { author: "a", permlink: "p", trx_id: "a".repeat(40) })],
    ["recommendation-dismiss", () => curationDeskApi.dismissReco("alice", { author: "a", permlink: "p", action: "dismiss" })],
  ];

  it.each(wrappers)("%s awaits ensureValidToken and sends the fresh code in the body", async (route, run) => {
    await run();
    expect(ensureValidToken).toHaveBeenCalledWith("alice");
    const [call] = router.callsTo(new RegExp(`curation-desk/${route}$`));
    expect(call).toBeDefined();
    expect(call.method).toBe("POST");
    expect(call.body?.code).toBe("token-for-alice");
  });

  it("resolves the token before the request is built (an expired stored token never travels)", async () => {
    const order: string[] = [];
    ensureValidToken.mockImplementationOnce(async () => {
      order.push("token");
      return "fresh";
    });
    router.on(/curation-desk\/mark$/, () => {
      order.push("fetch");
      return { mark: null, row: null };
    });
    await curationDeskApi.mark("alice", { author: "a", permlink: "p", state: "reviewed" });
    expect(order).toEqual(["token", "fetch"]);
  });

  it("stamps the web ua_class on the meta ping", async () => {
    await curationDeskApi.recommendMeta("alice", { author: "a", permlink: "p" });
    const [call] = router.callsTo(/recommend-meta$/);
    expect(call.body).toMatchObject({ ua_class: "web", author: "a", permlink: "p" });
    expect(call.body).not.toHaveProperty("trx_id");
  });

  it("refuses an authed call with no username instead of sending an empty code", async () => {
    await expect(curationDeskApi.mark(undefined, { author: "a", permlink: "p", state: "reviewed" })).rejects.toThrow(/missing auth/);
    expect(router.callsTo(/mark$/)).toHaveLength(0);
  });
});
