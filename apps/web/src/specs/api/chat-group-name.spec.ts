import { describe, it, expect, vi } from "vitest";
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

describe("hasPreference", () => {
  it("matches the category, the name and a true value only", async () => {
    const { hasPreference } = await vi.importActual<typeof import("@/server/mattermost")>(
      "@/server/mattermost"
    );
    const prefs = [
      { category: "ecency_group_owner", name: "g1", value: "true" },
      { category: "ecency_group_owner", name: "g2", value: "false" },
      { category: "group_channel_show", name: "g3", value: "true" }
    ];
    expect(hasPreference(prefs, "ecency_group_owner", "g1")).toBe(true);
    expect(hasPreference(prefs, "ecency_group_owner", "g2")).toBe(false);
    expect(hasPreference(prefs, "ecency_group_owner", "g3")).toBe(false);
    expect(hasPreference(undefined, "ecency_group_owner", "g1")).toBe(false);
  });
});
