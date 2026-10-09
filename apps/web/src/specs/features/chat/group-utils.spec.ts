import { describe, it, expect, vi } from "vitest";

vi.mock("i18next", () => {
  const en: Record<string, string> = {
    "chat.reactor-you": "You",
    "chat.reactor-unknown": "someone",
    "chat.reactors-more": "{{names}} and {{count}} more",
    "chat.reacted-with": "{{names}} reacted with {{emoji}}",
    "chat.see-who-reacted": "See who reacted"
  };
  const t = (key: string, opts: Record<string, unknown> = {}) =>
    (en[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(opts[name]));
  return { __esModule: true, default: { t, language: "en" } };
});

import {
  findMissingUserIds,
  formatReactorNames,
  getGroupTitle,
  getReactorName,
  groupReactions,
  isConversationChannel
} from "@/features/chat/group-utils";
import type { MattermostUser } from "@/features/chat/mattermost-api";

const user = (id: string, extra: Partial<MattermostUser> = {}): MattermostUser => ({
  id,
  username: id,
  ...extra
});

describe("getGroupTitle", () => {
  it("joins up to three names", () => {
    expect(getGroupTitle([user("alice"), user("bob")], "x")).toBe("@alice and @bob");
    expect(getGroupTitle([user("a1"), user("b1"), user("c1")], "x")).toBe("@a1, @b1, and @c1");
  });

  it("prefers a person's display name", () => {
    expect(getGroupTitle([user("alice", { nickname: "Ali" }), user("bob")], "x")).toBe("Ali and @bob");
  });

  it("summarises the rest of a bigger group", () => {
    const users = ["a1", "b1", "c1", "d1", "e1"].map((id) => user(id));
    expect(getGroupTitle(users, "x")).toBe("@a1, @b1, @c1 +2");
  });

  it("falls back when members are unknown", () => {
    expect(getGroupTitle(undefined, "alice, bob, me")).toBe("alice, bob, me");
    expect(getGroupTitle([], "fallback")).toBe("fallback");
  });
});

describe("isConversationChannel", () => {
  it("covers direct messages and groups only", () => {
    expect(isConversationChannel({ type: "D" })).toBe(true);
    expect(isConversationChannel({ type: "G" })).toBe(true);
    expect(isConversationChannel({ type: "O" })).toBe(false);
    expect(isConversationChannel(null)).toBe(false);
  });
});

describe("groupReactions", () => {
  const reactions = [
    { user_id: "u1", post_id: "p", emoji_name: "+1" },
    { user_id: "u2", post_id: "p", emoji_name: "heart" },
    { user_id: "me", post_id: "p", emoji_name: "+1" },
    { user_id: "u1", post_id: "p", emoji_name: "+1" }
  ];

  it("groups by emoji in first-use order, without duplicate reactors", () => {
    expect(groupReactions(reactions, "me")).toEqual([
      { emojiName: "+1", userIds: ["u1", "me"], reacted: true },
      { emojiName: "heart", userIds: ["u2"], reacted: false }
    ]);
  });

  it("handles a post with no reactions", () => {
    expect(groupReactions(undefined)).toEqual([]);
  });
});

describe("reactor names", () => {
  const usersById = { u1: user("alice"), u2: user("bob"), u3: user("carol") };

  it("names the viewer as You and an unknown reactor as someone", () => {
    expect(getReactorName("me", usersById, "me")).toBe("You");
    expect(getReactorName("u1", usersById, "me")).toBe("@alice");
    expect(getReactorName("zz", usersById, "me")).toBe("someone");
  });

  it("puts the viewer first", () => {
    expect(formatReactorNames(["u1", "me"], usersById, "me")).toBe("You and @alice");
  });

  it("counts the people past the limit", () => {
    expect(formatReactorNames(["u1", "u2", "u3"], usersById, undefined, 2)).toBe(
      "@alice, @bob and 1 more"
    );
  });
});

describe("findMissingUserIds", () => {
  it("lists reactors without a record, once and sorted", () => {
    const posts = [
      { metadata: { reactions: [{ user_id: "z9", post_id: "a", emoji_name: "x" }] } },
      {
        metadata: {
          reactions: [
            { user_id: "known", post_id: "b", emoji_name: "x" },
            { user_id: "a1", post_id: "b", emoji_name: "y" },
            { user_id: "z9", post_id: "b", emoji_name: "y" }
          ]
        }
      },
      {}
    ];
    expect(findMissingUserIds(posts, { known: user("known") })).toEqual(["a1", "z9"]);
  });

  it("lists message authors without a record, such as a new group's first sender", () => {
    const posts = [
      { user_id: "sender", metadata: { reactions: [{ user_id: "known", post_id: "a", emoji_name: "x" }] } },
      { user_id: "known" },
      { user_id: "sender" }
    ];
    expect(findMissingUserIds(posts, { known: user("known") })).toEqual(["sender"]);
  });
});
