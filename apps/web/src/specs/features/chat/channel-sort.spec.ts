import { describe, expect, it } from "vitest";
import { getChannelActivityAt, sortChannelsByActivity } from "@/features/chat/channel-sort";

type Channel = {
  id: string;
  type: string;
  is_favorite?: boolean;
  is_muted?: boolean;
  last_post_at?: number;
  last_viewed_at?: number;
  unread?: number;
};

const unreadOf = (channel: Channel) => channel.unread ?? 0;
const ids = (channels: Channel[]) => channels.map((channel) => channel.id);

describe("getChannelActivityAt", () => {
  it("takes the newer of the last message and the last visit", () => {
    expect(getChannelActivityAt({ id: "a", last_post_at: 5, last_viewed_at: 9 })).toBe(9);
    expect(getChannelActivityAt({ id: "a", last_post_at: 12, last_viewed_at: 9 })).toBe(12);
    expect(getChannelActivityAt({ id: "a" })).toBe(0);
  });
});

describe("sortChannelsByActivity", () => {
  it("mixes direct messages, groups and channels by latest activity", () => {
    const channels: Channel[] = [
      { id: "open-old", type: "O", last_post_at: 100 },
      { id: "dm-new", type: "D", last_post_at: 500 },
      { id: "group-mid", type: "G", last_post_at: 300 },
      { id: "open-new", type: "O", last_post_at: 400, last_viewed_at: 600 }
    ];
    expect(ids(sortChannelsByActivity(channels, unreadOf))).toEqual([
      "open-new",
      "dm-new",
      "group-mid",
      "open-old"
    ]);
  });

  it("puts favorites, then unread, then the rest, then muted", () => {
    const channels: Channel[] = [
      { id: "muted-unread", type: "O", is_muted: true, unread: 3, last_post_at: 900 },
      { id: "plain", type: "D", last_post_at: 800 },
      { id: "unread", type: "G", unread: 1, last_post_at: 100 },
      { id: "favorite", type: "O", is_favorite: true, last_post_at: 50 }
    ];
    expect(ids(sortChannelsByActivity(channels, unreadOf))).toEqual([
      "favorite",
      "unread",
      "plain",
      "muted-unread"
    ]);
  });

  it("keeps the server order when activity ties", () => {
    const channels: Channel[] = [
      { id: "b", type: "O" },
      { id: "a", type: "O" }
    ];
    const order = new Map([
      ["a", 0],
      ["b", 1]
    ]);
    expect(ids(sortChannelsByActivity(channels, unreadOf, order))).toEqual(["a", "b"]);
  });
});
