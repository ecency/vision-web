import React from "react";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render the cover thumbnail as an SSR-discoverable proxied <img> (no client
// blob→base64). Stub the render-helper proxy fns + a configurable list store.
const store = vi.hoisted(() => ({ listStyle: "row" as "row" | "grid" }));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: any) => selector({ listStyle: store.listStyle })
}));
vi.mock("@/features/shared", () => ({
  EntryLink: ({ children, className }: any) => <div className={className}>{children}</div>
}));
// next/image stub that surfaces `priority` so the grid branch can be asserted.
vi.mock("next/image", () => ({
  default: ({ src, alt, priority, onError }: any) => (
    <img src={src} alt={alt ?? ""} data-priority={priority ? "true" : "false"} onError={onError} />
  )
}));
vi.mock("@ecency/render-helper", () => ({
  setBitchuteThumbnailOrigin: vi.fn(),
  catchPostImage: vi.fn((entry: any, w?: number) =>
    entry?.__noimg
      ? null
      : (w ?? 0) > 0
        ? "https://i.ecency.com/p/HASH?format=match&mode=fit&width=600&height=500"
        : "https://i.ecency.com/p/HASH?format=match&mode=fit"
  ),
  buildSrcSet: vi.fn(
    () => "https://i.ecency.com/p/HASH?width=320 320w, https://i.ecency.com/p/HASH?width=600 600w"
  ),
  proxifyImageSrc: vi.fn(() => "https://i.ecency.com/p/HASH?blur=1"),
  // The raw (pre-proxy) source URL, which is the only place the original file
  // extension survives — the proxied /p/<base58> URL hides it.
  // Card precedence: json_metadata.thumbnails first, then image, then body —
  // which is what the component must classify, not the body-image URL.
  getEntryCardImageRawUrl: vi.fn((entry: TestEntry) =>
    entry?.__thumb ?? entry?.__raw ?? "https://img.host/photo.png"
  ),
  IMAGE_SIZES: "(max-width: 768px) 100vw, 700px"
}));

import { EntryListItemThumbnail } from "@/features/shared/entry-list-item/entry-list-item-thumbnail";

/** The card's inputs plus the two test-only hooks the render-helper mock reads. */
type TestEntry = Record<string, unknown> & {
  __raw?: string;
  __thumb?: string;
  __noimg?: boolean;
};

const NO_IMG = "/assets/noimage.png";
const entry: any = {
  author: "alice",
  permlink: "post-1",
  parent_permlink: "",
  title: "Hello",
  json_metadata: { image: ["x"] }
};

const mainImg = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("img")).find((i) => i.getAttribute("src")?.includes("width=600"));

describe("EntryListItemThumbnail — SSR-discoverable LCP image", () => {
  beforeEach(() => {
    store.listStyle = "row";
  });

  it("renders a proxied <img src>+srcset in markup (not a base64 data URL)", () => {
    const { container } = render(
      <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
    );
    const img = mainImg(container)!;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")!.startsWith("data:")).toBe(false);
    expect(img.getAttribute("src")).toContain("i.ecency.com/p/");
    expect(img.getAttribute("srcset")).toContain("600w");
    // Thumbnail-sized (150px desktop), not the post-body 700px — avoids
    // over-fetching a large candidate for the small row thumbnail.
    expect(img.getAttribute("sizes")).toContain("150px");
    expect(img.getAttribute("sizes")).not.toContain("700px");
  });

  it("renders the grid (next/image) variant with proxied src + priority for the LCP item", () => {
    store.listStyle = "grid";
    const { container } = render(
      <EntryListItemThumbnail
        entry={entry}
        entryProp={entry}
        isCrossPost={false}
        noImage={NO_IMG}
        isThumbLcp
      />
    );
    const img = container.querySelector("img[data-priority]")!;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")!.startsWith("data:")).toBe(false);
    expect(img.getAttribute("src")).toContain("i.ecency.com/p/");
    expect(img.getAttribute("data-priority")).toBe("true");
  });

  it("marks the above-fold item eager+high priority, others lazy", () => {
    const lcp = mainImg(
      render(
        <EntryListItemThumbnail
          entry={entry}
          entryProp={entry}
          isCrossPost={false}
          noImage={NO_IMG}
          isThumbLcp
        />
      ).container
    )!;
    expect(lcp.getAttribute("loading")).toBe("eager");
    expect(lcp.getAttribute("fetchpriority")).toBe("high");

    const lazy = mainImg(
      render(
        <EntryListItemThumbnail entry={entry} entryProp={entry} isCrossPost={false} noImage={NO_IMG} />
      ).container
    )!;
    expect(lazy.getAttribute("loading")).toBe("lazy");
    expect(lazy.getAttribute("fetchpriority")).toBeNull();
  });

  it("falls back to noImage when the post has no extractable image", () => {
    const { container } = render(
      <EntryListItemThumbnail
        entry={{ ...entry, __noimg: true }}
        entryProp={entry}
        isCrossPost={false}
        noImage={NO_IMG}
      />
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(NO_IMG);
    expect(img.getAttribute("srcset")).toBeNull();
  });

  it("swaps to noImage exactly once on error (loop-safe fallback)", () => {
    const { container } = render(
      <EntryListItemThumbnail
        entry={entry}
        entryProp={entry}
        isCrossPost={false}
        noImage={NO_IMG}
        isThumbLcp
      />
    );
    fireEvent.error(mainImg(container)!);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(NO_IMG);
    expect(img.getAttribute("srcset")).toBeNull();
  });

  it("hides the thumbnail for an image-less comment", () => {
    const { container } = render(
      <EntryListItemThumbnail
        entry={{ ...entry, __noimg: true, parent_permlink: "root-post" }}
        entryProp={entry}
        isCrossPost={false}
        noImage={NO_IMG}
      />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  // The gif carve-out is GONE (#1821). It existed because the image host handed
  // animated gifs back untransformed, which turned the LQIP layer into a second
  // download of the original (#1802/#1803). ecency/imagehoster#47 renders the
  // blur from the first frame, so a gif card is an ordinary card again. These
  // tests exist to stop the carve-out coming back.
  describe("a gif source", () => {
    const gif: TestEntry = { ...entry, permlink: "post-gif", __raw: "https://img.host/animation.gif" };

    it("gets the placeholder, like any other source", () => {
      const { container } = render(
        <EntryListItemThumbnail entry={gif as never} entryProp={gif as never} isCrossPost={false} noImage={NO_IMG} isThumbLcp={true} />
      );
      expect(container.querySelector('img[aria-hidden="true"]')).toBeTruthy();
      const imgs = Array.from(container.querySelectorAll("img"));
      expect(imgs).toHaveLength(2);
      expect(imgs[1].getAttribute("fetchpriority")).toBe("high");
    });

    // The reverse of the blur guard, and the reason both live in one block.
    // buildSrcSet emits width-ONLY URLs, and an animated render costs
    // frames x width x height, so a width with no height cap is unbounded in the
    // axis that matters: measured live, every srcset candidate at 600w and above
    // came back as the untouched 1,572,008-byte original while the both-axes src
    // box rendered to 196,832. With `sizes` at 100vw on mobile the browser picks
    // exactly the candidates that do not render, so offering them is worse than
    // offering none.
    it("drops srcset, so the browser fetches the both-axes src that actually renders", () => {
      const { container } = render(
        <EntryListItemThumbnail entry={gif as never} entryProp={gif as never} isCrossPost={false} noImage={NO_IMG} isThumbLcp={true} />
      );
      const real = Array.from(container.querySelectorAll("img")).find((i) => !i.getAttribute("aria-hidden"));
      expect(real?.getAttribute("srcset")).toBeNull();
      expect(real?.getAttribute("sizes")).toBeNull();
      expect(real?.getAttribute("src")).toBeTruthy();
    });

    it("keeps srcset for a non-gif source", () => {
      const png: TestEntry = { ...entry, permlink: "post-png-srcset", __raw: "https://img.host/photo.png" };
      const { container } = render(
        <EntryListItemThumbnail entry={png as never} entryProp={png as never} isCrossPost={false} noImage={NO_IMG} isThumbLcp={true} />
      );
      const real = Array.from(container.querySelectorAll("img")).find((i) => !i.getAttribute("aria-hidden"));
      expect(real?.getAttribute("srcset")).toBeTruthy();
    });

    // The classification must follow the CARD's source. json_metadata.thumbnails
    // wins over the body image in catchPostImage, so an entry whose thumbnail is
    // a gif and whose body image is a png (and the reverse) is where a guard
    // built on the wrong selector gets it backwards.
    it("classifies the thumbnail the card renders, not the body image", () => {
      const gifThumb: TestEntry = {
        ...entry, permlink: "post-mixed-1",
        __thumb: "https://img.host/animation.gif", __raw: "https://img.host/photo.png"
      };
      const { container: a } = render(
        <EntryListItemThumbnail entry={gifThumb as never} entryProp={gifThumb as never} isCrossPost={false} noImage={NO_IMG} />
      );
      expect(a.querySelector("img:not([aria-hidden])")?.getAttribute("srcset")).toBeNull();

      const pngThumb: TestEntry = {
        ...entry, permlink: "post-mixed-2",
        __thumb: "https://img.host/photo.png", __raw: "https://img.host/animation.gif"
      };
      const { container: b } = render(
        <EntryListItemThumbnail entry={pngThumb as never} entryProp={pngThumb as never} isCrossPost={false} noImage={NO_IMG} />
      );
      expect(b.querySelector("img:not([aria-hidden])")?.getAttribute("srcset")).toBeTruthy();
    });

    // The placeholder is one request, not one per candidate: it is a single
    // <img src> with no srcset of its own, which is what kept #1803 fixed.
    it("requests the placeholder once, with no srcset of its own", () => {
      const { container } = render(
        <EntryListItemThumbnail entry={gif as never} entryProp={gif as never} isCrossPost={false} noImage={NO_IMG} isThumbLcp={true} />
      );
      const ph = container.querySelector('img[aria-hidden="true"]');
      expect(ph?.getAttribute("srcset")).toBeNull();
      expect(ph?.getAttribute("src")).toBeTruthy();
    });

    it("treats a non-gif source no differently", () => {
      const png: TestEntry = { ...entry, permlink: "post-png", __raw: "https://img.host/photo.png" };
      const { container } = render(
        <EntryListItemThumbnail entry={png as never} entryProp={png as never} isCrossPost={false} noImage={NO_IMG} isThumbLcp={true} />
      );
      expect(container.querySelector('img[aria-hidden="true"]')).toBeTruthy();
    });
  });
});
