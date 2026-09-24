import { describe, expect, it } from "vitest";
import { getTagsWarning, validateTags } from "@/app/submit/_utils/tags";
import type { Entry } from "@/entities";

const entryWith = (tags: unknown) => ({ json_metadata: { tags } }) as unknown as Entry;

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

  it("exempts tags the post already carries, and only those", () => {
    expect(getTagsWarning(["hive", "3speak"], ["3speak"])).toBe("");
    expect(getTagsWarning(["hive", "3speak", "2026recap"], ["3speak"])).toBe(
      "tag-selector.limited_firstchar"
    );
  });
});

describe("validateTags", () => {
  it("rejects an invalid tag on a new post", () => {
    expect(validateTags(["hive", "my-first-post"], {})).toBe("tag-selector.limited_dash");
    expect(validateTags(["hive", "travel"], { editingEntry: null, draftTags: [] })).toBe("");
  });

  // Tags published elsewhere (3speak, a year) must not block saving an edit.
  it("exempts the edited post's own tags", () => {
    const editingEntry = entryWith(["3speak", "hive"]);
    expect(validateTags(["hive", "3speak"], { editingEntry })).toBe("");
    expect(validateTags(["hive", "3speak", "2026recap"], { editingEntry })).toBe(
      "tag-selector.limited_firstchar"
    );
  });

  // Drafts are shared with mobile, whose tag input has no first-character rule.
  it("exempts the loaded draft's tags", () => {
    const draftTags = ["hive", "3speak", "2024"];
    expect(validateTags(["hive", "3speak", "2024"], { draftTags })).toBe("");
    expect(validateTags(["hive", "3speak", "2026recap"], { draftTags })).toBe(
      "tag-selector.limited_firstchar"
    );
  });

  // The editor trims loaded tags to 24 characters; the exemption must match that form.
  it("keeps a legacy over-long tag after the editor trimmed it on load", () => {
    const legacy = "a-b-" + "c".repeat(30);
    const editingEntry = entryWith(["hive", legacy]);
    expect(validateTags(["hive", legacy.slice(0, 24)], { editingEntry })).toBe("");
  });

  it("counts kept tags toward the tag limit", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `tag${String.fromCharCode(97 + i)}`);
    expect(validateTags(eleven, { editingEntry: entryWith(eleven.slice(0, 2)) })).toBe(
      "tag-selector.limited_tags"
    );
  });
});
