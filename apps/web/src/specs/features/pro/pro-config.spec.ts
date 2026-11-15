import {
  isProMember,
  PRO_PRICE_USD,
  PRO_SKU,
  proMembersSet,
  withProMember
} from "@/features/pro/pro-config";
import { describe, expect, it } from "vitest";

describe("pro-config", () => {
  it("uses the $19.99/yr Pro SKU (leading number = price in cents)", () => {
    expect(PRO_SKU).toBe("1999pro");
    expect(PRO_PRICE_USD).toBe(19.99);
  });

  describe("proMembersSet", () => {
    it("lowercases usernames for case-insensitive membership", () => {
      const set = proMembersSet(["Alice", "BOB"]);
      expect(set.has("alice")).toBe(true);
      expect(set.has("bob")).toBe(true);
    });

    it("returns an empty set for undefined input", () => {
      expect(proMembersSet().size).toBe(0);
    });
  });

  describe("isProMember", () => {
    it("matches a member case-insensitively", () => {
      expect(isProMember(["alice", "bob"], "Alice")).toBe(true);
      expect(isProMember(["alice"], "alice")).toBe(true);
    });

    it("is false for a non-member", () => {
      expect(isProMember(["alice"], "bob")).toBe(false);
    });

    it("is false when username or roster is missing", () => {
      expect(isProMember(["alice"], null)).toBe(false);
      expect(isProMember(["alice"], undefined)).toBe(false);
      expect(isProMember(undefined, "alice")).toBe(false);
    });
  });

  // The roster is an unvalidated JSON response (#2087 review).
  describe("a malformed roster", () => {
    it("does not throw in isProMember", () => {
      expect(isProMember({} as unknown as string[], "alice")).toBe(false);
      expect(isProMember([null, "Alice"] as unknown as string[], "alice")).toBe(true);
    });
  });

  // The optimistic roster write after a Pro payment.
  describe("withProMember", () => {
    it("adds the buyer and bumps the count", () => {
      expect(withProMember({ members: ["bob"], count: 1 }, "alice")).toEqual({
        members: ["bob", "alice"],
        count: 2
      });
    });

    it("starts a roster when none is cached", () => {
      expect(withProMember(undefined, "alice")).toEqual({ members: ["alice"], count: 1 });
    });

    it("keeps the roster when the buyer is already in it, whatever the case", () => {
      const prev = { members: ["Alice"], count: 1 };
      expect(withProMember(prev, "alice")).toBe(prev);
    });

    it("replaces a malformed cached roster instead of throwing", () => {
      const prev = { members: {} as unknown as string[], count: 3 };
      expect(withProMember(prev, "alice")).toEqual({ members: ["alice"], count: 1 });
    });
  });
});
