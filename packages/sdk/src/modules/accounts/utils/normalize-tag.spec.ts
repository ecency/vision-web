import { describe, expect, it } from "vitest";
import { normalizeTag } from "./normalize-tag";

// Mirrors the server rule exactly: a value that passes here is stored as-is, and a
// value that fails here would be refused with "not a valid tag" anyway.
describe("normalizeTag", () => {
  it("lowercases, trims and drops one leading hash", () => {
    expect(normalizeTag("photography")).toBe("photography");
    expect(normalizeTag("#Photography")).toBe("photography");
    expect(normalizeTag("  Contest-2026 ")).toBe("contest-2026");
    expect(normalizeTag("a".repeat(32))).toBe("a".repeat(32));
  });

  it("rejects anything that is not a usable tag", () => {
    expect(normalizeTag(undefined)).toBeNull();
    expect(normalizeTag(null)).toBeNull();
    expect(normalizeTag(123)).toBeNull();
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("#")).toBeNull();
    expect(normalizeTag("##photography")).toBeNull();
    expect(normalizeTag("a b")).toBeNull();
    expect(normalizeTag("photo_graphy")).toBeNull();
    expect(normalizeTag("a".repeat(33))).toBeNull();
  });

  // Communities are subscribed to on chain, not followed as tags.
  it("rejects community names but not tags that merely start with hive", () => {
    expect(normalizeTag("hive-123456")).toBeNull();
    expect(normalizeTag("#HIVE-139531")).toBeNull();
    expect(normalizeTag("hive-dev")).toBe("hive-dev");
    expect(normalizeTag("hive")).toBe("hive");
  });
});
