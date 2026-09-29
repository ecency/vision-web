import { describe, it, expect, vi, beforeEach } from "vitest";

const useMutation = vi.hoisted(() => vi.fn((options: any) => options));
const callRPC = vi.hoisted(() => vi.fn());
vi.mock("../../../hive-tx/helpers/call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../hive-tx/helpers/call")>()),
  callRPC,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useMutation,
}));

import { assertOperationsFitTransaction, useBroadcastMutation } from "./use-broadcast-mutation";
import { TransactionTooLargeError } from "../../../hive-tx";
import type { Operation } from "../../../hive-tx";

const comment = (body: string): Operation =>
  [
    "comment",
    {
      parent_author: "",
      parent_permlink: "test",
      author: "alice",
      permlink: "a-post",
      title: "t",
      body,
      json_metadata: "{}",
    },
  ] as Operation;

describe("assertOperationsFitTransaction", () => {
  const props = (maximum_block_size: number) => ({ maximum_block_size });
  beforeEach(() => {
    callRPC.mockReset();
    callRPC.mockResolvedValue(props(65536));
  });

  it("accepts operations within the smallest votable limit without a network call", async () => {
    await expect(assertOperationsFitTransaction([comment("x".repeat(60_000))])).resolves.toBeUndefined();
    expect(callRPC).not.toHaveBeenCalled();
  });

  it("rejects operations over the live limit", async () => {
    await expect(assertOperationsFitTransaction([comment("x".repeat(70_000))])).rejects.toBeInstanceOf(
      TransactionTooLargeError
    );
    expect(callRPC).toHaveBeenCalledWith("condenser_api.get_dynamic_global_properties", []);
  });

  it("accepts a larger transaction when witnesses voted a larger block size", async () => {
    callRPC.mockResolvedValue(props(131072));
    await expect(assertOperationsFitTransaction([comment("x".repeat(100_000))])).resolves.toBeUndefined();
  });

  it("falls back to the protocol ceiling when the limit cannot be read", async () => {
    callRPC.mockRejectedValue(new Error("all nodes down"));
    await expect(assertOperationsFitTransaction([comment("x".repeat(100_000))])).resolves.toBeUndefined();
    await expect(
      assertOperationsFitTransaction([comment("x".repeat(2 * 1024 * 1024))])
    ).rejects.toBeInstanceOf(TransactionTooLargeError);
  });

  it("counts multibyte characters by their encoded size", async () => {
    // 30k two-byte characters = 60,000 bytes of body, still fits; 33k do not.
    await expect(assertOperationsFitTransaction([comment("ž".repeat(30_000))])).resolves.toBeUndefined();
    await expect(assertOperationsFitTransaction([comment("ž".repeat(33_000))])).rejects.toBeInstanceOf(
      TransactionTooLargeError
    );
  });

  it("leaves operations it cannot serialize to the signer", async () => {
    const unknown = ["not_a_real_op", { foo: "bar" }] as unknown as Operation;
    await expect(assertOperationsFitTransaction([unknown])).resolves.toBeUndefined();
  });
});

describe("useBroadcastMutation size check", () => {
  const run = async (body: string) => {
    callRPC.mockResolvedValue({ maximum_block_size: 65536 });
    const broadcast = vi.fn().mockResolvedValue({ id: "tx" });
    const { mutationFn } = useBroadcastMutation<string>(
      ["test"],
      "alice",
      (b) => [comment(b)],
      undefined,
      { broadcast, enableFallback: false } as any
    ) as any;
    return { broadcast, result: mutationFn(body) };
  };

  it("refuses an oversized transaction before any signer sees it", async () => {
    const { broadcast, result } = await run("x".repeat(70_000));
    await expect(result).rejects.toBeInstanceOf(TransactionTooLargeError);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("hands a transaction that fits to the signer", async () => {
    const { broadcast, result } = await run("hello");
    await expect(result).resolves.toEqual({ id: "tx" });
    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});
