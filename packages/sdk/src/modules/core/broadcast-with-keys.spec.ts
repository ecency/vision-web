import { beforeEach, describe, expect, it, vi } from "vitest";

const signed = vi.hoisted(() => ({ keys: [] as unknown[], ops: [] as unknown[] }));
const mockBroadcast = vi.hoisted(() => vi.fn());

vi.mock("../../hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../hive-tx")>();
  class FakeTransaction {
    transaction = { operations: [] as unknown[], signatures: [] as string[] };
    async addOperation(name: string, body: unknown) {
      this.transaction.operations.push([name, body]);
      signed.ops.push([name, body]);
    }
    sign(keys: unknown) {
      signed.keys.push(keys);
      return this.transaction;
    }
  }
  return { ...actual, Transaction: FakeTransaction, callRPCBroadcast: mockBroadcast };
});

import { broadcastOperationsWithKeys } from "./hive-tx";

describe("broadcastOperationsWithKeys", () => {
  beforeEach(() => {
    signed.keys = [];
    signed.ops = [];
    mockBroadcast.mockReset();
  });

  it("signs one transaction with every key and broadcasts synchronously", async () => {
    mockBroadcast.mockResolvedValueOnce({ id: "tx", block_num: 1, trx_num: 0, expired: false });
    const k1 = { k: 1 } as any;
    const k2 = { k: 2 } as any;
    const op = ["recover_account", { account_to_recover: "alice" }] as any;

    const result = await broadcastOperationsWithKeys([op], [k1, k2]);

    expect(signed.ops).toEqual([op]);
    expect(signed.keys).toEqual([[k1, k2]]);
    expect(mockBroadcast).toHaveBeenCalledWith("condenser_api.broadcast_transaction_synchronous", [
      expect.objectContaining({ operations: [op] }),
    ]);
    expect(result.id).toBe("tx");
  });

  it("refuses an empty key list", async () => {
    await expect(broadcastOperationsWithKeys([], [])).rejects.toThrow();
  });
});
