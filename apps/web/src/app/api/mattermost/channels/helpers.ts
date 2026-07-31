import { mmUserFetch, mmUserFetchNdjson } from "@/server/mattermost";

interface MattermostChannel {
  id: string;
  name: string;
  display_name: string;
  type: string;
  is_favorite?: boolean;
  is_muted?: boolean;
  total_msg_count?: number;
  mention_count?: number;
  message_count?: number;
  order?: number;
  last_post_at?: number;
  last_viewed_at?: number;
}

interface MattermostChannelMemberCounts {
  user_id: string;
  channel_id: string;
  mention_count: number;
  msg_count: number;
  notify_props?: {
    mark_unread?: string;
  };
  last_viewed_at?: number;
  last_update_at?: number;
}

/**
 * Mattermost auto-joins every user to these channels when they join a team.
 * No Hive user intentionally joined them, so they are hidden from the channel
 * list, excluded from the unread badge, and dropped from channel search. All
 * three must agree: a default channel that is searchable but not listable puts
 * the user in a channel that then vanishes from their sidebar.
 *
 * Matching is on the channel SLUG (`name`), never the display name — display
 * names are editable and can collide with a real community channel.
 */
const MATTERMOST_DEFAULT_CHANNEL_NAMES = new Set(["town-square", "off-topic"]);

/** Whether a channel is one of the Mattermost team defaults users never chose. */
export function isMattermostDefaultChannel(channel: { name?: string | null }): boolean {
  return MATTERMOST_DEFAULT_CHANNEL_NAMES.has(channel.name ?? "");
}

/** A channel is muted when the member opted out of unread marking (mobile parity). */
export function isChannelMuted(member?: { notify_props?: { mark_unread?: string } }): boolean {
  return member?.notify_props?.mark_unread === "mention";
}

/**
 * A channel has never been viewed when the member has no meaningful
 * `last_viewed_at`. Mattermost represents "never viewed" as either a missing
 * value or the int64 zero (`0`), so both must count.
 */
export function isChannelNeverViewed(member?: { last_viewed_at?: number | null }): boolean {
  return member?.last_viewed_at == null || member.last_viewed_at === 0;
}

/**
 * Direct (`D`) and group (`G`) message channels. Neither has an auto-join
 * path — a person has to be put in one deliberately — which is what makes the
 * never-viewed rule below inapplicable to them.
 */
export function isDirectLikeChannel(channel: { type?: string }): boolean {
  return channel.type === "D" || channel.type === "G";
}

interface MattermostDmUser {
  id: string;
  delete_at?: number;
}

/**
 * A 1:1 DM channel is named `<userA>__<userB>`, so the partner is whichever id
 * is not the viewer's. Group channels do not use that form and have no single
 * partner, hence `undefined`.
 */
export function directMessagePartnerId(
  channel: { name?: string | null; type?: string },
  selfUserId: string
): string | undefined {
  if (channel.type !== "D") return undefined;
  const parts = channel.name?.split("__") ?? [];
  if (parts.length !== 2) return undefined;
  return parts.find((id) => id !== selfUserId) || parts[0];
}

/**
 * DM channels whose partner has been deactivated. Both routes drop these, and
 * both must drop them at the SAME point: the phantom probe is capped, so a
 * route that probes doomed channels spends slots the other route does not and
 * the two can disagree about which DMs are phantom.
 *
 * Returns an empty set if the lookup fails — same fail-open reasoning as the
 * probe, a listing error must not silently hide conversations.
 */
export async function fetchDeactivatedDmPartners<TUser extends MattermostDmUser>(
  token: string,
  channels: Array<{ id: string; name?: string | null; type?: string }>,
  selfUserId: string
): Promise<{ usersById: Record<string, TUser>; excludedChannelIds: Set<string> }> {
  const partnerIdByChannelId = new Map<string, string>();
  for (const channel of channels) {
    const partnerId = directMessagePartnerId(channel, selfUserId);
    if (partnerId) partnerIdByChannelId.set(channel.id, partnerId);
  }

  const usersById: Record<string, TUser> = {};
  const excludedChannelIds = new Set<string>();
  if (!partnerIdByChannelId.size) return { usersById, excludedChannelIds };

  try {
    const users = await mmUserFetch<TUser[]>(`/users/ids`, token, {
      method: "POST",
      body: JSON.stringify(Array.from(new Set(partnerIdByChannelId.values())))
    });
    for (const user of users) usersById[user.id] = user;
  } catch {
    return { usersById, excludedChannelIds };
  }

  for (const [channelId, partnerId] of partnerIdByChannelId) {
    const partner = usersById[partnerId];
    if (partner?.delete_at && partner.delete_at > 0) excludedChannelIds.add(channelId);
  }

  return { usersById, excludedChannelIds };
}

/**
 * Whether the never-viewed rule suppresses a channel's unread count.
 *
 * Mattermost auto-joins a user to every channel of a community they join, and
 * an unopened one reports its ENTIRE history as unread (`msg_count` is 0, so
 * unread = `total_msg_count`). Counting those buries the badge under thousands
 * of messages nobody ever asked for, so a never-viewed channel contributes 0.
 *
 * ⛔ This must NOT be applied to DMs or group messages. `last_viewed_at = 0` is
 * exactly what a first-ever DM from a new person looks like, so the rule
 * silently swallowed every first-contact DM — the badge stayed at 0 while a
 * real message sat unread. Neither channel type can be auto-joined, so there is
 * no history flood to protect against and the guard has no work to do.
 */
export function isChannelUnreadSuppressed(
  channel: { type?: string },
  member?: {
    last_viewed_at?: number | null;
    notify_props?: { mark_unread?: string };
  }
): boolean {
  if (isChannelMuted(member)) return true;
  if (isDirectLikeChannel(channel)) return false;
  return isChannelNeverViewed(member);
}

/** Unread messages = total posts in the channel minus what the member has read. */
export function channelUnreadMessageCount(
  channel: { total_msg_count?: number },
  member?: { msg_count?: number }
): number {
  return Math.max((channel.total_msg_count || 0) - (member?.msg_count || 0), 0);
}

/**
 * Whether a DM contributes to the unread badge. This is the SINGLE source of
 * truth shared by two routes that must agree:
 *  - `channels/unreads` COUNTS such DMs into the badge, and
 *  - `channels` force-SHOWS them in the list.
 * If the two ever drift, a closed DM can show a badge count with no row to open
 * and clear it — the "phantom unread" bug. A DM contributes when it is not
 * muted and has unread messages.
 */
export function dmContributesToUnreadBadge(
  channel: { type?: string; total_msg_count?: number },
  member?: {
    msg_count?: number;
    last_viewed_at?: number | null;
    notify_props?: { mark_unread?: string };
  }
): boolean {
  if (!member) return false;
  if (isChannelUnreadSuppressed(channel, member)) return false;
  return channelUnreadMessageCount(channel, member) > 0;
}

/**
 * Mattermost soft-deletes posts but never decrements `channels.total_msg_count`,
 * so a DM whose messages were all deleted by their sender keeps reporting
 * unread forever. The recipient sees a badge that opens to an empty
 * conversation and cannot be cleared by reading it.
 *
 * `GET /channels/{id}/posts?per_page=1` excludes deleted posts, so an empty
 * `order` means the channel has nothing left to show and its unread count is a
 * phantom. Probing is bounded and only ever runs for DMs that already report
 * unread — in practice a handful of channels for the small share of users who
 * have unread DMs at all.
 *
 * Fails OPEN: a probe that errors (or a channel past the cap) is treated as
 * live, because hiding a real message is far worse than leaving a stale badge.
 *
 * ⚠️ This verdict goes stale the instant a new post lands, unlike the mute and
 * never-viewed rules. Anything caching it must be able to tell the two apart —
 * see `unread_emptied` in channels/unreads/route.ts.
 */
const DM_LIVENESS_PROBE_LIMIT = 16;

interface MattermostPostList {
  order?: string[];
}

export async function findPhantomUnreadDmChannelIds(
  token: string,
  channelIds: string[]
): Promise<Set<string>> {
  const phantom = new Set<string>();
  if (!channelIds.length) return phantom;

  const probed = channelIds.slice(0, DM_LIVENESS_PROBE_LIMIT);

  await Promise.all(
    probed.map(async (channelId) => {
      try {
        const posts = await mmUserFetch<MattermostPostList>(
          `/channels/${channelId}/posts?per_page=1`,
          token
        );
        if (Array.isArray(posts?.order) && posts.order.length === 0) {
          phantom.add(channelId);
        }
      } catch {
        // Fail open — leave the channel counted.
      }
    })
  );

  return phantom;
}

// `/users/me/channels` returns the user's full channel list as a single
// streamed response when no `page`/`per_page` are supplied. This matches
// Client4.getAllTeamsChannels in the official Mattermost webapp and avoids
// the 3-page sequential round-trip the previous paginated form required.
export async function fetchAllChannelPages(token: string): Promise<MattermostChannel[]> {
  const result = await mmUserFetch<MattermostChannel[]>("/users/me/channels", token);
  return Array.isArray(result) ? result : [];
}

// `/users/me/channel_members?page=-1` switches Mattermost into NDJSON
// streaming mode (Client4.getAllChannelsMembers uses this with userId/-1).
// It returns every channel-member row for the user across teams in a single
// response, removing the sequential pagination we used to do per team.
export async function fetchAllChannelMemberPages(
  token: string
): Promise<MattermostChannelMemberCounts[]> {
  return await mmUserFetchNdjson<MattermostChannelMemberCounts>(
    "/users/me/channel_members?page=-1",
    token
  );
}
