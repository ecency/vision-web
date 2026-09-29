import { describe, it, expect, vi } from "vitest";

const callRPC = vi.hoisted(() => vi.fn());
vi.mock("./helpers/call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./helpers/call")>()),
  callRPC,
}));

import { Transaction, TransactionTooLargeError } from "./Transaction";
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
  const comment = (bodyLength: number) => [
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
  ];
  const commentTx = (bodyLength: number, maximumBlockSize: number | null = 65536) => {
    const t = new Transaction({
      transaction: { ...baseTx, signatures: [], operations: [comment(bodyLength)] },
    });
    t.maximumBlockSize = maximumBlockSize ?? undefined;
    return t;
  };
  // Body length that makes the unsigned transaction exactly `size` bytes; body
  // lengths here share one 3-byte varint range, so each char adds one byte.
  const bodyFor = (size: number) => 60_000 + (size - commentTx(60_000).size());

  it("counts each signature and the signature count", () => {
    const t = commentTx(10);
    const unsigned = t.size();
    expect(t.size(1)).toBe(unsigned + 65);
    t.sign(key);
    expect(t.size()).toBe(unsigned + 65);
  });

  it("sizes the signature count varint", () => {
    const t = commentTx(10);
    const unsigned = t.size() - 1;
    expect(t.size(127)).toBe(unsigned + 1 + 127 * 65);
    expect(t.size(128)).toBe(unsigned + 2 + 128 * 65);
    expect(t.size(16_384)).toBe(unsigned + 3 + 16_384 * 65);
  });

  it("signs a transaction at exactly maximum_block_size - 256", () => {
    const t = commentTx(bodyFor(65536 - 256 - 65));
    expect(t.size(1)).toBe(65280);
    expect(() => t.sign(key)).not.toThrow();
  });

  it("refuses one byte over and adds no signature", () => {
    const t = commentTx(bodyFor(65536 - 256 - 65 + 1));
    expect(() => t.sign(key)).toThrow(TransactionTooLargeError);
    expect(t.transaction?.signatures).toEqual([]);
  });

  it("refuses when only the signature pushes it over", () => {
    const t = commentTx(bodyFor(65279));
    expect(t.size()).toBeLessThanOrEqual(65280);
    expect(() => t.sign(key)).toThrow(TransactionTooLargeError);
  });

  it("follows a larger witness-voted block size", () => {
    expect(() => commentTx(100_000, 131072).sign(key)).not.toThrow();
    expect(() => commentTx(140_000, 131072).sign(key)).toThrow(TransactionTooLargeError);
  });

  it("only enforces the protocol ceiling when the block size is unknown", () => {
    expect(() => commentTx(100_000, null).sign(key)).not.toThrow();
    expect(() => commentTx(2 * 1024 * 1024, null).sign(key)).toThrow(TransactionTooLargeError);
  });

  it("counts every key when signing with several at once", () => {
    const other = PrivateKey.fromSeed("size-limit-spec-2");
    // Fits with one signature, not with two.
    const t = commentTx(bodyFor(65280 - 65 - 30));
    expect(() => t.sign([key, other])).toThrow(TransactionTooLargeError);
    expect(t.transaction?.signatures).toEqual([]);
  });

  it("keeps the block size when copied from another Transaction", () => {
    const copy = new Transaction({ transaction: commentTx(100_000, 65536) });
    expect(copy.maximumBlockSize).toBe(65536);
    expect(() => copy.sign(key)).toThrow(TransactionTooLargeError);
  });

  it("ignores a block size outside the consensus bounds", () => {
    expect(() => commentTx(100_000, 0).sign(key)).not.toThrow();
    expect(() => commentTx(100_000, 4 * 1024 * 1024).sign(key)).not.toThrow();
    expect(() => commentTx(100_000, "65536" as unknown as number).sign(key)).toThrow(
      TransactionTooLargeError
    );
  });

  it("records maximum_block_size from the properties it builds on", async () => {
    callRPC.mockResolvedValueOnce({
      head_block_number: 100,
      head_block_id: "00000064" + "ab".repeat(16),
      maximum_block_size: 131072,
    });
    const t = new Transaction();
    await t.addOperation("comment", comment(100_000)[1] as any);
    expect(t.maximumBlockSize).toBe(131072);
    expect(() => t.sign(key)).not.toThrow();
  });
});

describe("optional fields", () => {
  const update = (extra: Record<string, unknown>) =>
    new Transaction({
      transaction: {
        ...baseTx,
        signatures: [],
        operations: [
          [
            "account_update2",
            { account: "alice", json_metadata: "", posting_json_metadata: "{}", extensions: [], ...extra },
          ],
        ],
      },
    }).digest().txId;

  it("serializes a null optional like an absent one, as hived reads it", () => {
    expect(update({ memo_key: null, posting: null })).toBe(update({}));
  });
});
