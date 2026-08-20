import { describe, it, expect } from "vitest";
import { isEmittableTag, harvestPostTags, selectTopTags } from "@/features/seo/sitemap-tags";

describe("sitemap-tags", () => {
  describe("isEmittableTag", () => {
    it("accepts valid bare hive tags (incl. internal hyphens/digits)", () => {
      expect(isEmittableTag("photography")).toBe(true);
      expect(isEmittableTag("hive-blog")).toBe(true);
      expect(isEmittableTag("web3")).toBe(true);
      expect(isEmittableTag("a")).toBe(true);
    });

    it("rejects community ids (owned by communities.xml)", () => {
      expect(isEmittableTag("hive-125125")).toBe(false);
      expect(isEmittableTag("hive-1")).toBe(false);
    });

    it("rejects @author feeds, empty, uppercase, spaces, edge hyphens, non-ascii", () => {
      expect(isEmittableTag("@ecency")).toBe(false);
      expect(isEmittableTag("")).toBe(false);
      expect(isEmittableTag("Photo")).toBe(false);
      expect(isEmittableTag("a b")).toBe(false);
      expect(isEmittableTag("-lead")).toBe(false);
      expect(isEmittableTag("trail-")).toBe(false);
      expect(isEmittableTag("café")).toBe(false);
    });

    it("rejects NSFW tags incl. compound single-token forms (no \\b boundary)", () => {
      expect(isEmittableTag("nsfw")).toBe(false);
      expect(isEmittableTag("porn")).toBe(false);
      expect(isEmittableTag("nudeart")).toBe(false);
      expect(isEmittableTag("xporn")).toBe(false);
      expect(isEmittableTag("aporn")).toBe(false);
      expect(isEmittableTag("softnude")).toBe(false);
    });
  });

  describe("harvestPostTags", () => {
    it("counts category + tags, deduped within a single post", () => {
      const c = new Map<string, number>();
      harvestPostTags(c, "photography", ["photography", "art", "art"]);
      expect(c.get("photography")).toBe(1); // category === a tag -> counted once
      expect(c.get("art")).toBe(1);
    });

    it("lowercases/trims and ignores empties / non-strings", () => {
      const c = new Map<string, number>();
      harvestPostTags(c, "  Travel ", ["Nature", "", 5 as unknown as string, null]);
      expect(c.get("travel")).toBe(1);
      expect(c.get("nature")).toBe(1);
      expect(c.has("")).toBe(false);
    });

    it("accumulates across posts", () => {
      const c = new Map<string, number>();
      harvestPostTags(c, "art", ["x"]);
      harvestPostTags(c, "art", ["y"]);
      harvestPostTags(c, null, undefined);
      expect(c.get("art")).toBe(2);
    });
  });

  describe("selectTopTags", () => {
    it("applies minCount, drops non-emittable, caps at limit, sorts count desc then tag asc", () => {
      const counts = new Map<string, number>([
        ["photography", 5],
        ["art", 5], // ties with photography -> alpha: art before photography
        ["travel", 3],
        ["rare", 1], // below minCount
        ["hive-1", 9], // community excluded
        ["nsfw", 9], // nsfw excluded
        ["web3", 2]
      ]);
      expect(selectTopTags(counts, 3, 2)).toEqual(["art", "photography", "travel"]);
    });

    it("respects the limit", () => {
      const counts = new Map<string, number>([
        ["a", 3],
        ["b", 3],
        ["c", 3]
      ]);
      expect(selectTopTags(counts, 2, 1)).toEqual(["a", "b"]);
    });

    it("returns [] when nothing clears minCount", () => {
      expect(selectTopTags(new Map([["x", 1]]), 10, 2)).toEqual([]);
    });
  });

  describe("harvestPostTags latest-day tracking", () => {
    it("records the newest post day per tag when asked, and stays inert otherwise", () => {
      const counts = new Map<string, number>();
      const latest = new Map<string, string>();
      harvestPostTags(counts, "photography", ["Travel"], latest, "2026-08-18");
      harvestPostTags(counts, "travel", ["photography"], latest, "2026-08-20");
      harvestPostTags(counts, "photography", [], latest, "2026-08-19");
      expect(counts.get("photography")).toBe(3);
      expect(latest.get("photography")).toBe("2026-08-20");
      expect(latest.get("travel")).toBe("2026-08-20");
      // Without a day nothing is recorded, and existing dates are not erased.
      harvestPostTags(counts, "photography", [], latest);
      expect(latest.get("photography")).toBe("2026-08-20");
      expect(counts.get("photography")).toBe(4);
    });
  });
});
