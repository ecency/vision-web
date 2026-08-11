import { describe, expect, it } from "vitest";
import { buildTokensPayload } from "./save-wallet-information-to-metadata";

const symbolsOf = (tokens: ReturnType<typeof buildTokensPayload>) =>
  (tokens ?? []).map((t) => t.symbol);

/** What the user already has on chain: two engine picks plus one address. */
const onChain = [
  { symbol: "LEO", type: "ENGINE", meta: { show: true } },
  { symbol: "POB", type: "ENGINE", meta: { show: true } },
  { symbol: "BTC", type: "CHAIN", meta: { address: "bc1", show: true } },
] as any;

/** What setup-external-metamask / setup-external-import send: CHAIN only. */
const chainOnlyPayload = [
  { currency: "BTC", type: "CHAIN", address: "bc1", show: true },
  { currency: "ETH", type: "CHAIN", address: "0xabc", show: true },
] as any;

describe("buildTokensPayload", () => {
  // The regression. profile.tokens is written wholesale and no app other than
  // Ecency writes it, so dropping the engine entries here is unrecoverable for
  // the user — they silently lose their wallet selection.
  it("preserves engine tokens when the caller saves only chain addresses", () => {
    const symbols = symbolsOf(buildTokensPayload(onChain, chainOnlyPayload));

    expect(symbols).toEqual(expect.arrayContaining(["LEO", "POB"]));
    expect(symbols).toEqual(expect.arrayContaining(["BTC", "ETH"]));
  });

  // The token picker owns the whole list: deselecting an engine token drops it
  // from the payload, so carrying unlisted entries forward would resurrect it.
  it("honours deselection when the payload carries non-chain entries", () => {
    // The picker always sends the basic Hive assets plus every selected engine
    // token, so a non-chain entry in the payload marks it as the owner of the
    // whole list and omission means remove.
    const symbols = symbolsOf(
      buildTokensPayload(onChain, [
        { currency: "HIVE", type: "HIVE", show: true },
        { currency: "LEO", type: "ENGINE", show: true },
      ] as any)
    );

    expect(symbols).toContain("LEO");
    expect(symbols).not.toContain("POB");
  });

  it("does not duplicate an entry the payload already carries", () => {
    const symbols = symbolsOf(
      buildTokensPayload(onChain, [
        { currency: "LEO", type: "ENGINE", show: true },
      ] as any)
    );

    expect(symbols.filter((s) => s === "LEO")).toHaveLength(1);
  });

  it("keeps existing chain addresses the payload does not mention", () => {
    const symbols = symbolsOf(
      buildTokensPayload(onChain, [
        { currency: "ETH", type: "CHAIN", address: "0xabc", show: true },
      ] as any)
    );

    expect(symbols).toEqual(expect.arrayContaining(["BTC", "ETH"]));
  });

  it("handles an account with no tokens yet", () => {
    expect(symbolsOf(buildTokensPayload(undefined, chainOnlyPayload))).toEqual(
      expect.arrayContaining(["BTC", "ETH"])
    );
  });
});
