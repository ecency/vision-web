import { NextResponse } from "next/server";
import {
  getMattermostTeamId,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch
} from "@/server/mattermost";
import * as Sentry from "@sentry/nextjs";
import {
  fetchAllChannelPages,
  fetchAllChannelMemberPages,
  isChannelUnreadSuppressed,
  isDirectLikeChannel,
  channelUnreadMessageCount,
  fetchDeactivatedDmPartners,
  findPhantomUnreadDmChannelIds,
  isMattermostDefaultChannel
} from "../helpers";

interface MattermostChannel {
  id: string;
  type: string;
  name?: string;
  total_msg_count?: number;
}

interface MattermostUser {
  id: string;
  username: string;
  delete_at?: number;
}

interface MattermostChannelMember {
  channel_id: string;
  mention_count: number;
  msg_count: number;
  last_viewed_at?: number;
  notify_props?: {
    mark_unread?: string;
  };
}

interface MattermostThread {
  channel_id: string;
  unread_replies?: number;
  unread_mentions?: number;
}

interface MattermostThreadsResponse {
  threads: MattermostThread[];
  total: number;
}

// Threads still paginate — kept identical to prior behavior. Channels and
// channel-member lists now come from streaming endpoints (see helpers.ts).
const THREAD_PAGE_SIZE = 200;
const THREAD_DEFAULT_MAX_PAGES = 2;
const THREAD_MAX_ALLOWED_PAGES = 2;

async function fetchAllThreadPages(token: string, teamId: string, maxPages: number) {
  const results: MattermostThread[] = [];
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await mmUserFetch<MattermostThreadsResponse>(
      `/users/me/teams/${teamId}/threads?page=${page}&per_page=${THREAD_PAGE_SIZE}`,
      token
    );
    const pageItems = response.threads || [];
    if (!pageItems.length) {
      break;
    }
    results.push(...pageItems);
    if (pageItems.length < THREAD_PAGE_SIZE) {
      break;
    }
    if (page === maxPages - 1) {
      truncated = true;
    }
  }

  return { items: results, truncated };
}

export async function GET() {
  const token = await getMattermostTokenFromCookies();

  if (!token) {
    return NextResponse.json({
      channels: [],
      totalMentions: 0,
      totalDMs: 0,
      totalThreads: 0,
      totalUnread: 0
    });
  }

  try {
    const teamId = getMattermostTeamId();

    const rawMaxPages = process.env.MATTERMOST_UNREAD_MAX_PAGES;
    const parsedMaxPages = Number.isNaN(parseInt(rawMaxPages ?? "", 10))
      ? THREAD_DEFAULT_MAX_PAGES
      : parseInt(rawMaxPages as string, 10);
    const threadMaxPages = Math.min(
      THREAD_MAX_ALLOWED_PAGES,
      Math.max(1, parsedMaxPages)
    );

    const [allChannels, members, threadsResult, currentUser] = await Promise.all([
      fetchAllChannelPages(token),
      fetchAllChannelMemberPages(token),
      fetchAllThreadPages(token, teamId, threadMaxPages).catch(() => ({ items: [], truncated: false })),
      mmUserFetch<{ id: string }>(`/users/me`, token)
    ]);

    const threads = threadsResult.items;
    // Channels & members come from streaming endpoints — they cannot truncate.
    // Only thread pagination can still hit a cap, so `truncated` reflects only that.
    const truncated = threadsResult.truncated;

    // DMs with a deactivated partner are dropped. Shared with the channel-list
    // route so both spend their capped phantom probes on the same candidates —
    // see fetchDeactivatedDmPartners.
    const { excludedChannelIds } = await fetchDeactivatedDmPartners<MattermostUser>(
      token,
      allChannels,
      currentUser.id
    );

    // Filter out excluded DM channels and hidden default channels
    const filteredChannels = allChannels.filter(
      (ch) => !excludedChannelIds.has(ch.id) && !isMattermostDefaultChannel(ch)
    );

    const memberByChannelId = members.reduce<Record<string, MattermostChannelMember>>((acc, member) => {
      acc[member.channel_id] = member;
      return acc;
    }, {});

    const threadUnreadByChannel = threads.reduce<Record<string, number>>((acc, thread) => {
      const unreadReplies = thread.unread_replies || 0;
      if (!unreadReplies) return acc;
      acc[thread.channel_id] = (acc[thread.channel_id] || 0) + unreadReplies;
      return acc;
    }, {});

    // A DM whose posts were all deleted still reports unread (Mattermost never
    // decrements total_msg_count on delete). Probe only those DMs — the count
    // is what makes the badge unclearable, so an empty channel must resolve to
    // zero here and in the list route alike.
    const candidatePhantomDmIds = filteredChannels
      .filter(
        (channel) =>
          isDirectLikeChannel(channel) &&
          !isChannelUnreadSuppressed(channel, memberByChannelId[channel.id]) &&
          channelUnreadMessageCount(channel, memberByChannelId[channel.id]) > 0
      )
      .map((channel) => channel.id);

    const phantomDmIds = await findPhantomUnreadDmChannelIds(token, candidatePhantomDmIds);

    const channelsWithCounts = filteredChannels.map((channel) => {
      const member = memberByChannelId[channel.id];

      // Zero out muted channels (hidden from the list, so their unreads would
      // mislead), never-viewed non-DM channels (skipped to prevent a historical
      // message flood) and DMs with nothing left to read. All three rules are
      // shared with the channel-list route via ./helpers so the two stay in
      // lockstep — see dmContributesToUnreadBadge.
      // `unread_eligible: false` tells the realtime updater not to grow the
      // badge for these on a websocket post, otherwise the badge could count a
      // channel the list route never shows (a phantom unread).
      // `unread_emptied` separates the one verdict that expires from the ones
      // that do not. Muting and never-viewed survive a new post; "every post
      // was deleted" stops being true the moment one arrives, so a client
      // holding this response must refetch rather than trust it — see
      // MattermostWebSocket.incrementUnreadCount.
      const emptied = phantomDmIds.has(channel.id);

      if (isChannelUnreadSuppressed(channel, member) || emptied) {
        return {
          channelId: channel.id,
          type: channel.type,
          mention_count: 0,
          message_count: 0,
          thread_unread: 0,
          unread_eligible: false,
          unread_emptied: emptied
        };
      }

      return {
        channelId: channel.id,
        type: channel.type,
        mention_count: member?.mention_count || 0,
        message_count: channelUnreadMessageCount(channel, member),
        thread_unread: threadUnreadByChannel[channel.id] || 0,
        unread_eligible: true
      };
    });

    // Per-channel effective unread: for DMs use message_count, for channels
    // use max(mentions, messages) + threads to avoid double-counting
    // (mentions are a subset of messages)
    const totalUnread = channelsWithCounts.reduce((sum, channel) => {
      if (channel.type === "D") {
        return sum + channel.message_count;
      }
      return sum + Math.max(channel.mention_count, channel.message_count) + channel.thread_unread;
    }, 0);

    const totalMentions = channelsWithCounts
      .filter((channel) => channel.type !== "D")
      .reduce((sum, channel) => sum + channel.mention_count, 0);

    const totalDMs = channelsWithCounts
      .filter((channel) => channel.type === "D")
      .reduce((sum, channel) => sum + channel.message_count, 0);

    const totalThreads = channelsWithCounts
      .filter((channel) => channel.type !== "D")
      .reduce((sum, channel) => sum + channel.thread_unread, 0);

    if (truncated) {
      // Only thread pagination can still hit a cap — channels and members are
      // streamed in full now.
      Sentry.withScope((scope) => {
        scope.setTag("context", "chat");
        scope.setLevel("warning");
        scope.setExtras({
          userId: currentUser?.id,
          channelCount: allChannels.length,
          memberCount: members.length,
          threadCount: threads.length,
          threadMaxPages,
          threadPageSize: THREAD_PAGE_SIZE
        });
        Sentry.captureMessage("Mattermost thread unreads truncated");
      });
    }

    return NextResponse.json({
      channels: channelsWithCounts,
      totalMentions,
      totalDMs,
      totalThreads,
      totalUnread,
      truncated
    });
  } catch (error) {
    return handleMattermostError(error);
  }
}
