import { vi } from "vitest";

// postBodySummary is globally mocked (render-helper). Re-mock as identity so the
// Tier-0 content-floor length reflects the test body deterministically.
vi.mock("@ecency/render-helper", () => ({
  postBodySummary: (b: string) => b ?? ""
}));

import { Entry, EntryVote } from "@/entities";
import {
  canonicalTarget,
  isIndexable,
  isContainerTree,
  CONTAINER_ACCOUNTS,
  WAVE_MIN_BODY_CHARS,
  EFFECTIVELY_EMPTY_MAX_BODY
} from "../../utils/entry-indexability";

const BASE = "https://ecency.com";
const longBody = "x".repeat(WAVE_MIN_BODY_CHARS + 20);
const shortBody = "gm";

const realPostBody = "x".repeat(500); // > CONTAINER_ANCHOR_MAX_BODY (400)
const vote = (voter: string): EntryVote => ({ voter, rshares: 0 });
const votes = (n: number): EntryVote[] => Array.from({ length: n }, () => vote("v"));

const makeEntry = (o: Partial<Entry>): Entry =>
  ({
    author: "alice",
    permlink: "a-post",
    depth: 0,
    body: longBody,
    children: 0,
    active_votes: [],
    json_metadata: {},
    author_reputation: 0,
    pending_payout_value: "0.000 HBD",
    curator_payout_value: "0.000 HBD",
    ...o
  }) as unknown as Entry;

// account=null + accountFetchFailed=true => reputation gate skipped (isolates logic)
const idx = (e: Entry) => isIndexable(e, null, true);

describe("canonicalTarget", () => {
  it("normal top-level post -> self", () => {
    const e = makeEntry({ depth: 0, author: "bob", permlink: "hello" });
    expect(canonicalTarget(e, BASE)).toBe("https://ecency.com/@bob/hello");
  });

  it("explicit canonical_url wins and strips www", () => {
    const e = makeEntry({ json_metadata: { canonical_url: "https://www.foo.bar/x" } });
    expect(canonicalTarget(e, BASE)).toBe("https://foo.bar/x");
  });

  // Sitemap mode (3rd arg) — regression for GSC "URL not allowed". The
  // sitemap NEVER consults the declared canonical: any declared value (inLeo/
  // PeakD/hive.blog mirror of the same on-chain post, with or without a
  // category prefix) is ignored and resolution is purely structural, so a
  // <loc> can only ever be on ecency.com.
  describe("ignoreDeclaredCanonical (sitemap mode)", () => {
    it("inLeo declared canonical is ignored -> on-domain self", () => {
      const e = makeEntry({
        author: "julie100",
        permlink: "movie-review-karate-kid--jxy",
        json_metadata: {
          canonical_url: "https://inleo.io/@julie100/movie-review-karate-kid--jxy"
        }
      });
      expect(canonicalTarget(e, BASE, true)).toBe(
        "https://ecency.com/@julie100/movie-review-karate-kid--jxy"
      );
    });

    it("PeakD declared canonical WITH category prefix is ignored -> on-domain self", () => {
      const e = makeEntry({
        author: "linkievichgabrie",
        permlink: "fakie-over-crooked-fakie-360-flip-out-skatepark-ezeiza-linkievich",
        category: "hive-106687",
        json_metadata: {
          canonical_url:
            "https://peakd.com/hive-106687/@linkievichgabrie/fakie-over-crooked-fakie-360-flip-out-skatepark-ezeiza-linkievich"
        }
      });
      expect(canonicalTarget(e, BASE, true)).toBe(
        "https://ecency.com/@linkievichgabrie/fakie-over-crooked-fakie-360-flip-out-skatepark-ezeiza-linkievich"
      );
    });

    it("page path (flag off) still returns the external declared canonical", () => {
      const e = makeEntry({
        author: "julie100",
        permlink: "movie-review-karate-kid--jxy",
        json_metadata: {
          canonical_url: "https://inleo.io/@julie100/movie-review-karate-kid--jxy"
        }
      });
      expect(canonicalTarget(e, BASE)).toBe(
        "https://inleo.io/@julie100/movie-review-karate-kid--jxy"
      );
    });

    it("declared canonical is ignored even when same-origin (purely structural)", () => {
      // Declared points at a *different* ecency path; sitemap must use the
      // structural self, proving it never reads canonical_url at all.
      const e = makeEntry({
        author: "bob",
        permlink: "hello",
        json_metadata: { canonical_url: "https://ecency.com/@bob/some-other-post" }
      });
      expect(canonicalTarget(e, BASE, true)).toBe("https://ecency.com/@bob/hello");
    });

    it("off-host declared canonical on a reply -> on-domain root, not external", () => {
      const e = makeEntry({
        depth: 1,
        author: "alice",
        permlink: "re-x",
        parent_author: "bob",
        parent_permlink: "the-post",
        json_metadata: { canonical_url: "https://peakd.com/@alice/re-x" }
      });
      expect(canonicalTarget(e, BASE, true)).toBe("https://ecency.com/@bob/the-post");
    });

    it("thin container anchor still -> null in sitemap mode (declared ignored)", () => {
      const e = makeEntry({
        author: "ecency.waves",
        permlink: "waves-2026",
        depth: 0,
        json_metadata: { canonical_url: "https://inleo.io/@ecency.waves/waves-2026" }
      });
      expect(canonicalTarget(e, BASE, true)).toBeNull();
    });
  });

  it("missing author/permlink -> null", () => {
    expect(canonicalTarget(makeEntry({ permlink: "" }), BASE)).toBeNull();
  });

  it("normal reply with root_* -> root post (any depth)", () => {
    const e = makeEntry({
      depth: 5,
      author: "alice",
      permlink: "re-x",
      parent_author: "carol",
      parent_permlink: "re-y",
      root_author: "bob",
      root_permlink: "the-post"
    });
    expect(canonicalTarget(e, BASE)).toBe("https://ecency.com/@bob/the-post");
  });

  it("normal depth-1 reply without root_* -> parent (parent is root)", () => {
    const e = makeEntry({
      depth: 1,
      author: "alice",
      permlink: "re-x",
      parent_author: "bob",
      parent_permlink: "the-post"
    });
    expect(canonicalTarget(e, BASE)).toBe("https://ecency.com/@bob/the-post");
  });

  it("normal deep reply with no resolvable root -> null", () => {
    const e = makeEntry({ depth: 4, parent_author: "x", parent_permlink: "y" });
    expect(canonicalTarget(e, BASE)).toBeNull();
  });

  it("container anchor post (depth 0, thin body) -> null", () => {
    const e = makeEntry({ author: "ecency.waves", permlink: "waves-2026", depth: 0 });
    expect(canonicalTarget(e, BASE)).toBeNull();
  });

  it("substantive depth-0 post BY a container account -> self (not anchor-suppressed)", () => {
    const e = makeEntry({
      author: "ecency.waves",
      permlink: "waves-feature-announcement",
      depth: 0,
      body: realPostBody
    });
    expect(canonicalTarget(e, BASE)).toBe(
      "https://ecency.com/@ecency.waves/waves-feature-announcement"
    );
  });

  it("wave (depth 1 under container) -> self", () => {
    const e = makeEntry({
      author: "alice",
      permlink: "my-wave",
      depth: 1,
      parent_author: "ecency.waves",
      root_author: "ecency.waves",
      root_permlink: "waves-2026"
    });
    expect(canonicalTarget(e, BASE)).toBe("https://ecency.com/@alice/my-wave");
  });

  it("bridge-fallback depth-1 wave (no root_*) -> self, NOT the anchor (P1 regression)", () => {
    const e = makeEntry({
      author: "alice",
      permlink: "my-wave",
      depth: 1,
      parent_author: "ecency.waves",
      parent_permlink: "waves-2026"
      // root_author/root_permlink absent — bridge.get_post shape
    });
    expect(canonicalTarget(e, BASE)).toBe("https://ecency.com/@alice/my-wave");
  });

  it("reply to a wave (depth 2) -> the wave (its parent)", () => {
    const e = makeEntry({
      author: "carol",
      permlink: "re-wave",
      depth: 2,
      parent_author: "alice",
      parent_permlink: "my-wave",
      root_author: "ecency.waves",
      root_permlink: "waves-2026"
    });
    expect(canonicalTarget(e, BASE)).toBe("https://ecency.com/@alice/my-wave");
  });

  it("deep wave sub-reply (depth >= 3) -> null", () => {
    const e = makeEntry({
      depth: 3,
      parent_author: "carol",
      parent_permlink: "re-wave",
      root_author: "peak.snaps",
      root_permlink: "snap-container"
    });
    expect(canonicalTarget(e, BASE)).toBeNull();
  });
});

describe("isContainerTree", () => {
  it("true when root author is a known container account", () => {
    expect(isContainerTree(makeEntry({ root_author: "leothreads", depth: 1 }))).toBe(true);
  });
  it("false for normal threads", () => {
    expect(isContainerTree(makeEntry({ root_author: "bob", depth: 1 }))).toBe(false);
  });
  it("true for bridge-fallback depth-1 wave (no root_*, parent is container)", () => {
    expect(
      isContainerTree(makeEntry({ depth: 1, parent_author: "ecency.waves" }))
    ).toBe(true);
  });
  it("all six container accounts recognised", () => {
    for (const a of [
      "leothreads",
      "ecency.waves",
      "peak.snaps",
      "liketu.moments",
      "liketu.speak",
      "hive.flow"
    ]) {
      expect(CONTAINER_ACCOUNTS.has(a)).toBe(true);
    }
  });
});

describe("isIndexable - structure", () => {
  it("normal post indexable", () => {
    expect(idx(makeEntry({ depth: 0 }))).toBe(true);
  });
  it("normal reply with resolvable root indexable", () => {
    expect(
      idx(makeEntry({ depth: 2, root_author: "bob", root_permlink: "p" }))
    ).toBe(true);
  });
  it("normal deep reply with no root NOT indexable", () => {
    expect(idx(makeEntry({ depth: 4, parent_author: "x", parent_permlink: "y" }))).toBe(false);
  });
  it("container anchor post (thin) NOT indexable", () => {
    expect(idx(makeEntry({ author: "ecency.waves", depth: 0 }))).toBe(false);
  });
  it("substantive depth-0 post by a container account IS indexable", () => {
    expect(
      idx(makeEntry({ author: "peak.snaps", depth: 0, body: realPostBody }))
    ).toBe(true);
  });
  it("reply to wave (depth 2) indexable", () => {
    expect(
      idx(
        makeEntry({
          depth: 2,
          parent_author: "alice",
          parent_permlink: "w",
          root_author: "ecency.waves"
        })
      )
    ).toBe(true);
  });
  it("deep wave sub-reply (depth 3) NOT indexable", () => {
    expect(idx(makeEntry({ depth: 3, root_author: "ecency.waves" }))).toBe(false);
  });

  // Symmetry with the sitemap writer: a depth>=2 reply whose ONLY canonical is
  // an external declared one (no resolvable on-domain root) is indexable for
  // the page (flag off) but must be rejected here in sitemap mode (flag on),
  // so the indexable count can't drift from the emitted posts.xml.
  it("reply with only an external declared canonical: page-indexable, sitemap-rejected", () => {
    const e = makeEntry({
      depth: 2,
      parent_author: "x",
      parent_permlink: "y",
      json_metadata: { canonical_url: "https://inleo.io/@a/b" }
    });
    expect(isIndexable(e, null, true)).toBe(true); // page path (flag off)
    expect(isIndexable(e, null, true, true)).toBe(false); // sitemap mode
  });
});

describe("wave quality gate (depth-1 under container)", () => {
  const wave = (o: Partial<Entry>) =>
    makeEntry({
      author: "alice",
      permlink: "w",
      depth: 1,
      parent_author: "ecency.waves",
      root_author: "ecency.waves",
      root_permlink: "waves-2026",
      ...o
    });

  it("Tier0 fail: short body -> not indexable", () => {
    expect(idx(wave({ body: shortBody, children: 99 }))).toBe(false);
  });

  it("Tier1 pass via children", () => {
    expect(idx(wave({ body: longBody, children: 3 }))).toBe(true);
  });

  it("Tier1 fail: long body but no engagement", () => {
    expect(idx(wave({ body: longBody, children: 0, active_votes: [] }))).toBe(false);
  });

  it("Tier1 pass via voters + payout", () => {
    expect(
      idx(
        wave({
          children: 0,
          active_votes: votes(6),
          pending_payout_value: "0.500 HBD"
        })
      )
    ).toBe(true);
  });

  it("gaming: high payout but only 1 voter -> fail", () => {
    expect(
      idx(
        wave({
          children: 0,
          active_votes: [vote("self")],
          pending_payout_value: "50.000 HBD"
        })
      )
    ).toBe(false);
  });

  it("gaming: many voters but dust payout -> fail", () => {
    expect(
      idx(
        wave({
          children: 0,
          active_votes: votes(40),
          pending_payout_value: "0.001 HBD"
        })
      )
    ).toBe(false);
  });

  it("payout is source-agnostic (numeric payout field counts)", () => {
    expect(
      idx(
        wave({
          children: 0,
          active_votes: votes(6),
          pending_payout_value: "0.000 HBD",
          payout: 1.23
        } as Partial<Entry>)
      )
    ).toBe(true);
  });
});

describe("isIndexable - NSFW and reputation gates", () => {
  it("nsfw tag -> not indexable even for a normal post", () => {
    const e = makeEntry({ depth: 0, json_metadata: { tags: ["nsfw"] } });
    expect(idx(e)).toBe(false);
  });

  it("low-reputation author -> not indexable when account known", () => {
    const e = makeEntry({ depth: 0 });
    expect(isIndexable(e, { reputation: 0, post_count: 0 }, false)).toBe(false);
  });

  it("account fetch failed -> reputation gate skipped (not punished)", () => {
    const e = makeEntry({ depth: 0 });
    expect(isIndexable(e, null, true)).toBe(true);
  });
});

describe("B1 - indexability depends only on signals we own (#1524)", () => {
  // The spaminator feed used to veto indexing here. It was removed: an
  // external list we neither control nor review was noindexing established
  // authors (reputation 70+, thousands of posts) and, via the sitemap cron
  // gate, could stall sitemap publication whenever its host was unreachable.
  // Abuse still lands, one step later — downvotes cut reputation, and the
  // reputation gate below rejects the author on the next render.

  it("reputation alone decides for an otherwise-fine post", () => {
    const e = makeEntry({ author: "flagged", depth: 0, body: longBody });
    expect(isIndexable(e, { reputation: 72, post_count: 500 }, false)).toBe(true);
    expect(isIndexable(e, { reputation: 30, post_count: 500 }, false)).toBe(false);
  });

  it("a downvoted author drops out of the index without any external list", () => {
    const e = makeEntry({ author: "wasfine", depth: 0, body: longBody });
    expect(isIndexable(e, { reputation: 55, post_count: 900 }, false)).toBe(true);
    // same author after downvotes push reputation under the threshold
    expect(isIndexable(e, { reputation: 12, post_count: 900 }, false)).toBe(false);
  });

  it("the 4th argument is ignoreDeclaredCanonical, not a blacklist", () => {
    const reply = makeEntry({
      author: "alice",
      depth: 1,
      parent_author: "bob",
      parent_permlink: "root",
      body: longBody,
      json_metadata: { canonical_url: "https://example.com/elsewhere" }
    });
    // sitemap mode (true) must ignore the declared off-host canonical
    expect(isIndexable(reply, null, true, true)).toBe(true);
  });
});

describe("B2 - effectively-empty guard (multimodal-safe)", () => {
  it("normal post, no prose + no media -> noindex", () => {
    expect(idx(makeEntry({ depth: 0, body: "gm", json_metadata: {} }))).toBe(false);
  });

  it("short caption + json_metadata.image -> indexed (photo post safe)", () => {
    const e = makeEntry({
      depth: 0,
      body: "nice",
      json_metadata: { image: ["https://images.ecency.com/p.jpg"] }
    });
    expect(idx(e)).toBe(true);
  });

  it("short body with markdown image -> indexed (media present)", () => {
    expect(idx(makeEntry({ depth: 0, body: "![](u)", json_metadata: {} }))).toBe(true);
  });

  it("prose at the floor -> indexed (only the truly contentless is caught)", () => {
    const e = makeEntry({ depth: 0, body: "x".repeat(EFFECTIVELY_EMPTY_MAX_BODY) });
    expect(idx(e)).toBe(true);
  });

  it("guard is scoped to normal top-level posts — not replies", () => {
    // depth-2 reply with empty body: governed by canonical-to-root, NOT the
    // empty guard (which only applies to the depth-0 normal branch).
    const reply = makeEntry({
      depth: 2,
      body: "gm",
      root_author: "bob",
      root_permlink: "the-post",
      json_metadata: {}
    });
    expect(idx(reply)).toBe(true);
  });
});

describe("single-source-of-truth (sitemap generator must call this same predicate)", () => {
  it("isIndexable is deterministic for identical inputs", () => {
    const e = makeEntry({ depth: 0, body: longBody });
    expect(isIndexable(e, null, true)).toBe(isIndexable(e, null, true));
    expect(isIndexable(e, null, true, true)).toBe(isIndexable(e, null, true, true));
  });
});
