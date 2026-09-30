import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getTransactionReference: vi.fn(),
  callRPCBroadcast: vi.fn(),
}));

vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ecency/sdk")>()),
  getTransactionReference: sdk.getTransactionReference,
  callRPCBroadcast: sdk.callRPCBroadcast,
}));

vi.mock("@/utils/user-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/user-token")>()),
  getLoginType: () => "metamask",
}));

import { createWebBroadcastAdapter } from "@/providers/sdk/web-broadcast-adapter";

/**
 * The MetaMask Snap path builds its own transaction: the block reference it
 * signs must be the SDK's (a block a few behind head, which a lagging node
 * still accepts), and the transaction it broadcasts must carry the same one.
 */
describe("MetaMask Snap broadcast", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (window as any).ethereum;
  });

  it("signs and broadcasts the SDK's block reference", async () => {
    sdk.getTransactionReference.mockResolvedValue({ ref_block_num: 1234, ref_block_prefix: 5678, maximum_block_size: 65536 });
    sdk.callRPCBroadcast.mockResolvedValue({ id: "trx", block_num: 1, trx_num: 0, expired: false });
    const request = vi.fn().mockResolvedValue({ signatures: ["sig"] });
    (window as any).ethereum = { request };

    const vote = ["vote", { voter: "alice", author: "bob", permlink: "a-post", weight: 10000 }] as const;
    await createWebBroadcastAdapter().broadcastWithKeychain!("alice", [vote as any], "posting");

    const signed = JSON.parse(request.mock.calls[0][0].params.request.params.transaction);
    expect(signed).toMatchObject({ ref_block_num: 1234, ref_block_prefix: 5678 });

    const [method, [broadcast]] = sdk.callRPCBroadcast.mock.calls[0];
    expect(method).toBe("condenser_api.broadcast_transaction_synchronous");
    expect(broadcast).toMatchObject({ ref_block_num: 1234, ref_block_prefix: 5678, signatures: ["sig"] });
    expect(broadcast.expiration).toBe(signed.expiration);
  });
});
