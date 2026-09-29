import { describe, it, expect, vi } from "vitest";

const useMutation = vi.hoisted(() => vi.fn((options: any) => options));
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
  it("accepts operations that fit in one transaction", () => {
    expect(() => assertOperationsFitTransaction([comment("hello")])).not.toThrow();
  });

  it("rejects operations over the transaction size limit", () => {
    expect(() => assertOperationsFitTransaction([comment("x".repeat(70_000))])).toThrow(
      TransactionTooLargeError
    );
  });

  it("counts multibyte characters by their encoded size", () => {
    // 30k two-byte characters = 60,000 bytes of body, plus a signature, still
    // fits; 33k of them = 66,000 bytes does not.
    expect(() => assertOperationsFitTransaction([comment("ž".repeat(30_000))])).not.toThrow();
    expect(() => assertOperationsFitTransaction([comment("ž".repeat(33_000))])).toThrow(
      TransactionTooLargeError
    );
  });

  it("leaves operations it cannot serialize to the signer", () => {
    const unknown = ["not_a_real_op", { foo: "bar" }] as unknown as Operation;
    expect(() => assertOperationsFitTransaction([unknown])).not.toThrow();
  });
});

describe("useBroadcastMutation size check", () => {
  const run = async (body: string) => {
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
