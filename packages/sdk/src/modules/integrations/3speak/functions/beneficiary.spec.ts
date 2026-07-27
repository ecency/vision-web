import { describe, expect, it } from "vitest";
import {
  enforceThreeSpeakBeneficiary,
  hasThreeSpeakEmbed,
  isThreeSpeakBeneficiary,
  THREESPEAK_BENEFICIARY_ACCOUNT,
  THREESPEAK_BENEFICIARY_WEIGHT,
  ThreeSpeakBeneficiaryRoute
} from "./beneficiary";

// Expected values are written out literally rather than imported from the constants: asserting
// against the constant would still pass if the constant itself were changed by mistake, which
// is the regression these tests exist to catch.
describe("3Speak embed beneficiaries", () => {
  describe("hasThreeSpeakEmbed", () => {
    it("detects an embed url in ?v= form", () => {
      expect(hasThreeSpeakEmbed("Watch: https://play.3speak.tv/embed?v=user/abcd1234")).toBe(true);
    });

    it("detects an embed url in path form", () => {
      expect(hasThreeSpeakEmbed("https://play.3speak.tv/embed/user/abc123")).toBe(true);
    });

    it("detects an embed url on any subdomain", () => {
      expect(
        hasThreeSpeakEmbed('<iframe src="https://cdn.3speak.tv/embed?v=user/abc"></iframe>')
      ).toBe(true);
    });

    it("does not match a plain text mention without a url", () => {
      expect(hasThreeSpeakEmbed("check out 3speak.tv/embed for more info")).toBe(false);
    });

    it("does not match a url without a protocol", () => {
      expect(hasThreeSpeakEmbed("visit play.3speak.tv/embed?v=user/abc")).toBe(false);
    });

    it("returns false for empty or unrelated content", () => {
      expect(hasThreeSpeakEmbed("")).toBe(false);
      expect(hasThreeSpeakEmbed("Hello world, this is a blog post")).toBe(false);
    });

    // Pins the contract with 3Speak: detection requires an `/embed` path segment. The embed url
    // comes back from 3Speak on upload rather than being built locally, so if that shape ever
    // changes this is the test that should fail, rather than the 11% route silently going
    // unattached on every video post.
    it("requires an /embed path segment", () => {
      expect(hasThreeSpeakEmbed("https://embed.3speak.tv/watch?v=user/abc")).toBe(false);
      expect(hasThreeSpeakEmbed("https://3speak.tv/watch?v=user/abc")).toBe(false);
    });
  });

  describe("enforceThreeSpeakBeneficiary", () => {
    const bodyWithEmbed = "Video: https://play.3speak.tv/embed?v=user/abcd1234";
    const bodyWithoutEmbed = "Just a regular post";

    it("returns the original list untouched when there is no embed", () => {
      const list: ThreeSpeakBeneficiaryRoute[] = [{ account: "alice", weight: 500 }];
      expect(enforceThreeSpeakBeneficiary(list, bodyWithoutEmbed)).toBe(list);
    });

    it("appends threespeakfund at 11% when an embed is present", () => {
      const list: ThreeSpeakBeneficiaryRoute[] = [{ account: "alice", weight: 500 }];
      expect(enforceThreeSpeakBeneficiary(list, bodyWithEmbed)).toEqual([
        { account: "alice", weight: 500 },
        { account: "threespeakfund", weight: 1100 }
      ]);
    });

    it("adds it to an empty list", () => {
      expect(enforceThreeSpeakBeneficiary([], bodyWithEmbed)).toEqual([
        { account: "threespeakfund", weight: 1100 }
      ]);
    });

    it("normalises an existing entry that carries the wrong weight", () => {
      const list: ThreeSpeakBeneficiaryRoute[] = [
        { account: "alice", weight: 500 },
        { account: "threespeakfund", weight: 500 }
      ];
      expect(enforceThreeSpeakBeneficiary(list, bodyWithEmbed)).toEqual([
        { account: "alice", weight: 500 },
        { account: "threespeakfund", weight: 1100 }
      ]);
    });

    it("returns the original list when the entry is already correct", () => {
      const list: ThreeSpeakBeneficiaryRoute[] = [
        { account: "alice", weight: 500 },
        { account: "threespeakfund", weight: 1100 }
      ];
      expect(enforceThreeSpeakBeneficiary(list, bodyWithEmbed)).toBe(list);
    });

    it("does not mutate the input list", () => {
      const list: ThreeSpeakBeneficiaryRoute[] = [{ account: "alice", weight: 500 }];
      const snapshot = structuredClone(list);
      enforceThreeSpeakBeneficiary(list, bodyWithEmbed);
      expect(list).toEqual(snapshot);
    });

    it("preserves extra fields such as src on the routes it keeps", () => {
      const list: ThreeSpeakBeneficiaryRoute[] = [
        { account: "alice", weight: 500, src: "ENCODER_PAY" }
      ];
      expect(enforceThreeSpeakBeneficiary(list, bodyWithEmbed)).toEqual([
        { account: "alice", weight: 500, src: "ENCODER_PAY" },
        { account: "threespeakfund", weight: 1100 }
      ]);
    });
  });

  describe("isThreeSpeakBeneficiary", () => {
    it("recognises the 3Speak account", () => {
      expect(isThreeSpeakBeneficiary("threespeakfund")).toBe(true);
    });

    it("rejects any other account", () => {
      expect(isThreeSpeakBeneficiary("alice")).toBe(false);
      expect(isThreeSpeakBeneficiary("")).toBe(false);
    });
  });

  // The values are a payout contract shared with 3Speak and applied by both apps.
  describe("constants", () => {
    it("pays threespeakfund 11%", () => {
      expect(THREESPEAK_BENEFICIARY_ACCOUNT).toBe("threespeakfund");
      expect(THREESPEAK_BENEFICIARY_WEIGHT).toBe(1100);
    });
  });
});
