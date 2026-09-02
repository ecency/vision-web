import { describe, expect, it } from "vitest";
import { describeDigest } from "@/features/newsletter";

// i18next is globally mocked to return keys, so the assertion is on which key
// each type resolves to: the site digest must never fall through to "own".
describe("describeDigest", () => {
  it("labels every type explicitly and never relabels one as another", () => {
    expect(describeDigest("community", "hive-1")).toBe("newsletter.row-community");
    expect(describeDigest("creator", "alice")).toBe("newsletter.row-creator");
    expect(describeDigest("site", "ecency")).toBe("newsletter.row-site");
    expect(describeDigest("own", "alice")).toBe("newsletter.row-own");
    expect(describeDigest("tag", "photography")).toBe("newsletter.row-tag");
    expect(describeDigest("something-new", "x")).toBe("newsletter.row-unknown");
  });
});
