import { describe, expect, it } from "vitest";
import { catchPostImage, postBodySummary } from "@ecency/render-helper";
import { ContentModerationReason } from "@ecency/sdk";
import {
  SLIM_KEY_MARKER,
  slimEntry,
  slimEntryPage,
  withSlimEntries,
  withSlimPageEntries
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

  it("survives thumbnails that are not an array", () => {
    // json_metadata is author-written and `thumbnails` is only typed as string[].
    // A bare string threw out of the queryFn, and a throw there is not one bad
    // card: prefetchQuery returns undefined and the whole strip or feed is gone.
    const e = entry({
      json_metadata: { thumbnails: "https://images.hive.blog/single.png" } as never
    });
    expect(slimEntry(e).json_metadata?.image).toEqual(["https://images.hive.blog/single.png"]);
  });

  it("ignores thumbnails of a shape no url can be read from", () => {
    const e = entry({
      json_metadata: {
        thumbnails: { 0: "https://images.hive.blog/object.png" },
        image: ["https://images.hive.blog/cover.png"]
      } as never
    });
    expect(slimEntry(e).json_metadata?.image).toEqual(["https://images.hive.blog/cover.png"]);
  });

  it("ignores non-string members of either metadata field", () => {
    const e = entry({
      json_metadata: {
        thumbnails: [null, 42, ""],
        image: [undefined, "https://images.hive.blog/real.png"]
      } as never
    });
    expect(slimEntry(e).json_metadata?.image).toEqual(["https://images.hive.blog/real.png"]);
  });

  it("keeps a video post's poster, which only the full render finds", () => {
    // A bare YouTube URL becomes an <img class="no-replace video-thumbnail"> in
    // the rendered post, so the raw-markdown fast path sees no image at all.
    // Stopping there dropped these cards to the noimage placeholder.
    const e = entry({
      json_metadata: {},
      body: "Check this out\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nthanks"
    });
    expect(slimEntry(e).json_metadata?.image?.[0]).toBeTruthy();
  });

  it("keeps a <center>-wrapped bare image URL, also full-render only", () => {
    const e = entry({
      json_metadata: {},
      body: "<center>https://images.hive.blog/DQmb59qYM1czWSDDw2dRmUHJ7s97L6S6Rk3uZLyA5vCxAEr/pic.jpg</center>"
    });
    expect(slimEntry(e).json_metadata?.image?.[0]).toBeTruthy();
  });

  it("produces the same card src the full entry would have produced", () => {
    // The whole point: slimming must not change what the card renders. The
    // recovered URL is already proxied, and re-proxying at card size reuses the
    // hash rather than nesting it.
    const e = entry({
      json_metadata: {},
      body: "watch\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nend"
    });
    const before = catchPostImage(e, 600, 500, "match");
    const after = catchPostImage(slimEntry(e), 600, 500, "match");
    expect(after).toBe(before);
    expect((after?.match(/\/p\//g) ?? []).length).toBe(1);
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

describe("slimEntryPage", () => {
  it("hands back a row it cannot slim, and still slims the rest of the page", () => {
    // The backstop, for the metadata shape nobody thought of. Losing a row's
    // saving costs memory; letting the queryFn reject costs the whole page.
    const broken = entry();
    Object.defineProperty(broken, "json_metadata", {
      get() {
        throw new Error("unreadable metadata");
      }
    });
    const fine = entry({ body: "a body that should still go" });

    const page = slimEntryPage([broken, fine]);

    expect(page[0]).toBe(broken);
    expect(page[1].body).toBe("");
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

  it("gives a single page its own key, so full-body readers cannot pick it up", () => {
    // Deck columns fetch the same SDK page key and render entry.body, so slim
    // pages must not be sitting under it when they do. This is a separate
    // function rather than a flag precisely because a flag can be left off, and
    // leaving it off was issue #1556.
    const wrapped = withSlimPageEntries({
      queryKey: ["posts", "ranked-page", "trending", "", "", 20],
      queryFn: async () => []
    });
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

  it("slims the pages of a single-page query too", async () => {
    const wrapped = withSlimPageEntries({
      queryKey: ["posts", "ranked-page"],
      queryFn: async () => [entry()]
    });
    const page = await wrapped.queryFn();
    expect(page[0].body).toBe("");
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
