import { afterEach, describe, expect, it, vi } from "vitest";

// #2129: the SOL send must come from the linked account the dialog showed and
// checked, as ETH, BNB and BTC do (ACCOUNT_MISMATCH), not from whichever
// Solana account MetaMask lists first.

const A = "So11111111111111111111111111111111111111112";
const B = "11111111111111111111111111111111";
const UNLINKED = "SysvarC1ock11111111111111111111111111111111";
const TO = "SysvarRent111111111111111111111111111111111";

const signAndSendTransaction = vi.hoisted(() => vi.fn(async () => [{ signature: "sig" }]));

vi.mock("@wallet-standard/app", () => ({
  getWallets: () => ({
    get: () => [
      {
        name: "MetaMask",
        accounts: [
          { address: B, chains: ["solana:mainnet"] },
          { address: A, chains: ["solana:mainnet"] }
        ],
        features: {
          "standard:connect": { connect: vi.fn(async () => ({})) },
          "solana:signAndSendTransaction": { signAndSendTransaction }
        }
      }
    ]
  })
}));

import { sendSolTransfer } from "./metamask-sol-transfer";

afterEach(() => {
  vi.restoreAllMocks();
  signAndSendTransaction.mockClear();
});

function stubBlockhash() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: { blockhash: B } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );
}

describe("sendSolTransfer", () => {
  it("refuses when the linked account is not in MetaMask", async () => {
    stubBlockhash();
    await expect(sendSolTransfer(TO, "0.1", UNLINKED)).rejects.toThrow("ACCOUNT_MISMATCH");
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it("sends from the linked account, not the first one MetaMask lists", async () => {
    stubBlockhash();
    await sendSolTransfer(TO, "0.1", A);
    expect(signAndSendTransaction).toHaveBeenCalledTimes(1);
    expect((signAndSendTransaction.mock.calls[0] as any)[0].account.address).toBe(A);
  });
});
