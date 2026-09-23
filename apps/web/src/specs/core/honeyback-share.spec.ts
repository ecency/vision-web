import { describe, expect, it } from "vitest";
import {
  honeybackShareHeadline,
  honeybackWaveComposeUrl,
  isHoneybackShareId,
  parseHoneybackShare,
  Translate
} from "@/features/honeyback/share";

const t: Translate = (key, values) =>
  `${key.split(".").pop()}|${Object.entries(values ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(",")}`;

const share = {
  id: "abc234defg",
  kind: "score" as const,
  value: 1280,
  name: "@alice",
  createdAt: "2026-09-23T10:00:00.000Z"
};

describe("honeyback share", () => {
  it("accepts only the id alphabet the games API issues", () => {
    expect(isHoneybackShareId("abc234defg")).toBe(true);
    expect(isHoneybackShareId("abc123def")).toBe(false);
    expect(isHoneybackShareId("abc234defgh")).toBe(false);
    expect(isHoneybackShareId("abc0O1Ilxy")).toBe(false);
    expect(isHoneybackShareId("../etc/pas")).toBe(false);
    expect(isHoneybackShareId(undefined)).toBe(false);
  });

  it("parses the documented response and nothing looser", () => {
    expect(parseHoneybackShare(share)).toEqual(share);
    expect(parseHoneybackShare({ ...share, name: "  Bee 1a2b " })?.name).toBe("Bee 1a2b");
    expect(parseHoneybackShare({ ...share, kind: "coins" })).toBeNull();
    expect(parseHoneybackShare({ ...share, value: 0 })).toBeNull();
    expect(parseHoneybackShare({ ...share, value: "12" })).toBeNull();
    expect(parseHoneybackShare({ ...share, name: "" })).toBeNull();
    expect(parseHoneybackShare({ ...share, createdAt: "yesterday" })).toBeNull();
    expect(parseHoneybackShare({ ...share, id: "bad" })).toBeNull();
    expect(parseHoneybackShare(null)).toBeNull();
    expect(parseHoneybackShare("abc234defg")).toBeNull();
  });

  it("builds the headline per kind with the formatted value", () => {
    expect(honeybackShareHeadline(share, t)).toBe("score|name=@alice,value=1,280");
    expect(honeybackShareHeadline({ ...share, kind: "streak", value: 7 }, t)).toBe(
      "streak|name=@alice,value=7"
    );
  });

  it("prefills the wave with the headline and the share link", () => {
    const url = honeybackWaveComposeUrl(share, t);
    expect(url.startsWith("/waves?text=")).toBe(true);
    expect(decodeURIComponent(url.slice("/waves?text=".length))).toBe(
      "score|name=@alice,value=1,280 https://ecency.com/honeyback-share/abc234defg"
    );
  });
});
