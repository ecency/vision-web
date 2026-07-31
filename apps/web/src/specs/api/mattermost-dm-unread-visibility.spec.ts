// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression test: a DM that contributes to the unread badge must stay visible
 * in the channel list.
 *
 * The unread badge (channels/unreads/route.ts) counts a DM's unread messages
 * regardless of the `direct_channel_show` preference. The channel list route
 * used to hide any DM with `direct_channel_show=false`, so a closed DM that
 * later received a message produced a "phantom" badge: a count with no row to
 * open and clear. The list route now keeps such a DM visible.
 *
 * Two later fixes are pinned here as well:
 *  - a never-viewed DM (`last_viewed_at` null or 0) DOES contribute. That is
 *    what a first message from a new person looks like, and treating it as
 *    "not viewed yet, so skip" hid first-contact DMs entirely.
 *  - a DM whose posts were all deleted does NOT contribute, even though
 *    Mattermost still reports unread for it (`total_msg_count` is never
 *    decremented on delete).
 */

const mockMmUserFetch = vi.fn();
const mockFetchAllChannelPages = vi.fn();
const mockFetchAllChannelMemberPages = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostTeamId: () => "team-123",
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (err: unknown) => ({ error: String(err) }),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

// Keep the real badge/never-viewed predicates (the route now imports
// dmContributesToUnreadBadge from here); only the network fetchers are stubbed.
vi.mock("@/app/api/mattermost/channels/helpers", async () => ({
  ...(await vi.importActual("@/app/api/mattermost/channels/helpers")),
  fetchAllChannelPages: (...args: unknown[]) => mockFetchAllChannelPages(...args),
  fetchAllChannelMemberPages: (...args: unknown[]) => mockFetchAllChannelMemberPages(...args)
}));

// Six closed DMs (direct_channel_show=false), each exercising one branch of the
// "contributes to badge" rule.
const CHANNELS = [
  // unread + viewed + not muted -> contributes -> must stay visible
  { id: "dm-unread", name: "u-self__u-other", display_name: "", type: "D", total_msg_count: 5 },
  // read (msg_count == total) -> no unread -> stays hidden
  { id: "dm-read", name: "u-self__u-read", display_name: "", type: "D", total_msg_count: 3 },
  // muted with unread -> badge zeroes muted -> stays hidden
  { id: "dm-muted", name: "u-self__u-muted", display_name: "", type: "D", total_msg_count: 4 },
  // never viewed (last_viewed_at null) -> a first DM -> must stay visible
  { id: "dm-neverviewed", name: "u-self__u-new", display_name: "", type: "D", total_msg_count: 2 },
  // never viewed (last_viewed_at 0, Mattermost's other "never" value) -> visible
  { id: "dm-neverviewed-zero", name: "u-self__u-zero", display_name: "", type: "D", total_msg_count: 2 },
  // unread per Mattermost, but every post was deleted -> nothing to read -> hidden
  { id: "dm-phantom", name: "u-self__u-ghost", display_name: "", type: "D", total_msg_count: 2 }
];

// Channels whose post list comes back empty because every post is soft-deleted.
const EMPTIED_CHANNEL_IDS = new Set(["dm-phantom"]);

const MEMBERS = [
  { user_id: "u-self", channel_id: "dm-unread", mention_count: 4, msg_count: 1, last_viewed_at: 1000 },
  { user_id: "u-self", channel_id: "dm-read", mention_count: 0, msg_count: 3, last_viewed_at: 2000 },
  {
    user_id: "u-self",
    channel_id: "dm-muted",
    mention_count: 2,
    msg_count: 0,
    last_viewed_at: 3000,
    notify_props: { mark_unread: "mention" }
  },
  { user_id: "u-self", channel_id: "dm-neverviewed", mention_count: 0, msg_count: 0, last_viewed_at: null },
  { user_id: "u-self", channel_id: "dm-neverviewed-zero", mention_count: 0, msg_count: 0, last_viewed_at: 0 },
  { user_id: "u-self", channel_id: "dm-phantom", mention_count: 2, msg_count: 0, last_viewed_at: 0 }
];

const PREFERENCES = [
  { user_id: "u-self", category: "direct_channel_show", name: "u-other", value: "false" },
  { user_id: "u-self", category: "direct_channel_show", name: "u-read", value: "false" },
  { user_id: "u-self", category: "direct_channel_show", name: "u-muted", value: "false" },
  { user_id: "u-self", category: "direct_channel_show", name: "u-new", value: "false" },
  { user_id: "u-self", category: "direct_channel_show", name: "u-zero", value: "false" },
  { user_id: "u-self", category: "direct_channel_show", name: "u-ghost", value: "false" }
];

const DM_USERS = [
  { id: "u-other", username: "other", delete_at: 0 },
  { id: "u-read", username: "readpartner", delete_at: 0 },
  { id: "u-muted", username: "mutedpartner", delete_at: 0 },
  { id: "u-new", username: "newpartner", delete_at: 0 },
  { id: "u-zero", username: "zeropartner", delete_at: 0 },
  { id: "u-ghost", username: "ghostpartner", delete_at: 0 }
];

describe("channels route — DM unread visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAllChannelPages.mockResolvedValue(CHANNELS);
    mockFetchAllChannelMemberPages.mockResolvedValue(MEMBERS);
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path === "/users/me") return Promise.resolve({ id: "u-self", username: "self" });
      if (path.includes("/channels/categories")) return Promise.resolve({ categories: [], order: [] });
      if (path === "/users/me/preferences") return Promise.resolve(PREFERENCES);
      if (path === "/users/ids") return Promise.resolve(DM_USERS);

      // Liveness probe. Mattermost omits deleted posts from `order`, so an
      // emptied channel answers with an empty list while a live one does not.
      const probe = /^\/channels\/([^/]+)\/posts\?per_page=1$/.exec(path);
      if (probe) {
        const id = probe[1];
        return Promise.resolve(
          EMPTIED_CHANNEL_IDS.has(id) ? { order: [], posts: {} } : { order: ["p1"], posts: { p1: {} } }
        );
      }

      return Promise.resolve([]);
    });
  });

  async function getChannels() {
    const { GET } = await import("@/app/api/mattermost/channels/route");
    const res = await GET();
    const body = await res.json();
    return body.channels as { id: string; message_count: number; mention_count: number }[];
  }

  async function getChannelIds() {
    return (await getChannels()).map((c) => c.id);
  }

  it("keeps a closed DM visible when it has unread messages", async () => {
    const ids = await getChannelIds();
    expect(ids).toContain("dm-unread");
  });

  it("still hides a closed DM that has been read", async () => {
    const ids = await getChannelIds();
    expect(ids).not.toContain("dm-read");
  });

  it("does not force-show a muted DM (excluded from the badge)", async () => {
    const ids = await getChannelIds();
    expect(ids).not.toContain("dm-muted");
  });

  it("shows a never-viewed DM — a first message from someone new is unread", async () => {
    const ids = await getChannelIds();
    expect(ids).toContain("dm-neverviewed");
  });

  it("shows a never-viewed DM reported with last_viewed_at of 0", async () => {
    const ids = await getChannelIds();
    expect(ids).toContain("dm-neverviewed-zero");
  });

  it("hides a DM whose posts were all deleted and zeroes its counts", async () => {
    const channels = await getChannels();
    expect(channels.map((c) => c.id)).not.toContain("dm-phantom");
  });

  it("does not probe DMs that have no unread messages", async () => {
    await getChannelIds();
    const probed = mockMmUserFetch.mock.calls
      .map(([path]) => /^\/channels\/([^/]+)\/posts/.exec(path as string)?.[1])
      .filter(Boolean);
    expect(probed).not.toContain("dm-read");
    expect(probed).not.toContain("dm-muted");
  });
});
