import { NextResponse } from "next/server";
import {
  getMattermostTeamId,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch
} from "@/server/mattermost";
import {
  fetchAllChannelPages,
  fetchAllChannelMemberPages,
  channelUnreadMessageCount,
  dmContributesToUnreadBadge,
  fetchDeactivatedDmPartners,
  findPhantomUnreadDmChannelIds,
  isChannelUnreadSuppressed,
  isDirectLikeChannel,
  isMattermostDefaultChannel
} from "./helpers";

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
  directUser?: MattermostUser | null;
  order?: number;
  last_post_at?: number;
  last_viewed_at?: number;
}

interface MattermostUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  last_picture_update?: number;
  delete_at?: number;
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

interface MattermostChannelCategory {
  id: string;
  user_id: string;
  team_id: string;
  sort_order: number;
  sorting: "" | "recent";
  type: "favorites" | "channels" | "direct_messages";
  display_name: string;
  muted: boolean;
  collapsed: boolean;
  channel_ids: string[];
}

interface MattermostPreference {
  user_id: string;
  category: string;
  name: string;
  value: string;
}

export async function GET() {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const teamId = getMattermostTeamId();

    const [channels, currentUser, channelMembers, categoriesResponse, preferences] = await Promise.all([
      fetchAllChannelPages(token),
      mmUserFetch<MattermostUser>(`/users/me`, token),
      fetchAllChannelMemberPages(token),
      mmUserFetch<{ categories: MattermostChannelCategory[]; order: string[] }>(
        `/users/me/teams/${teamId}/channels/categories`,
        token
      ).catch(() => ({ categories: [], order: [] })),
      mmUserFetch<MattermostPreference[]>(`/users/me/preferences`, token).catch(() => [])
    ]);

    const categoryOrderIds = categoriesResponse.order && categoriesResponse.order.length
      ? categoriesResponse.order
      : categoriesResponse.categories.map((category) => category.id);

    const categoriesById = new Map(
      (categoriesResponse.categories || []).map((category) => [category.id, category])
    );

    const favoriteIds = new Set(
      (categoriesResponse.categories || [])
        .find((category) => category.type === "favorites")
        ?.channel_ids || []
    );
    const directChannelPrefs = new Map(
      (preferences || [])
        .filter((pref) => pref.category === "direct_channel_show")
        .map((pref) => [pref.name, pref.value])
    );
    const directMessageCategoryIds = new Set(
      (categoriesResponse.categories || [])
        .find((category) => category.type === "direct_messages")
        ?.channel_ids || []
    );
    const channelMembersById = channelMembers.reduce<Record<string, MattermostChannelMemberCounts>>(
      (acc, member) => {
        acc[member.channel_id] = member;
        return acc;
      },
      {}
    );

    // Resolve deactivated DM partners FIRST. Their channels are dropped further
    // down anyway, and the phantom probe below is capped — letting doomed
    // channels eat probe slots here would make this route disagree with
    // unreads/route.ts about which DMs are phantom, which is exactly the
    // list-vs-badge drift this file exists to prevent.
    const { usersById, excludedChannelIds } = await fetchDeactivatedDmPartners<MattermostUser>(
      token,
      channels,
      currentUser.id
    );

    // Mattermost keeps counting deleted posts as unread (total_msg_count is
    // never decremented), so a DM whose sender deleted everything reports
    // unread with nothing to render. Resolve those before anything else reads
    // an unread count — visibility, the per-row badge and the global badge all
    // have to agree that such a channel is empty.
    const phantomDmIds = await findPhantomUnreadDmChannelIds(
      token,
      channels
        .filter(
          (channel) =>
            isDirectLikeChannel(channel) &&
            !excludedChannelIds.has(channel.id) &&
            !isMattermostDefaultChannel(channel) &&
            !isChannelUnreadSuppressed(channel, channelMembersById[channel.id]) &&
            channelUnreadMessageCount(channel, channelMembersById[channel.id]) > 0
        )
        .map((channel) => channel.id)
    );

    const unreadMessageCount = (channel: MattermostChannel) =>
      isChannelUnreadSuppressed(channel, channelMembersById[channel.id]) ||
      phantomDmIds.has(channel.id)
        ? 0
        : channelUnreadMessageCount(channel, channelMembersById[channel.id]);

    // A DM that contributes to the unread badge must stay visible in the list,
    // otherwise the badge shows a count the user has no row to open and clear —
    // the "phantom unread" bug for a closed (or uncategorized) DM that later
    // receives a message. The rule lives in ./helpers so it stays identical to
    // the unread-badge computation in channels/unreads/route.ts.
    const dmContributesToBadge = (channel: MattermostChannel) =>
      !phantomDmIds.has(channel.id) &&
      dmContributesToUnreadBadge(channel, channelMembersById[channel.id]);

    const hasCategories = (categoriesResponse.categories || []).length > 0;
    const filteredChannels = channels.filter((channel) => {
      // Filter out Mattermost team default channels
      if (isMattermostDefaultChannel(channel)) return false;

      if (channel.type !== "D") return true;

      // Never hide a DM that contributes to the unread badge, regardless of the
      // direct_channel_show preference or category membership. This keeps the
      // badge clearable (the user always has a row to open and read).
      if (dmContributesToBadge(channel)) return true;

      // Extract the other user ID from channel name first
      const parts = channel.name?.split("__") ?? [];
      const otherUserId =
        parts.length === 2
          ? parts.find((id) => id !== currentUser.id) || parts[0]
          : undefined;

      if (!otherUserId) return true;

      // Check direct_channel_show preference FIRST (takes precedence over categories)
      const prefValue = directChannelPrefs.get(otherUserId);
      if (prefValue === "false") return false;

      // Then check category membership
      if (hasCategories) {
        if (favoriteIds.has(channel.id) || directMessageCategoryIds.has(channel.id)) {
          return true;
        }
        // If we have categories but the channel is not in any, hide it
        return false;
      }

      return true;
    });

    // DM partners were already resolved above (one batched lookup covering every
    // DM channel, so it is a superset of what the filtered list needs).
    const channelsWithDirectUsers = filteredChannels
      .map((channel) => {
        if (channel.type !== "D") return channel;

        const parts = channel.name?.split("__") ?? [];
        const otherUserId =
          parts.length === 2
            ? parts.find((id) => id !== currentUser.id) || parts[0]
            : undefined;
        const directUser = otherUserId ? usersById[otherUserId] : undefined;
        const member = channelMembersById[channel.id];

        return {
          ...channel,
          mention_count: member?.mention_count || 0,
          message_count: unreadMessageCount(channel),
          display_name: directUser ? `@${directUser.username}` : channel.display_name,
          directUser: directUser || null,
          last_viewed_at: member?.last_viewed_at
        };
      })
      // Filter out DM channels where the other user has been deactivated
      .filter((channel) => {
        if (channel.type !== "D") return true;
        const directUser = (channel as typeof channel & { directUser: MattermostUser | null }).directUser;
        // Keep channel if directUser doesn't exist (can't determine) or if they're not deactivated
        if (!directUser) return true;
        return !directUser.delete_at || directUser.delete_at === 0;
      });

    const channelOrderFromCategories = (() => {
      const order = new Map<string, number>();
      let index = 0;

      categoryOrderIds.forEach((categoryId) => {
        const category = categoriesById.get(categoryId);
        if (!category) return;

        category.channel_ids.forEach((channelId) => {
          if (!order.has(channelId)) {
            order.set(channelId, index++);
          }
        });
      });

      filteredChannels.forEach((channel) => {
        if (!order.has(channel.id)) {
          order.set(channel.id, index++);
        }
      });

      return order;
    })();

    // `unread_eligible` is the server's verdict on whether this channel may
    // raise the badge at all, so clients do not each re-derive the rule and
    // drift apart. Both counts are zeroed alongside it: a mention count is a
    // subset of the message count, so leaving it populated on a suppressed or
    // emptied channel would resurrect the very badge we just cleared.
    const channelsWithCounts = channelsWithDirectUsers.map((channel) => {
      const unreadEligible =
        !isChannelUnreadSuppressed(channel, channelMembersById[channel.id]) &&
        !phantomDmIds.has(channel.id);

      return {
        ...channel,
        is_favorite: favoriteIds.has(channel.id),
        is_muted: channelMembersById[channel.id]?.notify_props?.mark_unread === "mention",
        mention_count: unreadEligible
          ? channelMembersById[channel.id]?.mention_count || channel.mention_count || 0
          : 0,
        message_count: unreadMessageCount(channel),
        unread_eligible: unreadEligible,
        order: channelOrderFromCategories.get(channel.id),
        last_viewed_at: channelMembersById[channel.id]?.last_viewed_at
      };
    });

    const orderedChannels = [...channelsWithCounts].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;

      return orderA - orderB;
    });

    return NextResponse.json({ channels: orderedChannels });
  } catch (error) {
    return handleMattermostError(error);
  }
}
