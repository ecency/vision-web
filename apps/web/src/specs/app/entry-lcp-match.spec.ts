import { describe, expect, it } from "vitest";
import { catchPostImage, getEntryImageRawUrl, proxifyImageSrc } from "@ecency/render-helper";
import { entryLcpMatch } from "@/app/(dynamicPages)/entry/_helpers/entry-lcp-match";
import { mockEntry } from "@/specs/test-utils";

describe("entryLcpMatch", () => {
  it("is null without a raw cover, so the page emits no preload", () => {
    expect(entryLcpMatch(null)).toBeNull();
    expect(entryLcpMatch(undefined)).toBeNull();
    expect(entryLcpMatch("")).toBeNull();
  });

  it("requests a non-gif cover at the thumbnail size the body renders", () => {
    const raw = "https://files.peakd.com/x/cover.svg";
    expect(entryLcpMatch(raw)).toBe(proxifyImageSrc(raw, 600, 500, "match"));
  });

  it("keeps a gif cover unsized, as the body does", () => {
    const raw = "https://files.peakd.com/x/anim.gif";
    expect(entryLcpMatch(raw)).toBe(proxifyImageSrc(raw, 0, 0, "match"));
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
    expect(entryLcpMatch(raw)).toBe(proxifyImageSrc("https://files.peakd.com/x/cover.gif", 0, 0, "match"));
    expect(catchPostImage(entry, 600, 500, "match")).toBe(
      proxifyImageSrc("https://files.peakd.com/x/poster.png", 600, 500, "match")
    );
  });

  it("returns null rather than an empty string for a cover the proxy refuses", () => {
    expect(entryLcpMatch("not a url")).toBeNull();
  });
});
