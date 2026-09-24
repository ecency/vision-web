import { describe, expect, it } from "vitest";
import { getTagsWarning } from "@/app/submit/_utils/tags";

describe("getTagsWarning", () => {
  it("accepts well-formed tags", () => {
    expect(getTagsWarning(["hive", "photo-walk", "web3", "hive-123456"])).toBe("");
  });

  it.each([
    ["my-first-post", "tag-selector.limited_dash"],
    ["2026recap", "tag-selector.limited_firstchar"],
    ["photography-", "tag-selector.limited_lastchar"],
    ["a".repeat(25), "tag-selector.limited_length"],
    ["Hive", "tag-selector.limited_lowercase"],
    ["café", "tag-selector.limited_characters"]
  ])("rejects %s", (tag, key) => {
    expect(getTagsWarning(["hive", tag])).toBe(key);
  });

  // The classic editor's validate() passes the edited post's own tags here, so
  // a legacy tag published elsewhere does not block saving an edit.
  it("exempts tags the post already carries, and only those", () => {
    expect(getTagsWarning(["hive", "3speak"], ["3speak"])).toBe("");
    expect(getTagsWarning(["hive", "3speak", "2026recap"], ["3speak"])).toBe(
      "tag-selector.limited_firstchar"
    );
  });
});
