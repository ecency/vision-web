import { describe, it, expect } from "vitest";
import { normalizeGroupName, wasCreatedNow } from "@/server/chat-group-name";

describe("normalizeGroupName", () => {
  it("trims, folds whitespace and drops control and direction characters", () => {
    expect(normalizeGroupName("  Book\tclub\n\n night ")).toBe("Book club night");
    const rtlOverride = String.fromCharCode(0x202e);
    const zeroWidth = String.fromCharCode(0x200b);
    expect(normalizeGroupName(`a${rtlOverride}b${zeroWidth}c`)).toBe("a b c");
  });

  it("allows clearing and caps the length by characters, not bytes", () => {
    expect(normalizeGroupName("   ")).toBe("");
    expect(normalizeGroupName("🙂".repeat(64))).toBe("🙂".repeat(64));
    expect(normalizeGroupName("x".repeat(65))).toBeNull();
    expect(normalizeGroupName(undefined)).toBeNull();
  });
});

describe("wasCreatedNow", () => {
  it("accepts a group created during the request, allowing for clock drift", () => {
    const started = 1_000_000;
    expect(wasCreatedNow(started + 10, started)).toBe(true);
    expect(wasCreatedNow(started - 4_000, started)).toBe(true);
    expect(wasCreatedNow(started - 60_000, started)).toBe(false);
    expect(wasCreatedNow(undefined, started)).toBe(false);
  });
});
