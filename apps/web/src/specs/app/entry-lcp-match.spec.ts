import { describe, expect, it } from "vitest";
import { bodyImageSources, buildPictureSources, buildSrcSet, catchPostImage, getEntryImageRawUrl, proxifyImageSrc, renderPostBody } from "@ecency/render-helper";
import { entryLcpMatch } from "@/app/(dynamicPages)/entry/_helpers/entry-lcp-match";
import { mockEntry } from "@/specs/test-utils";

describe("entryLcpMatch", () => {
  it("is null without a raw cover, so the page emits no preload", () => {
    expect(entryLcpMatch(null)).toBeNull();
    expect(entryLcpMatch(undefined)).toBeNull();
    expect(entryLcpMatch("")).toBeNull();
  });

  it("requests a cover as the body does: the unsized src and its sized srcset", () => {
    for (const raw of ["https://files.peakd.com/x/cover.svg", "https://files.peakd.com/x/anim.gif"]) {
      const sources = bodyImageSources(raw)!;
      expect(entryLcpMatch(raw)).toEqual({ src: sources.src, srcSet: sources.srcSet });
      expect(sources.src).toBe(proxifyImageSrc(raw, 0, 0, "match", { forceProxy: true }));
      expect(sources.srcSet).toBe(buildSrcSet(raw));
    }
  });

  it("follows the rendered cover, not the card thumbnail, when the two differ", () => {
    // A publisher sets a dedicated poster for cards and a gif as the post's
    // cover image. Cards show the poster; the body renders the gif; the
    // preload must fetch the gif.
    const entry = mockEntry({
      author: "lcp",
      permlink: "poster-vs-cover",
      body: "text only",
      json_metadata: {
        thumbnails: ["https://files.peakd.com/x/poster.png"],
        image: ["https://files.peakd.com/x/cover.gif"]
      }
    });
    const raw = getEntryImageRawUrl(entry);
    expect(raw).toBe("https://files.peakd.com/x/cover.gif");
    expect(entryLcpMatch(raw)?.src).toBe(
      proxifyImageSrc("https://files.peakd.com/x/cover.gif", 0, 0, "match", { forceProxy: true })
    );
    expect(catchPostImage(entry, 600, 500, "match")).toBe(
      proxifyImageSrc("https://files.peakd.com/x/poster.png", 600, 500, "match")
    );
  });

  it("returns null rather than an empty string for a cover the proxy refuses", () => {
    expect(entryLcpMatch("not a url")).toBeNull();
  });
});

describe("entryLcpPreload (#2119)", () => {
  // The body renders a YouTube poster as a plain format=match <img>; a link
  // before the first image makes that poster the page's first image.
  it("preloads the poster the body shows first", async () => {
    const { entryLcpPreload } = await import("@/app/(dynamicPages)/entry/_helpers/entry-lcp-match");
    const entry = mockEntry({
      body: "Intro\n\nhttps://www.youtube.com/watch?v=O8xoAtKjnqs\n\n![](https://e.com/a.png)",
      json_metadata: {}
    } as never);
    const target = entryLcpPreload(entry as never);
    expect(target.rawCover).toBeNull();
    expect(target.posterHref).toBe(
      proxifyImageSrc("https://img.youtube.com/vi/O8xoAtKjnqs/hqdefault.jpg", 0, 0, "match")
    );
  });

  it("keeps the cover preload when an image comes first", async () => {
    const { entryLcpPreload } = await import("@/app/(dynamicPages)/entry/_helpers/entry-lcp-match");
    const entry = mockEntry({
      body: "![](https://e.com/a.png)\n\nhttps://www.youtube.com/watch?v=O8xoAtKjnqs",
      json_metadata: {}
    } as never);
    const target = entryLcpPreload(entry as never);
    expect(target.rawCover).toBe(getEntryImageRawUrl(entry as never));
    expect(target.posterHref).toBeNull();
  });
});

describe("the match preload is the rendition the body requests (#2191)", () => {
  const HASH = "2bP4pJr4wVimqCWjYimXJe2cnCgnAhYxiBtbXg5JBpk";
  const firstImg = (body: string) => {
    const html = renderPostBody(body, false, false);
    const tag = html.match(/<img\b[^>]*>/)?.[0] ?? "";
    const attr = (name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, "&") ?? null;
    return { src: attr("src"), srcSet: attr("srcset") };
  };
  it.each([
    `![x](https://images.hive.blog/p/${HASH}?format=match&mode=fit)`,
    `<img src="https://steemitimages.com/p/${HASH}?format=match&mode=fit">`,
    `![x](https://i.ecency.com/p/${HASH}?format=match&mode=fit)`,
    `![x](https://i.ecency.com/p/${HASH}.png)`,
    `https://i.ecency.com/p/${HASH}.png`,
    "![x](https://i.ecency.com/600x400/https://e.com/a.png)",
    "https://i.ecency.com/600x400/https://e.com/a.png",
    '<img src=" https://i.ecency.com/768x0/https://e.com/a.png ">',
    '<img src=" https://i.ecency.com/u/alice/cover ">',
    "![x](https://images.hive.blog/600x400/https://e.com/a.gif)",
    "![x](https://files.peakd.com/x/cover.svg)",
    "![x](https://files.peakd.com/x/anim.gif)",
    "https://files.peakd.com/x/anim.gif"
  ])("%s", async (body) => {
    const { entryLcpPreload } = await import("@/app/(dynamicPages)/entry/_helpers/entry-lcp-match");
    const { rawCover } = entryLcpPreload(mockEntry({ body, json_metadata: {} } as never) as never);
    expect(rawCover).not.toBeNull();
    // A picture-eligible cover is preloaded from its <picture> sources instead.
    expect(buildPictureSources(rawCover!)).toBeNull();
    expect(entryLcpMatch(rawCover)).toEqual(firstImg(body));
  });

  it.each(["![x](https://images.hive.blog/0x0/https://e.com/a.png)", "![x](https://e.com/a.png)", "https://e.com/a.png"])(
    "%s: a picture-eligible cover is preloaded as the body's avif source",
    async (body) => {
      const { entryLcpPreload } = await import("@/app/(dynamicPages)/entry/_helpers/entry-lcp-match");
      const { rawCover } = entryLcpPreload(mockEntry({ body, json_metadata: {} } as never) as never);
      const avif = renderPostBody(body, false, false)
        .match(/<source type="image\/avif" srcset="([^"]*)"/)?.[1]
        ?.replace(/&amp;/g, "&");
      expect(buildPictureSources(rawCover!)?.avif).toBe(avif);
    }
  );

  it.each([
    "![x](https://i.ecency.com/768x0/https%3A%2F%2Fe.com%2Fa.png)",
    "![x](https://i.ecency.com/768x0/https://e.com/a%20b.png)"
  ])("%s: a proxy URL the body keeps escaped gets no preload", async (body) => {
    const { entryLcpPreload } = await import("@/app/(dynamicPages)/entry/_helpers/entry-lcp-match");
    expect(entryLcpPreload(mockEntry({ body, json_metadata: {} } as never) as never).rawCover).toBeNull();
  });
});
