import { describe, it, expect } from "vitest";
import { getGroupChannelName, normalizeGroupName } from "@/server/chat-group-name";

describe("normalizeGroupName", () => {
  it("trims, folds whitespace and drops control and direction characters", () => {
    expect(normalizeGroupName("  Book\tclub\n\n night ")).toBe("Book club night");
    const rtlOverride = String.fromCharCode(0x202e);
    const zeroWidth = String.fromCharCode(0x200b);
    expect(normalizeGroupName(`a${rtlOverride}b${zeroWidth}c`)).toBe("a b c");
  });

  it("keeps the joiners that emoji sequences and some scripts need", () => {
    const zwj = String.fromCharCode(0x200d);
    const zwnj = String.fromCharCode(0x200c);
    const family = `👨${zwj}👩${zwj}👧`;
    expect(normalizeGroupName(family)).toBe(family);
    expect(normalizeGroupName(`می${zwnj}خواهم`)).toBe(`می${zwnj}خواهم`);
  });

  it("allows clearing and caps the length by characters, not bytes", () => {
    expect(normalizeGroupName("   ")).toBe("");
    expect(normalizeGroupName("🙂".repeat(64))).toBe("🙂".repeat(64));
    expect(normalizeGroupName("x".repeat(65))).toBeNull();
    expect(normalizeGroupName(undefined)).toBeNull();
  });
});

describe("getGroupChannelName", () => {
  it("matches Mattermost's SHA-1 of the sorted member ids, whatever the order", () => {
    const ids = ["me0000000000000000000000aa", "carol000000000000000000000", "bob00000000000000000000000"];
    expect(getGroupChannelName(ids)).toBe("642385f1f0fc91133d89959f955b655d3fe927d6");
    expect(getGroupChannelName([...ids].reverse())).toBe(getGroupChannelName(ids));
    // The caller's array is left as it was.
    expect(ids[0]).toBe("me0000000000000000000000aa");
  });
});
