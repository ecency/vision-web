import { describe, expect, it } from "vitest";
import { isEditorPath, isPathInSection } from "@/utils/path-section";

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

describe("isEditorPath", () => {
  it.each([
    "/submit",
    "/publish",
    "/publish/entry/x",
    "/draft/123",
    "/@alice/my-post/edit",
    "/hive-1/@alice/my-post/edit"
  ])("treats %s as an editor page", (p) => expect(isEditorPath(p)).toBe(true));

  it.each([
    "/@alice/credit-card-tips",
    "/@bob/first-draft",
    "/@carol/how-to-publish",
    "/@dan/submitted",
    "/@erin/edit-notes",
    null
  ])("does not treat %s as an editor page", (p) => expect(isEditorPath(p)).toBe(false));
});

describe("isPathInSection for a profile", () => {
  it("knows alice's profile pages from a longer username's", () => {
    expect(isPathInSection("/@alice", "/@alice")).toBe(true);
    expect(isPathInSection("/@alice/wallet", "/@alice")).toBe(true);
    expect(isPathInSection("/@alicebob", "/@alice")).toBe(false);
    expect(isPathInSection("/@alicebob/wallet", "/@alice")).toBe(false);
  });
});
