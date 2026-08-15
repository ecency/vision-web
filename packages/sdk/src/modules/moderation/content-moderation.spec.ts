import { describe, it, expect } from "vitest";
import {
  ContentModerationReason,
  getContentModerationReason,
  isAuthorMuted,
  isHiddenPost,
  isLowTrustSeoPost
} from "./content-moderation";
import { hasExternalLink } from "./external-links";

describe("hasExternalLink", () => {
  it("detects a bare outbound URL", () => {
    expect(hasExternalLink("Visit https://nailsalon.example.com today")).toBe(true);
  });

  it("detects an outbound markdown link", () => {
    expect(hasExternalLink("[my site](https://imghelpinghands.example/page)")).toBe(true);
  });

  it("ignores Hive/Ecency internal links", () => {
    expect(hasExternalLink("see [post](https://ecency.com/@a/b) and https://peakd.com/@a/b")).toBe(
      false
    );
  });

  it("ignores newer Hive frontend links (snapie.io, hivesuite.app)", () => {
    expect(hasExternalLink("read https://snapie.io/@a/b and https://hivesuite.app/hive/@a/b")).toBe(
      false
    );
  });

  it("ignores embedded images (extension and image hosts)", () => {
    expect(hasExternalLink("![pic](https://images.ecency.com/abc.jpg)")).toBe(false);
    expect(hasExternalLink("![pic](https://i.imgur.com/abc.png)")).toBe(false);
    expect(hasExternalLink("![pic](https://other.example/photo.webp)")).toBe(false);
  });

  it("returns false for empty / missing body", () => {
    expect(hasExternalLink("")).toBe(false);
    expect(hasExternalLink(undefined)).toBe(false);
    expect(hasExternalLink("plain text, no links")).toBe(false);
  });

  it("strips trailing prose punctuation (no false positive on internal link + comma)", () => {
    expect(hasExternalLink("see https://ecency.com, and enjoy")).toBe(false);
  });

  it("still detects an outbound link followed by punctuation", () => {
    expect(hasExternalLink("visit https://shop.example.")).toBe(true);
  });

  it("detects protocol-relative outbound links", () => {
    expect(hasExternalLink("[promo](//shop.example/page)")).toBe(true);
  });

  it("ignores protocol-relative internal links", () => {
    expect(hasExternalLink("see //peakd.com/@a/b")).toBe(false);
  });

  it("ignores stray // tokens without a domain", () => {
    expect(hasExternalLink("a // b and 10//5")).toBe(false);
  });
});

describe("isLowTrustSeoPost", () => {
  it("flags a low-reputation author with an outbound link", () => {
    expect(isLowTrustSeoPost({ author_reputation: 20, body: "promo https://shop.example" })).toBe(
      true
    );
  });

  it("does not flag a high-reputation author with an outbound link", () => {
    expect(isLowTrustSeoPost({ author_reputation: 65, body: "promo https://shop.example" })).toBe(
      false
    );
  });

  it("does not flag a low-reputation author without an outbound link", () => {
    expect(
      isLowTrustSeoPost({ author_reputation: 20, body: "hello [post](https://ecency.com/@a/b)" })
    ).toBe(false);
  });

  it("treats brand-new accounts (raw reputation 0 -> 25) as low trust", () => {
    expect(isLowTrustSeoPost({ author_reputation: 0, body: "https://shop.example" })).toBe(true);
  });

  it("does not flag a post whose feed omits the author's reputation", () => {
    expect(isLowTrustSeoPost({ body: "https://shop.example" })).toBe(false);
    expect(
      isLowTrustSeoPost({ author_reputation: undefined, body: "https://shop.example" })
    ).toBe(false);
  });

  it("accepts raw (unscaled) reputation straight off the bridge", () => {
    // ~68 on the human scale
    expect(
      isLowTrustSeoPost({ author_reputation: 25000000000000, body: "https://shop.example" })
    ).toBe(false);
  });
});

describe("isHiddenPost", () => {
  it("needs both strongly negative rshares and enough voters", () => {
    expect(isHiddenPost(-20000000000, 5)).toBe(true);
    expect(isHiddenPost(-20000000000, 4)).toBe(false);
    expect(isHiddenPost(-9000000000, 20)).toBe(false);
  });

  it("treats a missing rshares value as neutral", () => {
    expect(isHiddenPost(undefined, 50)).toBe(false);
  });
});

describe("isAuthorMuted", () => {
  it("matches an author on the viewer's mute list", () => {
    expect(isAuthorMuted("spammer", ["someone", "spammer"])).toBe(true);
  });

  it("is false without an author or without a list", () => {
    expect(isAuthorMuted("spammer", [])).toBe(false);
    expect(isAuthorMuted("spammer", undefined)).toBe(false);
    expect(isAuthorMuted(undefined, ["spammer"])).toBe(false);
  });
});

describe("getContentModerationReason", () => {
  it("reports a moderator action ahead of every heuristic", () => {
    expect(
      getContentModerationReason({
        stats: { gray: true, total_votes: 40 },
        net_rshares: -50000000000,
        author_reputation: 5,
        body: "https://shop.example"
      })
    ).toBe(ContentModerationReason.MOD_MUTED);
  });

  it("treats hivemind's hide flag as a moderator action too", () => {
    expect(getContentModerationReason({ stats: { hide: true } })).toBe(
      ContentModerationReason.MOD_MUTED
    );
  });

  it("reports downvotes ahead of low trust, since downvotes sink reputation", () => {
    expect(
      getContentModerationReason({
        net_rshares: -50000000000,
        stats: { total_votes: 9 },
        author_reputation: 5,
        body: "https://shop.example"
      })
    ).toBe(ContentModerationReason.DOWNVOTED);
  });

  it("falls back to active_votes when stats are absent", () => {
    expect(
      getContentModerationReason({
        net_rshares: -50000000000,
        active_votes: [{}, {}, {}, {}, {}]
      })
    ).toBe(ContentModerationReason.DOWNVOTED);
  });

  it("prefers hivemind's total_votes over an optimistic active_votes array", () => {
    expect(
      getContentModerationReason({
        net_rshares: -50000000000,
        stats: { total_votes: 2 },
        active_votes: [{}, {}, {}, {}, {}, {}]
      })
    ).toBe(null);
  });

  it("reports low trust for a small account promoting an outbound link", () => {
    expect(
      getContentModerationReason({ author_reputation: 12, body: "buy at https://shop.example" })
    ).toBe(ContentModerationReason.LOW_TRUST);
  });

  it("leaves a low-reputation author with no outbound link alone", () => {
    expect(getContentModerationReason({ author_reputation: 12, body: "just my diary" })).toBe(null);
  });

  it("returns null for healthy content and for nothing at all", () => {
    expect(
      getContentModerationReason({
        author_reputation: 70,
        body: "hello",
        net_rshares: 5000,
        stats: { gray: false, total_votes: 3 }
      })
    ).toBe(null);
    expect(getContentModerationReason(undefined)).toBe(null);
    expect(getContentModerationReason(null)).toBe(null);
  });
});
