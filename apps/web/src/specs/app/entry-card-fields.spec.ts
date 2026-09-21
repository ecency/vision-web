// @vitest-environment node
// Production SSR runs in Node: there the render-helper uses its own parser and
// a hostile body reaches the throwing sanitizeHtml path. Under jsdom the
// browser DOMParser swallows it, so this file must run in Node to be honest.
import { describe, it, expect, vi } from "vitest";

// render-helper is not globally mocked, so postBodySummary/catchPostImage are
// already real here. `catchPostImage` is wrapped in a spy that defaults to the
// real implementation, so one test can make a single call throw without
// changing what any other test exercises.
vi.mock("@ecency/render-helper", async () => {
  const actual = await vi.importActual<typeof import("@ecency/render-helper")>(
    "@ecency/render-helper"
  );
  return { ...actual, catchPostImage: vi.fn(actual.catchPostImage) };
});

// The global @/utils mock only exposes random/getAccessToken; restore the real
// module so buildEntryCardFields gets the real `truncate`.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<any>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

import { buildEntryCardFields } from "@/app/(dynamicPages)/entry/_helpers/entry-card-fields";
import { truncate } from "@/utils";
import { postBodySummary, catchPostImage } from "@ecency/render-helper";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    author: "alice",
    permlink: "my-post",
    title: "Hello World",
    body: "This is the body of the post with enough words to summarize nicely.",
    parent_author: "",
    json_metadata: {},
    ...overrides
  };
}

describe("buildEntryCardFields", () => {
  it("matches the inline title/summary/image rules for a post (parity lock)", () => {
    const e = entry({ json_metadata: { image: ["https://example.com/cover.png"] } });
    const expectedSummary =
      (e.json_metadata as any).description || truncate(postBodySummary(e.body, 210), 160);
    expect(buildEntryCardFields(e as any)).toEqual({
      isComment: false,
      title: truncate(e.title, 67),
      summary: expectedSummary,
      cardSummary: expectedSummary, // non-empty summary => identical
      image: catchPostImage(e as any, 1200, 630, "match")
    });
  });

  it("formats a comment title as '@author: <body summary>'", () => {
    const e = entry({ parent_author: "bob", title: "" });
    const fields = buildEntryCardFields(e as any);
    expect(fields.isComment).toBe(true);
    expect(fields.title).toBe(`@${e.author}: ${truncate(postBodySummary(e.body, 12), 67)}`);
  });

  it("falls back to a body-summary title for a title-less root post (e.g. D.Buzz)", () => {
    const e = entry({ title: "" });
    const fields = buildEntryCardFields(e as any);
    expect(fields.title).toBe(truncate(postBodySummary(e.body, 67), 67));
    expect(fields.title.length).toBeGreaterThan(0);
  });

  it("falls back to a byline title when a title-less post has no summarizable body", () => {
    const e = entry({ title: "", body: "![img](https://example.com/a.png)" });
    expect(buildEntryCardFields(e as any).title).toBe("Post by @alice");
  });

  it("prefers an author-set json_metadata.description for the summary", () => {
    const e = entry({ json_metadata: { description: "Author provided summary" } });
    expect(buildEntryCardFields(e as any).summary).toBe("Author provided summary");
  });

  it("passes catchPostImage through verbatim (incl. its fallback url)", () => {
    const e = entry({ body: "No inline images here at all.", json_metadata: {} });
    expect(buildEntryCardFields(e as any).image).toBe(
      catchPostImage(e as any, 1200, 630, "match")
    );
  });

  // Media-only posts summarize to "": `summary` (the SERP meta description)
  // stays EMPTY so Google auto-snippets from page content, while `cardSummary`
  // (og/twitter/oEmbed, which have no auto-snippet) gets a descriptive fallback.
  it("keeps summary empty but fills cardSummary for an image-only post body", () => {
    const e = entry({
      body: "![shot](https://example.com/a.jpg)",
      community_title: "Photography Lovers",
      json_metadata: { tags: ["photo", "art", "hive", "extra"] }
    });
    expect(postBodySummary(e.body as string, 210)).toBe(""); // premise: media-only => empty
    const fields = buildEntryCardFields(e as any);
    expect(fields.summary).toBe("");
    expect(fields.cardSummary).toBe(
      "A post by @alice in Photography Lovers on Ecency. Tags: photo, art, hive"
    );
  });

  it("card fallback works without community/tags and guards non-array tags", () => {
    const e = entry({ body: "![x](https://example.com/a.jpg)", json_metadata: { tags: "photo" } });
    expect(buildEntryCardFields(e as any).cardSummary).toBe("A post by @alice on Ecency");
  });

  it("uses the reply card fallback for a media-only comment", () => {
    const e = entry({ parent_author: "bob", body: "![x](https://example.com/a.jpg)" });
    expect(buildEntryCardFields(e as any).cardSummary).toBe("A reply by @alice on Ecency");
  });

  it("ignores a non-string json_metadata.description (untrusted on-chain data)", () => {
    const e = entry({ json_metadata: { description: { evil: true } } });
    const fields = buildEntryCardFields(e as any);
    expect(fields.summary).toBe(truncate(postBodySummary(e.body, 210), 160));
  });

  // The entry page sources its entry from condenser_api.get_content first, which
  // returns json_metadata as a raw STRING. Reading a field off that string is
  // undefined, so every post page served a body summary in place of the
  // description its author published.
  it("reads the description when json_metadata arrived as a string", () => {
    const e = entry({
      json_metadata: JSON.stringify({ description: "Author provided summary" })
    });
    expect(buildEntryCardFields(e as any).summary).toBe("Author provided summary");
  });

  it("treats unparseable json_metadata as no metadata at all", () => {
    const e = entry({ json_metadata: "not json at all" });
    expect(buildEntryCardFields(e as any).summary).toBe(
      truncate(postBodySummary(e.body, 210), 160)
    );
  });

  // json_metadata is whatever the publishing client wrote: hivesuite/0.1.0 copies
  // the entire markdown body into `description`. Verbatim, that is several KB of
  // raw markdown in a meta description.
  it("strips and caps a description that holds a whole markdown body", () => {
    const wall =
      "# A heading\n\n**Bold** intro with a [link](https://example.com) and an " +
      "![image](https://example.com/a.jpg)\n\n" +
      "Then a long stretch of prose that runs well past the snippet width so the ".repeat(6);
    const e = entry({ json_metadata: { description: wall } });

    const { summary } = buildEntryCardFields(e as any);

    // 160 plus the ellipsis truncate appends, the same bound as the body path.
    expect(summary.length).toBeLessThanOrEqual(163);
    expect(summary).not.toContain("#");
    expect(summary).not.toContain("**");
    expect(summary).not.toContain("](");
  });

  // Space-less text (CJK prose, an emoji run) defeats the word-boundary
  // summariser, which falls back to cutting by CODE POINT. 160 code points of
  // astral characters is 320 UTF-16 units, so the byte-level cap still has to
  // land, and it must not leave a dangling surrogate behind.
  it("bounds a space-less description that the summariser cuts by code point", () => {
    const e = entry({ json_metadata: { description: "\u{1F389}".repeat(300) } });

    const { summary } = buildEntryCardFields(e as any);

    expect(summary.length).toBeLessThanOrEqual(163);
    expect(summary).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it("falls back to the body summary when the description strips to nothing", () => {
    const e = entry({
      json_metadata: { description: "![shot](https://example.com/a.jpg)" }
    });
    expect(buildEntryCardFields(e as any).summary).toBe(
      truncate(postBodySummary(e.body, 210), 160)
    );
  });

  it("reads the tag fallback out of string metadata too", () => {
    const e = entry({
      body: "![shot](https://example.com/a.jpg)",
      community_title: "Photography Lovers",
      json_metadata: JSON.stringify({ tags: ["photo", "art", "hive", "extra"] })
    });
    expect(buildEntryCardFields(e as any).cardSummary).toBe(
      "A post by @alice in Photography Lovers on Ecency. Tags: photo, art, hive"
    );
  });
});

describe("buildEntryCardFields with a body that breaks the image lookup", () => {
  // This entity used to make the last-resort sanitizeHtml pass throw
  // RangeError, which catchPostImage reaches once no metadata or regex image
  // exists — and generateMetadata's outer catch then dropped the title, cards,
  // canonical and robots for that post. The sanitizer now maps out-of-range
  // references to U+FFFD, so the lookup returns instead of throwing; the guard
  // below it stays for the next defect of that shape, and is pinned by the
  // mocked-throw case that follows.
  it("keeps title and summary for the body that used to break the lookup", () => {
    const body = `<div title="&#1114112;">boom</span>`;
    // catchPostImage memoizes per author/permlink/size for the process, so use
    // a permlink no earlier test has used or the cached result masks the call.
    const e = entry({ body, permlink: "boom-entity" });
    expect(() => catchPostImage(e as any, 1200, 630, "match")).not.toThrow();
    const fields = buildEntryCardFields(e as any);
    expect(fields.title).toBe("Hello World");
    expect(fields.image).toBeNull();
  });

  it("keeps title and summary when the image lookup throws", () => {
    const e = entry({ body: "plain body", permlink: "boom-thrower" });
    vi.mocked(catchPostImage).mockImplementationOnce(() => {
      throw new RangeError("Invalid code point 1114112");
    });
    const fields = buildEntryCardFields(e as any);
    expect(fields.title).toBe("Hello World");
    expect(fields.image).toBeNull();
  });
});
