import { describe, expect, it } from "vitest";
import { isPathInSection } from "@/utils/path-section";

describe("isPathInSection", () => {
  it.each([
    ["/raidstead", "/raidstead"],
    ["/waves/@alice/re-wave-1", "/waves"],
    ["/discover/communities", "/discover"],
    ["/communities/create", "/communities"]
  ])("marks %s as inside %s", (pathname, link) => {
    expect(isPathInSection(pathname, link)).toBe(true);
  });

  it.each([
    ["/@ecency/raidstead-your-community-against-the", "/raidstead"],
    ["/hive-125125/@alice/waves-of-change", "/waves"],
    ["/@alice/communities", "/communities"],
    ["/raidsteadx", "/raidstead"],
    ["/", "/discover"],
    [null, "/decks"]
  ])("does not mark %s as inside %s", (pathname, link) => {
    expect(isPathInSection(pathname, link)).toBe(false);
  });
});

describe("isPathInSection for a profile", () => {
  it("knows alice's profile pages from a longer username's", () => {
    expect(isPathInSection("/@alice", "/@alice")).toBe(true);
    expect(isPathInSection("/@alice/wallet", "/@alice")).toBe(true);
    expect(isPathInSection("/@alicebob", "/@alice")).toBe(false);
    expect(isPathInSection("/@alicebob/wallet", "/@alice")).toBe(false);
  });
});
