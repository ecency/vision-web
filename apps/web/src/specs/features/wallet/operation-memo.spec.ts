import { describe, expect, it, vi } from "vitest";

// The wallet operations dialog follows the shared Transfer dialog for memos: a
// memo starting with # goes out encrypted for the recipient, and a private key
// typed into the memo field is refused.

const encryptMemo = vi.hoisted(() => vi.fn(async (_l: unknown, _u: string, _t: string, m: string) => `#enc:${m}`));
vi.mock("@/utils/memo-crypto", () => ({ encryptMemo }));
vi.mock("@/utils/user-token", () => ({ getLoginType: () => "keychain" }));
// The global setup stubs isWif to false; this spec needs the real check.
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return { isWif: actual.isWif };
});

import { isKeyInMemo, operationCarriesMemo, prepareOperationMemo } from "@/features/wallet/operations/operation-memo";

describe("isKeyInMemo", () => {
  it("spots a private key typed into the memo", () => {
    expect(isKeyInMemo("5JdeC9P7Pbd1uGdFVEsJ41EkEnADbbHGq6p1BwFxm6txNBsQnsw")).toBe(true);
    expect(isKeyInMemo("  5JdeC9P7Pbd1uGdFVEsJ41EkEnADbbHGq6p1BwFxm6txNBsQnsw ")).toBe(true);
  });

  it("lets ordinary text through", () => {
    expect(isKeyInMemo("thanks for the coffee")).toBe(false);
    expect(isKeyInMemo("")).toBe(false);
  });
});

describe("prepareOperationMemo", () => {
  it("encrypts a # memo for the recipient", async () => {
    encryptMemo.mockClear();
    await expect(prepareOperationMemo("#secret", "alice", "bob")).resolves.toBe("#enc:secret");
    expect(encryptMemo).toHaveBeenCalledWith("keychain", "alice", "bob", "secret");
  });

  it("leaves a plain memo as it is", async () => {
    encryptMemo.mockClear();
    await expect(prepareOperationMemo("hello", "alice", "bob")).resolves.toBe("hello");
    expect(encryptMemo).not.toHaveBeenCalled();
  });
});

describe("operationCarriesMemo", () => {
  it.each(["transfer", "transfer-saving", "withdraw-saving", "gift"])("is true for %s", (op) => {
    expect(operationCarriesMemo(op)).toBe(true);
  });

  it.each(["delegate", "power-up", "stake"])("is false for %s, which has no memo on chain", (op) => {
    expect(operationCarriesMemo(op)).toBe(false);
  });
});
