import { createHash } from "node:crypto";
import { PrivateKey, Signature } from "@ecency/sdk/hive";
import { describe, expect, it } from "vitest";
import { encodeProof, loginMessage, makeProof, messageText } from "./proof";

// games-api decodes the proof, rebuilds JSON.stringify({signed_message,
// authors, timestamp}) and recovers the signer from sha256 of it. These
// tests do the same, so a change here that games-api would refuse fails.
const decode = (proof: string) => JSON.parse(Buffer.from(proof, "base64").toString("utf8"));

describe("login proof", () => {
  it("is a login message for this game only", () => {
    expect(loginMessage("good-karma", 1_790_000_000_500)).toEqual({
      signed_message: { type: "login", app: "ecency.app", audience: "raidstead" },
      authors: ["good-karma"],
      timestamp: 1_790_000_000
    });
  });

  it("signs the exact bytes games-api verifies", async () => {
    const key = PrivateKey.fromSeed("raidstead-proof-test");
    const proof = await makeProof("good-karma", async (text) => key.sign(createHash("sha256").update(text).digest()).toString());
    const code = decode(proof);
    const hash = createHash("sha256").update(JSON.stringify({ signed_message: code.signed_message, authors: code.authors, timestamp: code.timestamp })).digest();
    expect(Signature.from(code.signatures[0]).getPublicKey(hash).toString()).toBe(key.createPublic().toString());
  });

  it("keeps non-ASCII intact through base64", () => {
    const m = loginMessage("ab", 0);
    expect(decode(encodeProof(m, "sig"))).toEqual({ ...m, signatures: ["sig"] });
    expect(messageText(m)).toBe(JSON.stringify(m));
  });
});
