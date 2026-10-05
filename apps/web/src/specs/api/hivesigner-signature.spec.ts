// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// the real signing and recovery, with only the chain lookup stubbed
vi.mock("@ecency/sdk/hive", async (original) => ({
  ...(await original<typeof import("@ecency/sdk/hive")>()),
  callRPC: vi.fn()
}));

import { callRPC, PrivateKey } from "@ecency/sdk/hive";
import { forgetHivesignerKeys, signedByHivesigner, signerOf } from "@/server/hivesigner-signature";
import { issue } from "./hivesigner-issue";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const hivesigner = PrivateKey.fromSeed("hivesigner posting key of this spec");
const rotated = PrivateKey.fromSeed("its next posting key");
const somebody = PrivateKey.fromSeed("somebody else altogether");
const pub = (key: PrivateKey) => key.createPublic().toString();

// what the chain answers about an account
const row = (name: string, ...keys: PrivateKey[]) => ({
  name,
  posting: { key_auths: keys.map((k) => [pub(k), 1]) }
});
const chainLists = (...keys: PrivateKey[]) =>
  vi.mocked(callRPC).mockResolvedValue([row("hivesigner", ...keys)]);
// The keys are timed by the running time of the process: this moves it on.
const later = (ms: number) => vi.advanceTimersByTime(ms);
// long enough for anything that does not wait for an answer from outside
const soon = () => new Promise((r) => setTimeout(r, 0, "still waiting"));

describe("whose signature a HiveSigner token carries", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(NOW);
    forgetHivesignerKeys();
    vi.mocked(callRPC).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("recovers the key that signed; none for a signature it cannot read", () => {
    expect(signerOf(issue(hivesigner))).toBe(pub(hivesigner));
    expect(signerOf(issue(somebody))).toBe(pub(somebody));
    const token = issue(hivesigner);
    for (const signatures of [
      undefined,
      [],
      [42],
      ["sig"],
      ["zz".repeat(65)],
      [token.signatures![0].slice(2)]
    ]) {
      expect(
        signerOf({ ...token, signatures: signatures as string[] }),
        JSON.stringify(signatures)
      ).toBeNull();
    }
  });

  it("says yes to a token signed with the key the chain lists for HiveSigner, asking the chain once", async () => {
    chainLists(hivesigner);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    expect(await signedByHivesigner(issue(hivesigner, "bob"))).toBe(true);
    expect(callRPC).toHaveBeenCalledTimes(1);
    // HiveSigner's own account, with the SDK's own patience
    expect(callRPC).toHaveBeenCalledWith(
      "condenser_api.get_accounts",
      [["hivesigner"]],
      undefined,
      undefined,
      undefined,
      expect.any(Function)
    );
    // still the same answer most of an hour later, with no second read
    later(HOUR - MINUTE);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    expect(callRPC).toHaveBeenCalledTimes(1);
  });

  it("says no to anybody else's signature, to a changed token and to one it cannot read", async () => {
    chainLists(hivesigner);
    expect(await signedByHivesigner(issue(somebody))).toBe(false);
    // the account's own key is not HiveSigner's either
    const token = issue(hivesigner);
    expect(await signedByHivesigner({ ...token, authors: ["bob"] })).toBe(false);
    expect(await signedByHivesigner({ ...token, timestamp: token.timestamp + 1 })).toBe(false);
    expect(
      await signedByHivesigner({ ...token, signed_message: { type: "posting", app: "other.app" } })
    ).toBe(false);
    expect(await signedByHivesigner({ ...token, signatures: ["sig"] })).toBe(false);
  });

  it("does not ask the chain again for every signature that matches nothing", async () => {
    chainLists(hivesigner);
    for (let i = 0; i < 20; i++) {
      expect(await signedByHivesigner(issue(somebody, `acct${i}`))).toBe(false);
    }
    expect(callRPC).toHaveBeenCalledTimes(1);
    // once a minute at most, however many arrive
    later(MINUTE - 1);
    expect(await signedByHivesigner(issue(somebody))).toBe(false);
    expect(callRPC).toHaveBeenCalledTimes(1);
    later(1);
    for (let i = 0; i < 20; i++) await signedByHivesigner(issue(somebody, `acct${i}`));
    expect(callRPC).toHaveBeenCalledTimes(2);
  });

  it("asks the chain for no token whose signature cannot be read", async () => {
    chainLists(hivesigner);
    expect(await signedByHivesigner({ ...issue(hivesigner), signatures: ["sig"] })).toBe(false);
    expect(callRPC).not.toHaveBeenCalled();
  });

  it("learns a changed key within a minute", async () => {
    chainLists(hivesigner);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    chainLists(rotated);
    // the chain was asked a moment ago: not yet
    expect(await signedByHivesigner(issue(rotated))).toBe(false);
    later(MINUTE);
    expect(await signedByHivesigner(issue(rotated))).toBe(true);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(false);
    expect(callRPC).toHaveBeenCalledTimes(2);
  });

  it("stops taking a key the chain no longer lists once the hour is up", async () => {
    chainLists(hivesigner);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    // HiveSigner changes its key; tokens signed with the old one keep arriving
    chainLists(rotated);
    later(HOUR - 1);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    later(1);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(false);
    expect(await signedByHivesigner(issue(rotated))).toBe(true);
  });

  it("gives keys still current at once, while a read somebody else caused is on its way", async () => {
    chainLists(hivesigner);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    later(5 * MINUTE);
    // a token anybody signed has the chain asked again, which is slow to answer
    let answer!: (rows: unknown) => void;
    vi.mocked(callRPC).mockReturnValue(new Promise((r) => (answer = r)));
    const forged = signedByHivesigner(issue(somebody));
    await soon();
    expect(callRPC).toHaveBeenCalledTimes(2);
    // a player's token arrives meanwhile
    expect(await Promise.race([signedByHivesigner(issue(hivesigner)), soon()])).toBe(true);
    answer([row("hivesigner", hivesigner)]);
    expect(await forged).toBe(false);
  });

  it("says nothing can be said while the key was never learned; it tries again a minute later", async () => {
    vi.mocked(callRPC).mockRejectedValue(new Error("fetch failed: secret-looking detail"));
    expect(await signedByHivesigner(issue(hivesigner))).toBeNull();
    expect(await signedByHivesigner(issue(hivesigner))).toBeNull();
    expect(callRPC).toHaveBeenCalledTimes(1);
    // the failure is logged by its kind only
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-looking");
    chainLists(hivesigner);
    later(MINUTE - 1);
    expect(await signedByHivesigner(issue(hivesigner))).toBeNull();
    expect(callRPC).toHaveBeenCalledTimes(1);
    later(1);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
  });

  it("keeps the key it knows when the chain cannot be read, or answers with none", async () => {
    chainLists(hivesigner);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    later(2 * HOUR);
    vi.mocked(callRPC).mockRejectedValue(new Error("down"));
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
    expect(callRPC).toHaveBeenCalledTimes(2);
    // answers with no key of HiveSigner in them: the last is about another account
    const answers = [null, [], [{}], [row("hivesigner")], "keys", 7, [row("somebody", somebody)]];
    for (const [i, given] of answers.entries()) {
      vi.mocked(callRPC).mockResolvedValue(given);
      later(2 * MINUTE);
      expect(await signedByHivesigner(issue(hivesigner)), JSON.stringify(given)).toBe(true);
      // the chain was asked, yet what was known is as it was
      expect(callRPC, JSON.stringify(given)).toHaveBeenCalledTimes(3 + i);
      expect(await signedByHivesigner(issue(somebody)), JSON.stringify(given)).toBe(false);
    }
  });

  it("has the SDK take an answer without the keys as a fault of the node that gave it", async () => {
    chainLists(hivesigner);
    await signedByHivesigner(issue(hivesigner));
    const sound = vi.mocked(callRPC).mock.calls[0][5]!;
    expect(sound([row("hivesigner", hivesigner)])).toBe(true);
    for (const given of [
      null,
      undefined,
      [],
      [{}],
      [row("hivesigner")],
      [row("somebody", somebody)],
      "keys",
      7,
      {}
    ]) {
      expect(sound(given), JSON.stringify(given)).toBe(false);
    }
  });

  it("is not put off by the clock being set back", async () => {
    vi.mocked(callRPC).mockRejectedValue(new Error("down"));
    expect(await signedByHivesigner(issue(hivesigner))).toBeNull();
    // the clock on the wall goes back ten minutes; a minute passes
    vi.setSystemTime(NOW - 10 * MINUTE);
    chainLists(hivesigner);
    later(MINUTE);
    expect(await signedByHivesigner(issue(hivesigner))).toBe(true);
  });

  it("does not start a second read while one is still on its way", async () => {
    let answer!: (rows: unknown) => void;
    vi.mocked(callRPC).mockReturnValue(new Promise((r) => (answer = r)));
    const first = signedByHivesigner(issue(hivesigner));
    // the chain is slow to answer: over a minute later another token arrives
    later(2 * MINUTE);
    const second = signedByHivesigner(issue(hivesigner, "bob"));
    answer([row("hivesigner", hivesigner)]);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(callRPC).toHaveBeenCalledTimes(1);
  });

  it("reads the chain once for everyone who asks at the same moment", async () => {
    let answer!: (rows: unknown) => void;
    vi.mocked(callRPC).mockReturnValue(new Promise((r) => (answer = r)));
    const both = Promise.all([
      signedByHivesigner(issue(hivesigner)),
      signedByHivesigner(issue(somebody))
    ]);
    answer([row("hivesigner", hivesigner)]);
    expect(await both).toEqual([true, false]);
    expect(callRPC).toHaveBeenCalledTimes(1);
  });
});
