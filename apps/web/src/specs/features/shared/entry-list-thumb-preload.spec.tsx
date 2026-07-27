import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";

// The preload only pays off if it matches the <img> the thumbnail renders, so
// both components are exercised against the same render-helper stub and their
// srcset/sizes compared.
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: any) => selector({ listStyle: "row" })
}));
vi.mock("@/features/shared", () => ({
  EntryLink: ({ children, className }: any) => <div className={className}>{children}</div>
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt ?? ""} />
}));
vi.mock("@ecency/render-helper", () => ({
  setProxyBase: vi.fn(),
  catchPostImage: vi.fn((entry: any, w?: number) =>
    entry?.__noimg
      ? null
      : (w ?? 0) > 0
        ? `https://i.ecency.com/p/${entry.permlink}?format=match&mode=fit&width=600&height=500`
        : `https://i.ecency.com/p/${entry.permlink}?format=match&mode=fit`
  ),
  buildSrcSet: vi.fn(
    (src?: string) => `${src?.split("?")[0]}?width=320 320w, ${src?.split("?")[0]}?width=600 600w`
  ),
  proxifyImageSrc: vi.fn(() => "https://i.ecency.com/p/HASH?blur=1"),
  IMAGE_SIZES: "(max-width: 768px) 100vw, 700px"
}));

import { EntryListThumbPreload } from "@/features/shared/entry-list-item/entry-list-thumb-preload";
import { EntryListItemThumbnail } from "@/features/shared/entry-list-item/entry-list-item-thumbnail";

const makeEntry = (permlink: string, extra: Record<string, unknown> = {}): any => ({
  author: "alice",
  permlink,
  parent_permlink: "",
  title: "Hello",
  json_metadata: { image: ["x"], tags: ["photography"] },
  ...extra
});

// React treats <link rel="preload"> as a resource and hoists it out of the
// component's container into document.head, so assert there. Each case uses its
// own permlink because React dedupes hoisted resources by href.
const headPreload = (permlink: string) =>
  document.head.querySelector(`link[rel="preload"][as="image"][href*="${permlink}"]`);

describe("EntryListThumbPreload", () => {
  it("emits a high-priority image preload, hoisted into <head>", () => {
    render(<EntryListThumbPreload entries={[makeEntry("lcp-1")]} />);
    const link = headPreload("lcp-1")!;
    expect(link).toBeTruthy();
    expect(link.getAttribute("imagesrcset")).toContain("600w");
    expect(link.getAttribute("fetchpriority")).toBe("high");
  });

  it("matches the thumbnail's srcset and sizes exactly (a mismatch = second download)", () => {
    const entry = makeEntry("lcp-2");
    render(<EntryListThumbPreload entries={[entry]} />);
    const { container: thumbC } = render(
      <EntryListItemThumbnail
        entry={entry}
        entryProp={entry}
        isCrossPost={false}
        noImage="/assets/noimage.png"
        isThumbLcp
      />
    );

    const link = headPreload("lcp-2")!;
    const img = Array.from(thumbC.querySelectorAll("img")).find((i) =>
      i.getAttribute("src")?.includes("width=600")
    )!;

    expect(link.getAttribute("imagesrcset")).toBe(img.getAttribute("srcset"));
    expect(link.getAttribute("imagesizes")).toBe(img.getAttribute("sizes"));
  });

  it("preloads the original post for a cross-post, matching the thumbnail", () => {
    const original = makeEntry("lcp-3-original", { author: "bob" });
    render(
      <EntryListThumbPreload entries={[makeEntry("lcp-3-cross", { original_entry: original })]} />
    );

    expect(headPreload("lcp-3-original")).toBeTruthy();
    expect(headPreload("lcp-3-cross")).toBeNull();
  });

  it("emits nothing when there is no entry, no image, or the post is nsfw", () => {
    render(<EntryListThumbPreload />);

    render(<EntryListThumbPreload entries={[makeEntry("lcp-4-noimg", { __noimg: true })]} />);
    expect(headPreload("lcp-4-noimg")).toBeNull();

    render(
      <EntryListThumbPreload
        entries={[makeEntry("lcp-4-nsfw", { json_metadata: { tags: ["nsfw"] } })]}
      />
    );
    expect(headPreload("lcp-4-nsfw")).toBeNull();
  });

  it("falls through to the next eager card when the first renders no thumbnail", () => {
    render(
      <EntryListThumbPreload
        entries={[
          makeEntry("lcp-5-nsfw", { json_metadata: { tags: ["nsfw"] } }),
          makeEntry("lcp-5-visible")
        ]}
      />
    );

    expect(headPreload("lcp-5-visible")).toBeTruthy();
    expect(headPreload("lcp-5-nsfw")).toBeNull();
  });

  it("preloads only one image even when several candidates qualify", () => {
    render(
      <EntryListThumbPreload entries={[makeEntry("lcp-6-first"), makeEntry("lcp-6-second")]} />
    );

    expect(headPreload("lcp-6-first")).toBeTruthy();
    expect(headPreload("lcp-6-second")).toBeNull();
  });
});
