import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { catchPostImage, getEntryCardImageRawUrl } from "@ecency/render-helper";

// The extractor is wrapped, not stubbed away: the package keeps its real
// implementation and only `catchPostImage` becomes a spy, so the components
// below run their actual image pipeline and a test can make that one call throw.
//
// Driving the guard from a mocked throw rather than from a body that really
// throws is deliberate. The sanitizer fix in this same change means no known
// input throws any more, and CI builds the package from source before running
// these tests — a spec written against "this body throws" would go red on its
// own fix. What the guard has to survive is a throw, whatever produces it.
vi.mock("@ecency/render-helper", async () => {
  const actual = await vi.importActual<typeof import("@ecency/render-helper")>(
    "@ecency/render-helper"
  );
  return {
    ...actual,
    catchPostImage: vi.fn(actual.catchPostImage),
    getEntryCardImageRawUrl: vi.fn(actual.getEntryCardImageRawUrl)
  };
});

vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: any) => selector({ listStyle: "row" })
}));
vi.mock("@/features/shared", () => ({
  EntryLink: ({ children, className }: any) => <div className={className}>{children}</div>
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt ?? ""} />
}));
vi.mock("@/core/sentry/lazy-sentry", () => ({
  sentry: { captureException: vi.fn() }
}));

import { sentry } from "@/core/sentry/lazy-sentry";
import { EntryListItemThumbnail } from "@/features/shared/entry-list-item/entry-list-item-thumbnail";
// The feed thumbnail preload this spec also covered was deleted with the feed
// route's boundary (#1786): once the cards ship in the SSR shell they hoist the
// same preload links themselves, so the component only duplicated them.
import { catchPostImageSafely } from "@/core/entries/catch-post-image-safely";

const NO_IMG = "/assets/noimage.png";

// The bodies that used to throw `RangeError: Invalid code point` out of the
// sanitizer's private entity decoder. The malformed closing tag is load-bearing
// on the decimal form: `<div ...>x</div>` is protected by the entity-placeholder
// step in markdown-to-html and never threw.
const HOSTILE_BODY = `<div title="&#x110000;">boom</div>`;
const HOSTILE_BODY_MALFORMED = `<div title="&#1114112;">boom</span>`;

// catchPostImage memoises per author/permlink/last_update/size/format, so a
// reused permlink would serve a cached answer instead of calling the extractor.
let n = 0;
const hostileEntry = (body = HOSTILE_BODY): any => ({
  author: "crafted",
  permlink: `hostile-${++n}`,
  last_update: "2026-09-09T00:00:00",
  parent_permlink: "",
  title: "Hostile",
  body,
  json_metadata: {}
});

const mainImg = (c: HTMLElement) => c.querySelector("img");

/** Make the extractor throw for the crafted author, work normally otherwise. */
function throwForCraftedPosts() {
  vi.mocked(catchPostImage).mockImplementation(((obj: any, ...rest: any[]) => {
    const isCrafted = typeof obj === "string" ? obj.includes("boom") : obj?.author === "crafted";
    if (isCrafted) {
      throw new RangeError("Invalid code point 1114112");
    }
    return null;
  }) as any);
}

describe("feed thumbnail with a body that breaks the image extractor", () => {
  beforeEach(() => {
    vi.mocked(sentry.captureException).mockClear();
    vi.mocked(catchPostImage).mockReset();
  });

  // The end-to-end pin for the package fix in this change: the two bodies that
  // used to take the extractor down now come back with an answer instead.
  it.each([
    ["hex", HOSTILE_BODY],
    ["malformed decimal", HOSTILE_BODY_MALFORMED]
  ])("the real extractor no longer throws on the %s body", async (_label, body) => {
    const actual = await vi.importActual<typeof import("@ecency/render-helper")>(
      "@ecency/render-helper"
    );
    expect(() => actual.catchPostImage(hostileEntry(body), 600, 500, "match")).not.toThrow();
    expect(() => actual.catchPostImage(body, 600, 500)).not.toThrow();
  });

  it("renders the card with the placeholder instead of crashing", () => {
    throwForCraftedPosts();
    const entry = hostileEntry();
    const { container } = render(
      <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
    );
    const img = mainImg(container)!;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe(NO_IMG);
    expect(img.getAttribute("srcset")).toBeNull();
    // The LQIP layer is driven by a second extractor call; it must be gone
    // rather than pointing at a half-built URL.
    expect(container.querySelector('img[aria-hidden="true"]')).toBeNull();
  });

  it("reports one broken post once, however many calls and renders it takes", () => {
    throwForCraftedPosts();
    const entry = hostileEntry();
    // The thumbnail alone calls the extractor twice (full size + LQIP).
    const first = render(
      <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
    );
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(RangeError),
      expect.objectContaining({ extra: expect.objectContaining({ where: "catchPostImage" }) })
    );

    first.rerender(
      <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
    );
    render(
      <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
    );
    expect(sentry.captureException).toHaveBeenCalledTimes(1);

    // A different broken post is still worth an event of its own.
    const other = hostileEntry();
    render(
      <EntryListItemThumbnail entry={other} entryProp={other} isCrossPost={false} noImage={NO_IMG} />
    );
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it("guards the raw-string call shape the search row uses", () => {
    throwForCraftedPosts();
    expect(catchPostImageSafely(HOSTILE_BODY, 600, 500)).toBeNull();
    expect(catchPostImageSafely(HOSTILE_BODY_MALFORMED, 600, 500)).toBeNull();
    // Two distinct bodies, so one event each — and repeating one adds nothing.
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
    expect(catchPostImageSafely(HOSTILE_BODY, 600, 500)).toBeNull();
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
  });
});

describe("feed thumbnail when the animated-cover check throws", () => {
  // The profile tabs (#1805), the feed and the community routes render these
  // cards in the SSR shell with no boundary above them. The animated-cover check
  // reads the same metadata and body as the extractor, so it gets the same
  // guard: a throw here must cost the card its gif carve-out, not the page.
  beforeEach(async () => {
    vi.mocked(sentry.captureException).mockClear();
    const actual = await vi.importActual<typeof import("@ecency/render-helper")>(
      "@ecency/render-helper"
    );
    vi.mocked(catchPostImage).mockReset();
    vi.mocked(catchPostImage).mockImplementation(actual.catchPostImage);
    vi.mocked(getEntryCardImageRawUrl).mockReset();
    vi.mocked(getEntryCardImageRawUrl).mockImplementation(() => {
      throw new RangeError("Invalid code point 1114112");
    });
  });

  it("renders the real thumbnail, srcset included, and reports the post once", () => {
    const entry = {
      ...hostileEntry("plain text"),
      json_metadata: { image: ["https://images.example/cover.jpg"] }
    };
    const { container, rerender } = render(
      <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
    );
    const img = container.querySelector("img:not([aria-hidden])")!;
    expect(img.getAttribute("src")).not.toBe(NO_IMG);
    // Null from the guard reads as "not animated", so the srcset survives.
    expect(img.getAttribute("srcset")).toBeTruthy();
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(RangeError),
      expect.objectContaining({
        extra: expect.objectContaining({ where: "getEntryCardImageRawUrl" })
      })
    );

    rerender(
      <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
    );
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
