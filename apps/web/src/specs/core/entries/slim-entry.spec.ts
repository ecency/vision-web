import { describe, expect, it } from "vitest";
import { postBodySummary } from "@ecency/render-helper";
import { ContentModerationReason } from "@ecency/sdk";
import {
  SLIM_KEY_MARKER,
  slimEntry,
  slimEntryPage,
  withSlimEntries
} from "@/core/entries/slim-entry";
import { getEntryModerationReason } from "@/core/entries/entry-moderation";
import type { Entry } from "@/entities";
import { mockEntry } from "@/specs/test-utils";

// render-helper memoizes summaries and images per author/permlink/update, so each
// fixture needs its own permlink or one test reads another's cached summary.
let seq = 0;

function entry(overrides: Partial<Entry> = {}): Entry {
  return mockEntry({ permlink: `slim-fixture-${++seq}`, ...overrides });
}

describe("slimEntry", () => {
  it("drops the body", () => {
    expect(slimEntry(entry()).body).toBe("");
  });

  it("keeps an author-written description untouched", () => {
    const e = entry({ json_metadata: { description: "  Author summary  " } });
    expect(slimEntry(e).json_metadata?.description).toBe("Author summary");
  });

  it("derives the same summary the card renders when there is no description", () => {
    const e = entry();
    expect(slimEntry(e).json_metadata?.description).toBe(postBodySummary(e, 200).trim());
  });

  it("falls back to the title when the body yields no summary", () => {
    const e = entry({
      title: "Photo of the day",
      body: "![](https://images.hive.blog/x.png)"
    });
    expect(slimEntry(e).json_metadata?.description).toBe("Photo of the day");
  });

  it("prefers json_metadata.thumbnails over image for the card thumbnail", () => {
    const e = entry({
      json_metadata: {
        thumbnails: ["https://images.hive.blog/thumb.png"],
        image: ["https://images.hive.blog/cover.png"]
      }
    });
    expect(slimEntry(e).json_metadata?.image).toEqual(["https://images.hive.blog/thumb.png"]);
  });

  it("falls back to image[0] when there is no thumbnails entry", () => {
    const e = entry({ json_metadata: { image: ["https://images.hive.blog/cover.png"] } });
    expect(slimEntry(e).json_metadata?.image).toEqual(["https://images.hive.blog/cover.png"]);
  });

  it("keeps the first body image when metadata carries none", () => {
    const e = entry({
      json_metadata: {},
      body: "intro\n\n![pic](https://images.hive.blog/in-body.png)\n\nrest"
    });
    expect(slimEntry(e).json_metadata?.image).toEqual(["https://images.hive.blog/in-body.png"]);
  });

  it("leaves image unset when nothing supplies one, so the card renders without a thumbnail", () => {
    const e = entry({ json_metadata: {}, body: "just words, no pictures at all" });
    expect(slimEntry(e).json_metadata?.image).toBeUndefined();
  });

  it("lifts a worldmappin body marker into json_metadata.location as numbers", () => {
    const e = entry({
      body: "trip notes\n\n[//]:# (!worldmappin -12.5 lat 33.25 long Somewhere d3scr)"
    });
    expect(slimEntry(e).json_metadata?.location).toEqual({
      coordinates: { lat: -12.5, lng: 33.25 },
      address: "Somewhere"
    });
  });

  it("drops a malformed worldmappin marker rather than storing a broken pin", () => {
    const e = entry({
      body: "trip notes\n\n[//]:# (!worldmappin 12.5.6 lat 33.25 long Somewhere d3scr)"
    });
    expect(slimEntry(e).json_metadata?.location).toBeUndefined();
  });

  it("slims the nested original_entry a cross-post card reads from", () => {
    const original = entry({ author: "bob", body: "original body text" });
    const slim = slimEntry(entry({ original_entry: original }));
    expect(slim.original_entry?.body).toBe("");
    expect(slim.original_entry?.json_metadata?.description).toBeTruthy();
  });

  it("passes through an entry that has no body already", () => {
    const e = entry({ body: "" });
    expect(slimEntry(e)).toBe(e);
  });
});

describe("getEntryModerationReason", () => {
  const lowRepAuthor = { author_reputation: 25, net_rshares: 0, active_votes: [] };

  it("still flags a low-trust post whose body link was recorded before the strip", () => {
    const e = entry({
      ...lowRepAuthor,
      body: "check my shop https://spam-shop.example/deal"
    });
    expect(getEntryModerationReason(e)).toBe(ContentModerationReason.LOW_TRUST);
    expect(getEntryModerationReason(slimEntry(e))).toBe(ContentModerationReason.LOW_TRUST);
  });

  it("does not flag a low-reputation post with no outbound link", () => {
    const e = slimEntry(entry({ ...lowRepAuthor, body: "just a friendly hello to everyone" }));
    expect(getEntryModerationReason(e)).toBeNull();
  });

  it("keeps reading live vote state on a slim row", () => {
    const e = slimEntry(
      entry({ body: "hello there", stats: { total_votes: 0, flag_weight: 0, gray: true, hide: false } })
    );
    expect(getEntryModerationReason(e)).toBe(ContentModerationReason.MOD_MUTED);
  });
});

describe("withSlimEntries", () => {
  it("slims the pages a query resolves and leaves everything else alone", async () => {
    const options = {
      queryKey: ["posts", "ranked"],
      staleTime: 1234,
      queryFn: async () => [entry(), entry()]
    };
    const wrapped = withSlimEntries(options);

    expect(wrapped.queryKey).toBe(options.queryKey);
    expect(wrapped.staleTime).toBe(1234);

    const page = await wrapped.queryFn();
    expect(page.map((e: Entry) => e.body)).toEqual(["", ""]);
    expect(page[0].json_metadata?.description).toBeTruthy();
  });

  it("keeps the query key by default, so the feed's prefetch and hook still match", () => {
    const key = ["posts", "ranked", "trending"];
    expect(withSlimEntries({ queryKey: key, queryFn: async () => [] }).queryKey).toBe(key);
  });

  it("gives slim pages their own key when asked, so full-body readers cannot pick them up", () => {
    // Deck columns fetch the same SDK page key and render entry.body, so slim
    // pages must not be sitting under it when they do.
    const wrapped = withSlimEntries(
      { queryKey: ["posts", "ranked-page", "trending", "", "", 20], queryFn: async () => [] },
      { isolateKey: true }
    );
    expect(wrapped.queryKey).toEqual([
      "posts",
      "ranked-page",
      "trending",
      "",
      "",
      20,
      SLIM_KEY_MARKER
    ]);
  });

  it("returns options untouched when there is no queryFn", () => {
    const options = { queryKey: ["k"] };
    expect(withSlimEntries(options)).toBe(options);
  });

  it("leaves a non-array page shape (search results) alone", () => {
    const page = { results: [entry()], hits: 1 };
    expect(slimEntryPage(page)).toBe(page);
  });
});
