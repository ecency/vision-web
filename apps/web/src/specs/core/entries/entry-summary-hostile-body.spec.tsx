import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { catchPostImage, getPostBodyText } from "@ecency/render-helper";

// The renderer is wrapped, not stubbed away: the package keeps its real
// implementation and only `postBodySummary` becomes a spy, so everything below
// runs its actual summary pipeline and a test can make that one call throw.
//
// Driving the guard from a mocked throw rather than from a body that really
// throws is deliberate, for the reason the image guard's spec gives: the inputs
// that used to throw are fixed at their source in the package, while CI builds
// the package from source before running these tests, so a spec written against
// "this body throws" would go red on its own fix. What the guard has to survive
// is a throw, whatever produces it. The one input that still throws today is
// pinned separately at the bottom of this file.
vi.mock("@ecency/render-helper", async () => {
  const actual =
    await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper");
  return {
    ...actual,
    getPostBodyText: vi.fn(actual.getPostBodyText),
    catchPostImage: vi.fn(actual.catchPostImage)
  };
});

vi.mock("@/core/sentry/lazy-sentry", () => ({
  sentry: { captureException: vi.fn() }
}));

vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: any) => selector({ nsfw: false, listStyle: "row" })
}));

// `@/utils` is globally stubbed down to two functions; the card also reaches for
// useEntryLocation. Restore the real module and keep the two stubs stubbed.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@/features/shared", () => ({
  EntryLink: ({ children }: any) => <span>{children}</span>
}));

// The thumbnail has its own guard and its own spec (entry-list-item-hostile-body);
// here it would only pull next/image into a spec about text.
vi.mock("@/features/shared/entry-list-item/entry-list-item-thumbnail", () => ({
  EntryListItemThumbnail: () => null
}));

import { sentry } from "@/core/sentry/lazy-sentry";
import { entrySummary, summarizeText, ENTRY_SUMMARY_LENGTH } from "@/core/entries/entry-summary";
import { slimEntry } from "@/core/entries/slim-entry";
import { EntryListItemMutedContent } from "@/features/shared/entry-list-item/entry-list-item-muted-content";
import { mockEntry } from "@/specs/test-utils";
import type { Entry } from "@/entities";

const BROKEN_AUTHOR = "crafted";

// render-helper memoises summaries per author/permlink/last_update/length, so a
// reused permlink would serve a cached answer instead of calling the renderer.
let n = 0;
function brokenEntry(overrides: Partial<Entry> = {}): Entry {
  return mockEntry({
    author: BROKEN_AUTHOR,
    permlink: `hostile-summary-${++n}`,
    title: "A post whose body breaks the summariser",
    body: "boom body",
    json_metadata: {},
    ...overrides
  });
}

/** Make the renderer throw for the crafted author, work normally otherwise. */
function throwForCraftedPosts() {
  vi.mocked(getPostBodyText).mockImplementation(((obj: any, ...rest: any[]) => {
    const isCrafted =
      typeof obj === "string" ? obj.includes("boom") : obj?.author === BROKEN_AUTHOR;
    if (isCrafted) {
      throw new RangeError("Invalid code point 1114112");
    }
    return "";
  }) as any);
}

describe("entrySummary with a body that breaks the summary renderer", () => {
  beforeEach(() => {
    vi.mocked(sentry.captureException).mockClear();
    vi.mocked(getPostBodyText).mockReset();
    vi.mocked(catchPostImage).mockReset();
  });

  it("degrades to an empty summary instead of throwing", () => {
    throwForCraftedPosts();
    const entry = brokenEntry();
    expect(() => entrySummary(entry)).not.toThrow();
    expect(entrySummary(entry)).toBe("");
  });

  it("degrades summarizeText on a raw string too", () => {
    throwForCraftedPosts();
    expect(summarizeText(`boom description ${++n}`)).toBe("");
  });

  // The two markdown passes in this module take different inputs, so one of
  // them failing must not cost the card the other. A description written by a
  // hostile client is the likelier of the two to be crafted.
  it("still summarises the body when only the description breaks the renderer", () => {
    vi.mocked(getPostBodyText).mockImplementation(((obj: any, length?: number) => {
      if (typeof obj === "string") {
        throw new RangeError("Invalid code point 1114112");
      }
      return "the body summary";
    }) as any);

    const entry = brokenEntry({ json_metadata: { description: `boom description ${++n}` } });
    expect(entrySummary(entry)).toBe("the body summary");
  });

  it("reports one broken post once, however many calls and renders it takes", () => {
    throwForCraftedPosts();
    // The dedupe set is module state that outlives one test, so the crafted
    // description has to be unique to this one or its event was already spent.
    const entry = brokenEntry({ json_metadata: { description: `boom description ${++n}` } });

    // Three renderer calls for this one entry: the description at the cap, the
    // description untruncated, then the body.
    entrySummary(entry);
    expect(vi.mocked(getPostBodyText).mock.calls.length).toBeGreaterThanOrEqual(3);
    // One event for the description string, one for the entry: different
    // subjects, so each is worth knowing about.
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(RangeError),
      expect.objectContaining({ extra: expect.objectContaining({ where: "getPostBodyText" }) })
    );

    entrySummary(entry);
    entrySummary(entry, 40);
    expect(sentry.captureException).toHaveBeenCalledTimes(2);

    // A different broken post is still worth an event of its own.
    entrySummary(brokenEntry());
    expect(sentry.captureException).toHaveBeenCalledTimes(3);
  });

  // Both guards share one dedupe set (core/entries/report-render-helper-failure),
  // so the call site has to be part of the key. A body crafted to break the
  // markdown pipeline tends to break every reader of it. Silencing the second
  // because the first already fired would hide one of two defects.
  it("reports the broken image and the broken summary of one post separately", async () => {
    throwForCraftedPosts();
    vi.mocked(catchPostImage).mockImplementation(((obj: any) => {
      if (obj?.author === BROKEN_AUTHOR) {
        throw new RangeError("Invalid code point 1114112");
      }
      return null;
    }) as any);

    const { catchPostImageSafely } = await import("@/core/entries/catch-post-image-safely");
    const entry = brokenEntry();

    expect(catchPostImageSafely(entry as any, 600, 500)).toBeNull();
    expect(entrySummary(entry)).toBe("");

    expect(sentry.captureException).toHaveBeenCalledTimes(2);
    const wheres = vi
      .mocked(sentry.captureException)
      .mock.calls.map(([, ctx]: any) => ctx.extra.where);
    expect(new Set(wheres)).toEqual(new Set(["catchPostImage", "getPostBodyText"]));
  });

  // The slimmer runs this inside the feed queryFn. A throw there rejects the
  // whole query: on the server the prefetch resolves undefined and the feed
  // vanishes, on the client the list shows its error state.
  it("lets the slimmer derive a row, falling back to the title", () => {
    throwForCraftedPosts();
    const entry = brokenEntry({ title: "Still a readable row" });
    const slim = slimEntry(entry);
    expect(slim.body).toBe("");
    expect(slim.json_metadata?.description).toBe("Still a readable row");
  });

  it("renders the card with its title and an empty summary line", () => {
    throwForCraftedPosts();
    const entry = brokenEntry();
    const { container } = render(<EntryListItemMutedContent entry={entry} />);
    expect(container.querySelector(".item-title")?.textContent).toBe(entry.title);
    expect(container.querySelector(".item-body")?.textContent).toBe("");
  });
});

// The real code path: the card list ships inside the SSR shell of the feed,
// profile and community routes, with no Suspense boundary above it (#1786 and
// siblings) and no route error.tsx. React's server renderer recovers a throw
// only AT a Suspense boundary - a class error boundary does nothing there - so
// an unguarded throw here is onShellError, i.e. the whole document.
describe("a broken summary does not take the server render down", () => {
  beforeEach(() => {
    vi.mocked(sentry.captureException).mockClear();
    vi.mocked(getPostBodyText).mockReset();
    vi.mocked(catchPostImage).mockReset();
  });

  async function streamCard(entry: Entry) {
    const { renderToReadableStream } = await import("react-dom/server.browser");
    const errors: string[] = [];
    // No <Suspense> anywhere: this is the shape the routes ship today.
    const stream = await renderToReadableStream(
      <main>
        <EntryListItemMutedContent entry={entry} />
      </main>,
      { onError: (e: any) => errors.push(String(e?.message ?? e)) }
    );
    await stream.allReady;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    return { html, errors };
  }

  it("streams the card's title into the shell rather than erroring the shell", async () => {
    throwForCraftedPosts();
    const entry = brokenEntry({ title: "This title must reach the shell" });

    const { html, errors } = await streamCard(entry);

    expect(errors).toEqual([]);
    expect(html).toContain("This title must reach the shell");
    // Anti-vacuity: the renderer really was reached and really did throw.
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

// One input that still throws with today's package, so the guard is pinned
// against real behaviour and not only against a mock. postBodySummary catches
// around its own markdown render but not around cleanReply, which runs first
// and calls .replace on the body: an entry whose `body` is not a string (a
// shape the app assembles itself for cross-post originals and search rows,
// which the package does not defend against) raises a TypeError there.
describe("the unmocked renderer on a body that is not a string", () => {
  it("throws out of the package but not out of the guard", async () => {
    const actual =
      await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper");
    const entry = brokenEntry({ body: { markdown: "hi" } as unknown as string });

    expect(() => actual.getPostBodyText(entry as any, ENTRY_SUMMARY_LENGTH)).toThrow(TypeError);

    vi.mocked(getPostBodyText).mockImplementation(actual.getPostBodyText as any);
    expect(entrySummary(entry)).toBe("");
  });

  // Two different bodies of the SAME length that share their opening and closing
  // paragraphs: the shape a key built from length + both ends collides on, which
  // would silently drop the second post's report.
  it("reports two same-length bodies that differ only in the middle", () => {
    vi.mocked(getPostBodyText).mockImplementation(() => {
      throw new RangeError("Invalid code point 1114112");
    });
    const head = "The same opening paragraph, repeated verbatim. ".repeat(4);
    const tail = " And the same closing line, verbatim.".repeat(4);
    const a = `${head}AAAAAAAAAA${tail}`;
    const b = `${head}BBBBBBBBBB${tail}`;
    expect(a.length).toBe(b.length);

    entrySummary(a as never, 200);
    entrySummary(b as never, 200);

    // Two bodies x the two guarded passes entrySummary makes, each keyed by its
    // own call site. A key that read only the ends would see one body here and
    // report 2.
    expect(sentry.captureException).toHaveBeenCalledTimes(4);
  });
});
