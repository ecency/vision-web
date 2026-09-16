import { vi } from "vitest";
import {
  createPatch,
  createPermlink,
  createReplyPermlink,
  ensureValidPermlink,
  extractMetaData,
  makeCommentOptions,
  makeJsonMetaData,
  makeJsonMetaDataReply
} from "../../utils/posting";

describe("Posting", () => {
  it("createPermlink", () => {
    const input = "lorem ipsum dolor sit amet";
    expect(createPermlink(input)).toMatchSnapshot();
  });

  it("createPermlink random", () => {
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      return 1.95136022969379;
    });
    const input = "lorem ipsum dolor sit amet";
    expect(createPermlink(input, true)).toMatchSnapshot();
    randomSpy.mockRestore();
  });

  it("createPermlink non-latin chars", () => {
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      return 1.95136022969379;
    });
    const input = "ปลาตัวใหญ่สีเหลืองทอง";
    expect(createPermlink(input)).toMatchSnapshot();
    randomSpy.mockRestore();
  });

  it("createPermlink avoids reserved profile-section slugs", () => {
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => 1.95136022969379);

    // A title that slugifies to a section name must not become that bare slug,
    // or /@author/<permlink> would resolve to the section page, not the post.
    expect(createPermlink("Followers")).not.toBe("followers");
    expect(createPermlink("Followers").startsWith("followers-")).toBe(true);
    expect(createPermlink("Wallet").startsWith("wallet-")).toBe(true);

    // Non-section titles are unaffected.
    expect(createPermlink("My cool post")).toBe("my-cool-post");

    randomSpy.mockRestore();
  });

  it("ensureValidPermlink returns valid permlink unchanged", () => {
    expect(ensureValidPermlink("valid-permlink-1", "fallback title")).toBe(
      "valid-permlink-1"
    );
  });

  it("ensureValidPermlink sanitizes invalid permlink", () => {
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      return 1.95136022969379;
    });

    expect(ensureValidPermlink("Not Ready Yet", "fallback title")).toBe(
      "not-ready-yet"
    );

    randomSpy.mockRestore();
  });

  it("ensureValidPermlink avoids a reserved profile-section slug", () => {
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => 1.95136022969379);

    // A regex-valid but reserved user-provided permlink must not be returned
    // as-is, or /@author/followers would resolve to the section page.
    const result = ensureValidPermlink("followers", "fallback title");
    expect(result).not.toBe("followers");
    expect(result.startsWith("followers-")).toBe(true);

    randomSpy.mockRestore();
  });

  it("(1) extractMetadata", () => {
    const input = '<img src="http://www.xx.com/a.png"> @lorem @ipsum';
    expect(extractMetaData(input)).toMatchSnapshot();
  });

  it("(2) extractMetadata", () => {
    const input =
      '@lorem <img src="http://www.xx.com/a.png"> ![h74zrad2fh.jpg](https://img.esteem.ws/h74zrad2fh.jpg) http://www.google.com/foo/bar  @ipsum';
    expect(extractMetaData(input)).toMatchSnapshot();
  });

  it("(3) extractMetadata with .arw (Sony RAW) images", () => {
    const input =
      'Check out this RAW photo: https://example.com/photo.arw and this one https://example.com/DSC_1234.ARW';
    expect(extractMetaData(input)).toMatchSnapshot();
  });

  it("(4) extractMetadata with images.ecency.com URLs", () => {
    const input =
      'Here are some proxified images: https://images.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgnAvKo1Rap9w75mXk and https://images.ecency.com/DQmXYZ123/image.jpg';
    expect(extractMetaData(input)).toMatchSnapshot();
  });

  it("(5) extractMetadata with mixed image types", () => {
    const input =
      '<img src="https://example.com/photo.png"> https://images.ecency.com/p/abc123 ![raw](https://example.com/photo.arw) Regular JPEG: https://example.com/photo.jpg';
    expect(extractMetaData(input)).toMatchSnapshot();
  });

  it("(6) extractMetadata lists a markdown Ecency image once, without the closing parenthesis", () => {
    const url = "https://i.ecency.com/DQmUY1PhsHi6rAFjF58wQGVCk7EruY8HyNyYBbWJCMVjedH/photo.png";
    expect(extractMetaData(`<center>![](${url})</center>`).image).toEqual([url]);
  });

  it("(7) extractMetadata keeps an extension-less Ecency image in markdown intact", () => {
    const url =
      "https://images.ecency.com/p/3W72119s5BjW4PvRk9nXBzqrPWMsMTjNrXDPFFf1?format=match&mode=fit";
    expect(extractMetaData(`![](${url})`).image).toEqual([url]);
  });

  it("(8) extractMetadata keeps parentheses that belong to the filename", () => {
    const url = "https://i.ecency.com/DQmX/photo_(1).jpg";
    expect(extractMetaData(`![](${url})`).image).toEqual([url]);
  });

  it("(9) extractMetadata stops a linked Ecency image at its own URL", () => {
    const url = "https://images.ecency.com/p/abc123";
    expect(extractMetaData(`[![](${url})](https://ecency.com/@ecency)`).image).toEqual([url]);
  });

  it("(10) extractMetadata keeps a closing parenthesis inside an HTML attribute URL", () => {
    const withExt = "https://i.ecency.com/DQmX/report).png";
    expect(extractMetaData(`<img src="${withExt}">`).image).toEqual([withExt]);

    const withoutExt = "https://images.ecency.com/p/abc)def";
    expect(extractMetaData(`<img src="${withoutExt}">`).image).toEqual([withoutExt]);
  });

  it("(12) extractMetadata lists both images written back to back", () => {
    const a = "https://i.ecency.com/DQmX/a.png";
    const b = "https://i.ecency.com/DQmY/b.jpg";
    expect(extractMetaData(`![](${a})![](${b})`).image).toEqual([a, b]);
    expect(extractMetaData(`|![](${a})|![](${b})|`).image).toEqual([a, b]);
    expect(extractMetaData(`<center>![](${a})![](${b})</center>`).image).toEqual([a, b]);
  });

  it("(13) extractMetadata lists both extension-less images written back to back", () => {
    const a = "https://images.ecency.com/p/F1abc";
    const b = "https://images.ecency.com/p/F2def";
    expect(extractMetaData(`![](${a})![](${b})`).image).toEqual([a, b]);
    expect(extractMetaData(`[![](${a})](${b})`).image).toEqual([a, b]);
  });

  it("(14) extractMetadata skips a link target that is not an image", () => {
    const image = "https://example.com/x.png";
    expect(extractMetaData(`[page](https://example.com/page)![](${image})`).image).toEqual([image]);
  });

  it("(15) extractMetadata cuts a markdown destination written with spaces", () => {
    const url = "https://images.ecency.com/p/3W72F1";
    expect(extractMetaData(`![]( ${url})`).image).toEqual([url]);
  });

  it("(16) extractMetadata drops a stored URL that is a broken twin of a body image", () => {
    const url = "https://i.ecency.com/DQmX/a.png";
    const meta = { image: [url, `${url})`], thumbnails: [url, `${url})`] };
    const out = extractMetaData(`![](${url})`, meta);
    expect(out.image).toEqual([url]);
    expect(out.thumbnails).toEqual([url]);
  });

  it("(17) extractMetadata lists an image with a query string once, in full", () => {
    const url = "https://i.ecency.com/DQmX/photo.png?x=1";
    expect(extractMetaData(`![](${url})`).image).toEqual([url]);

    const fragment = "https://i.ecency.com/DQmX/photo.png#top";
    expect(extractMetaData(`![](${fragment})`).image).toEqual([fragment]);
  });

  it("(18) extractMetadata drops a stored copy that was cut short of its query", () => {
    const url = "https://i.ecency.com/DQmX/photo.png?x=1";
    const out = extractMetaData(`![](${url})`, {
      image: ["https://i.ecency.com/DQmX/photo.png"],
      thumbnails: ["https://i.ecency.com/DQmX/photo.png"]
    });
    expect(out.image).toEqual([url]);
    expect(out.thumbnails).toEqual([url]);
  });

  it("(20) extractMetadata keeps two images that differ only by a query string", () => {
    const plain = "https://images.ecency.com/p/abc";
    const fitted = "https://images.ecency.com/p/abc?mode=fit";
    expect(extractMetaData(`![](${plain}) ![](${fitted})`).image).toEqual([plain, fitted]);
  });

  it("(19) extractMetadata keeps two URLs where one only looks like a prefix", () => {
    const short = "https://images.ecency.com/p/abc";
    const long = "https://images.ecency.com/p/abcd";
    expect(extractMetaData(`![](${short}) ![](${long})`).image).toEqual([short, long]);
  });

  it("(11) extractMetadata keeps a closing parenthesis inside a bare proxy URL", () => {
    const url = "https://images.ecency.com/webp/https://example.com/chart).png";
    expect(extractMetaData(`Source: ${url} for details`).image).toEqual([url]);
  });

  it("makeJsonMetaData", () => {
    const meta = {
      image: ["http://www.xx.com/a.png", "https://img.esteem.ws/h74zrad2fh.jpg"]
    };
    const tags = ["esteem", "art"];

    expect(makeJsonMetaData(meta, tags, "", "2.0.0")).toMatchSnapshot();
  });

  describe("makeCommentOptions", () => {
    it("(1) Default 50% / 50%", () => {
      expect(
        makeCommentOptions("talhasch", "lorem-ipsum-1", "default")
      ).toBeNull();
    });

    it("(2) Power Up 100%", () => {
      expect(makeCommentOptions("talhasch", "lorem-ipsum-1", "sp")).toMatchSnapshot();
    });

    it("(3) Decline Payout", () => {
      expect(makeCommentOptions("talhasch", "lorem-ipsum-1", "dp")).toMatchSnapshot();
    });

    it("(4) Empty beneficiary list", () => {
      expect(
        makeCommentOptions("talhasch", "lorem-ipsum-1", "default", [])
      ).toBeNull();
    });

    it("(5) With beneficiary list", () => {
      expect(
        makeCommentOptions("talhasch", "lorem-ipsum-1", "default", [
          { account: "foo", weight: 300 },
          { account: "bar", weight: 200 }
        ])
      ).toMatchSnapshot();
    });

    it("(6) Keeps source metadata untouched", () => {
      const beneficiaries = [
        { account: "foo", weight: 300, src: "ENCODER_PAY" },
        { account: "bar", weight: 200 }
      ];

      const options = makeCommentOptions(
        "talhasch",
        "lorem-ipsum-1",
        "default",
        beneficiaries
      );

      expect(beneficiaries[0].src).toBe("ENCODER_PAY");
      expect(options?.extensions[0][1].beneficiaries).toEqual([
        { account: "bar", weight: 200 },
        { account: "foo", weight: 300 }
      ]);
    });
  });

  it("makeJsonMetadataReply", () => {
    expect(makeJsonMetaDataReply(["foo", "bar"], "1.1")).toMatchSnapshot();
  });

  it("createReplyPermlink", () => {
    // Use fake timers and set system time (timezone is UTC via vitest.config.ts)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2018-09-21T12:00:50.000Z"));

    expect(createReplyPermlink("good-karma")).toMatchSnapshot();

    // Restore real timers
    vi.useRealTimers();
  });

  it("createPatch", () => {
    expect(
      createPatch("lorem ipsum dlor sit amet", "lorem ipsum dolor sit amet")
    ).toMatchSnapshot();
  });
});
