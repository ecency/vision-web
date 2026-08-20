import { describe, it, expect } from "vitest";
import {
  SITEMAP_SHARDS,
  OPERATOR_SHARDS,
  isKnownShard,
  isRetiredShard
} from "@/features/seo/sitemap-shards";

describe("sitemap-shards", () => {
  describe("isKnownShard", () => {
    it("accepts every shard the generator emits", () => {
      for (const shard of SITEMAP_SHARDS) {
        expect(isKnownShard(shard)).toBe(true);
      }
    });

    it("rejects unknown names (route serves these as 404)", () => {
      expect(isKnownShard("posts-0.xml")).toBe(false);
      expect(isKnownShard("posts-2.xml")).toBe(false);
      expect(isKnownShard("nope.xml")).toBe(false);
      expect(isKnownShard("")).toBe(false);
    });

    it("is exact-match, not prefix or case insensitive", () => {
      expect(isKnownShard("Posts.xml")).toBe(false);
      expect(isKnownShard("posts")).toBe(false);
      expect(isKnownShard("posts.xml.bak")).toBe(false);
    });
  });

  describe("isRetiredShard", () => {
    // Regression: "posts-1.xml" sat in RETIRED_SHARDS long after every
    // environment had regenerated past the rename, so /sitemap/posts-1.xml
    // served a permanent 503 + Retry-After for ~3 weeks. Crawlers retry that
    // forever rather than dropping the URL. Outside an active rename window
    // the retired set belongs empty, and a retired name must never also be a
    // known shard (the route checks retired first, which would mask a live one).
    it("is empty outside a rename window", () => {
      expect(isRetiredShard("posts-1.xml")).toBe(false);
      expect(isRetiredShard("posts-0.xml")).toBe(false);
      expect(isRetiredShard("nope.xml")).toBe(false);
    });

    it("never overlaps the live shard allowlist", () => {
      for (const shard of SITEMAP_SHARDS) {
        expect(isRetiredShard(shard)).toBe(false);
      }
    });
  });

  describe("operator shards", () => {
    it("are known to the public route but never part of the generated set", () => {
      for (const shard of OPERATOR_SHARDS) {
        expect(isKnownShard(shard)).toBe(true);
        expect((SITEMAP_SHARDS as readonly string[]).includes(shard)).toBe(false);
      }
    });
  });
});
