import { describe, it, expect } from "vitest";
import { Transaction, TransactionTooLargeError, MAX_TRANSACTION_SIZE } from "./Transaction";
import { PrivateKey } from "./helpers/PrivateKey";

// Minimal serializable transaction, as produced externally (e.g. by hive-uri's
// resolveTransaction) WITHOUT a `signatures` field.
const baseTx = {
  ref_block_num: 1234,
  ref_block_prefix: 5678901,
  expiration: "2026-06-20T17:00:00",
  operations: [
    ["vote", { voter: "alice", author: "bob", permlink: "a-post", weight: 10000 }],
  ],
  extensions: [],
} as any;

describe("Transaction constructor – signatures normalization", () => {
  it("adds an empty signatures array when the source tx omits it (hive-uri sign regression)", () => {
    const tx = { ...baseTx }; // no `signatures`
    const t = new Transaction({ transaction: tx });
    expect(Array.isArray(t.transaction?.signatures)).toBe(true);
    expect(t.transaction?.signatures).toEqual([]);
  });

  it("preserves an existing signatures array", () => {
    const tx = { ...baseTx, signatures: ["deadbeef"] };
    const t = new Transaction({ transaction: tx });
    expect(t.transaction?.signatures).toEqual(["deadbeef"]);
  });

  it("replaces a non-array signatures value", () => {
    const tx = { ...baseTx, signatures: null };
    const t = new Transaction({ transaction: tx });
    expect(t.transaction?.signatures).toEqual([]);
  });
});

describe("Transaction size limit", () => {
  const key = PrivateKey.fromSeed("size-limit-spec");
  const commentTx = (bodyLength: number) =>
    new Transaction({
      transaction: {
        ...baseTx,
        signatures: [],
        operations: [
          [
            "comment",
            {
              parent_author: "",
              parent_permlink: "test",
              author: "alice",
              permlink: "a-post",
              title: "t",
              body: "x".repeat(bodyLength),
              json_metadata: "{}",
            },
          ],
        ],
      },
    });

  it("counts each signature and the signature count", () => {
    const t = commentTx(10);
    const unsigned = t.size();
    expect(t.size(1)).toBe(unsigned + 65);
    t.sign(key);
    expect(t.size()).toBe(unsigned + 65);
  });

  it("signs a transaction that fits", () => {
    const t = commentTx(60_000);
    expect(() => t.sign(key)).not.toThrow();
    expect(t.size()).toBeLessThanOrEqual(MAX_TRANSACTION_SIZE);
  });

  it("refuses to sign a transaction over the limit and adds no signature", () => {
    const t = commentTx(MAX_TRANSACTION_SIZE);
    expect(() => t.sign(key)).toThrow(TransactionTooLargeError);
    expect(t.transaction?.signatures).toEqual([]);
  });

  it("refuses when only the signature pushes it over the limit", () => {
    const base = commentTx(60_000).size();
    // Body length stays in the same 3-byte varint range, so each extra char adds one byte.
    const t = commentTx(60_000 + (MAX_TRANSACTION_SIZE - base) - 1);
    expect(t.size()).toBe(MAX_TRANSACTION_SIZE - 1);
    expect(() => t.sign(key)).toThrow(TransactionTooLargeError);
  });
});
