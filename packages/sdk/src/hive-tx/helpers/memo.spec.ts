import { describe, it, expect } from "vitest";
import { Memo } from "./memo";
import { PrivateKey } from "./PrivateKey";

// Throwaway keys from public seeds. Memos encrypted by dhive to the receiver:
// LEADING_ZERO from a sender whose shared x-coordinate starts with 0x00, which
// dhive hashes without that byte; TWO_LEADING_ZEROS from one starting 0x0000,
// which dhive hashes without both; NORMAL from one with no leading zero.
const receiver = PrivateKey.fromSeed("memo-spec-receiver");
const LEADING_ZERO =
  "#8U17JFobEzdC63zMp8UaX3651fkRUeTHYiDC19WAvt9jgEySFHfD5eYQL2BmmqQfgUautSgJv1tsdM2h3q8ENFTDX8suirgb11d5zkY9SDKWGJjQAoCVaca2B7THfE36fepi6GQPJPiEFk2p656emYD";
const TWO_LEADING_ZEROS =
  "#72E78zKAFBpwETrEnWmeFTAewWfaH28oiUtz7zpVCxKxxn1ktt51YZJkHe8QXm11kZ3JYLxhqoXNHdqZLYHtaVeptyMxv6o4EEmHfer1YeDdHmQAtG8YWbZrLNMQ7EG9iK8XWX2apBD5Dj7yKeJJz94";
const NORMAL =
  "#6eZGRcbR74JToXcm3UJ3xFB58FmNj7oLLiC99nEVa1iQfYLD29oPJDcidqa5a9ecEjxHsqzZycKtNxfuy9vBrtecv5puqPuRKkVWuN6JPWW8b9FGEvpXpieWNX4RcBe3NeK5oD1FaKNVKVXDrmvF2Bo";

describe("Memo.decode", () => {
  it("opens a dhive memo whose shared secret dhive derived without the leading zero", () => {
    expect(Memo.decode(receiver, LEADING_ZERO)).toBe("#hello from dhive");
  });

  it("drops every leading zero byte the way dhive does", () => {
    expect(Memo.decode(receiver, TWO_LEADING_ZEROS)).toBe("#hello from dhive");
  });

  it("lets the sender open its own leading-zero memo", () => {
    const sender = PrivateKey.fromSeed("memo-spec-two-zero-5469");
    expect(Memo.decode(sender, TWO_LEADING_ZEROS)).toBe("#hello from dhive");
  });

  it("opens a dhive memo with an ordinary shared secret", () => {
    expect(Memo.decode(receiver, NORMAL)).toBe("#hello from dhive");
  });

  it("still rejects the wrong key", () => {
    const stranger = PrivateKey.fromSeed("memo-spec-stranger");
    expect(() => Memo.decode(stranger, LEADING_ZERO)).toThrow();
  });

  it("round-trips its own memos for the same leading-zero key pair", () => {
    const sender = PrivateKey.fromSeed("memo-spec-sender-331");
    const encoded = Memo.encode(sender, receiver.createPublic().toString(), "#own memo");
    expect(Memo.decode(receiver, encoded)).toBe("#own memo");
  });
});
