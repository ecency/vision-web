import { NextRequest, NextResponse } from "next/server";
import {
  ensureMattermostUser,
  ensureUserInChannel,
  ensureUserInTeam,
  followMattermostThreadForUser,
  getMattermostCommunityModerationContext,
  handleMattermostError,
  MattermostChannel,
  getMattermostTokenFromCookies,
  mmUserFetch,
  isUserChatBanned,
  CHAT_BAN_PROP
} from "@/server/mattermost";
import { checkDmFanout } from "@/server/chat-dm-fanout";

// Prevent artificial timeout - this route should be fast now
export const maxDuration = 60; // 60 seconds max
export const dynamic = "force-dynamic";

const USER_MENTION_REGEX =
  /@(?=[a-zA-Z][a-zA-Z0-9.-]{1,15}\b)[a-zA-Z][a-zA-Z0-9-]{2,}(?:\.[a-zA-Z][a-zA-Z0-9-]{2,})*\b/gi;

const SPECIAL_MENTIONS = new Set(["here", "everyone"]);
const SPECIAL_MENTION_REGEX = /(^|\s)@(here|everyone)\b/i;

interface MattermostUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  last_picture_update?: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { channelId } = await params;
    // Encode the channel id once for safe interpolation into upstream REST
    // paths. The raw `channelId` is still used for identity comparisons and
    // request-body fields below.
    const channelIdPath = encodeURIComponent(channelId);
    const searchParams = req.nextUrl.searchParams;
    const before = searchParams.get("before") || "";
    const around = searchParams.get("around") || "";
    const thread = searchParams.get("thread") || "";
    const includeOnline = searchParams.get("include_online") === "1";

    // Fetch a complete thread (root + every reply), independent of what is
    // currently loaded in the channel buffer. Used by the thread panel so it
    // can show the full conversation even when older messages have scrolled
    // out of the loaded window.
    if (thread) {
      const threadData = await mmUserFetch<{
        posts: Record<string, any>;
        order: string[];
      }>(`/posts/${encodeURIComponent(thread)}/thread`, token);

      // The thread endpoint authorizes via the token, not the channelId in the
      // URL, so verify the requested post actually belongs to this channel
      // before returning (mirrors the `around` branch's check below).
      const threadRoot = threadData.posts?.[thread];
      if (!threadRoot || threadRoot.channel_id !== channelId) {
        return NextResponse.json(
          { error: "Thread not found or deleted" },
          { status: 404 }
        );
      }

      const threadPosts = Object.values(threadData.posts ?? {})
        .filter(Boolean)
        .sort((a, b) => Number(a.create_at) - Number(b.create_at));

      const threadUserIds = Array.from(
        new Set(threadPosts.map((post) => post.user_id).filter(Boolean))
      );

      const threadUsers: Record<string, MattermostUser> = {};
      if (threadUserIds.length) {
        const fetchedUsers = await mmUserFetch<MattermostUser[]>("/users/ids", token, {
          method: "POST",
          body: JSON.stringify(threadUserIds)
        });
        for (const user of fetchedUsers) {
          threadUsers[user.id] = user;
        }
      }

      return NextResponse.json({ posts: threadPosts, users: threadUsers, hasMore: false });
    }

    // Reduced from 60 to 40 for better performance on invalidation
    // 40 messages = ~2 screens of chat, good balance between UX and data transfer
    const perPage = searchParams.get("per_page") || "40";

    // Auto-join users to public channels when accessing via deep link
    // This allows sharing channel/message links that work immediately
    if (around) {
      try {
        const channel = await mmUserFetch<MattermostChannel>(`/channels/${channelIdPath}`, token);

        // Only auto-join to public channels (type "O")
        if (channel.type === "O") {
          const currentUser = await mmUserFetch<{ id: string }>(`/users/me`, token);
          await ensureUserInTeam(currentUser.id);
          await ensureUserInChannel(currentUser.id, channelId);
        }
      } catch (error) {
        // Ignore auto-join errors - if it fails, the subsequent fetch will handle authorization
        console.error("Auto-join to channel failed:", error);
      }
    }

    let posts: Record<string, any>;
    let order: string[];
    let orderedPosts: any[];

    if (around) {
      // Fetch messages around a specific message (for deep linking)
      // 20 before + 20 after = 40 total, same as regular page size
      const [beforeData, afterData, targetPost] = await Promise.all([
        mmUserFetch<{ posts: Record<string, any>; order: string[] }>(
          `/channels/${channelIdPath}/posts?before=${encodeURIComponent(around)}&per_page=20`,
          token
        ).catch(() => ({ posts: {}, order: [] })),
        mmUserFetch<{ posts: Record<string, any>; order: string[] }>(
          `/channels/${channelIdPath}/posts?after=${encodeURIComponent(around)}&per_page=20`,
          token
        ).catch(() => ({ posts: {}, order: [] })),
        mmUserFetch<any>(`/posts/${encodeURIComponent(around)}`, token).catch(() => null)
      ]);

      // Verify target post exists and belongs to this channel
      if (!targetPost || targetPost.channel_id !== channelId) {
        return NextResponse.json(
          { error: "Message not found or deleted" },
          { status: 404 }
        );
      }

      // Merge posts: before + target + after
      posts = {
        ...beforeData.posts,
        [around]: targetPost,
        ...afterData.posts
      };

      order = [...beforeData.order, around, ...afterData.order];

      orderedPosts = order
        .map((id) => posts[id])
        .filter(Boolean)
        .sort((a, b) => Number(a.create_at) - Number(b.create_at));
    } else {
      // Existing logic for before/initial pagination
      let queryParams = `per_page=${encodeURIComponent(perPage)}&page=0`;
      if (before) {
        queryParams += `&before=${encodeURIComponent(before)}`;
      }

      const response = await mmUserFetch<{
        posts: Record<string, any>;
        order: string[];
      }>(`/channels/${channelIdPath}/posts?${queryParams}`, token);

      posts = response.posts;
      order = response.order;

      orderedPosts = order
        .map((id) => posts[id])
        .filter(Boolean)
        .sort((a, b) => Number(a.create_at) - Number(b.create_at));
    }

    let onlineUserIds: string[] = [];
    let users: Record<string, MattermostUser> = {};
    let statusPromise: Promise<void> | null = null;

    if (includeOnline) {
      // Fetch channel users first (paginated), then parallel fetch their statuses
      const channelUsers: MattermostUser[] = [];
      const perPage = 200;
      const maxPages = 5; // Safety cap to avoid oversized status payloads
      let page = 0;

      while (true) {
        if (page >= maxPages) {
          console.warn(
            `Online status fetch capped at ${maxPages * perPage} users for channel ${channelId}`
          );
          break;
        }

        const pageUsers = await mmUserFetch<MattermostUser[]>(
          `/users?in_channel=${channelIdPath}&per_page=${perPage}&page=${page}`,
          token
        );

        if (pageUsers.length === 0) {
          break;
        }

        channelUsers.push(...pageUsers);

        if (pageUsers.length < perPage) {
          break;
        }

        page += 1;
      }

      // Fetch status for channel members to determine who is online (parallel with other operations)
      statusPromise = mmUserFetch<{ user_id: string; status: string }[]>(
        `/users/status/ids`,
        token,
        {
          method: "POST",
          body: JSON.stringify(channelUsers.map((user) => user.id))
        }
      ).then((statuses) => {
        onlineUserIds = statuses
          .filter((status) => status.status && status.status !== "offline")
          .map((status) => status.user_id);
      }).catch((error) => {
        // If we cannot fetch statuses, continue without online information
        console.error("Failed to fetch channel member statuses:", error);
      });

      users = channelUsers.reduce<Record<string, MattermostUser>>(
        (acc, user) => {
          acc[user.id] = user;
          return acc;
        },
        {}
      );
    }

    const userIds = Array.from(
      new Set(orderedPosts.map((post) => post.user_id).filter(Boolean))
    );

    const missingUserIds = userIds.filter((id) => !users[id]);

    if (missingUserIds.length) {
      const missingUsers = await mmUserFetch<MattermostUser[]>(
        "/users/ids",
        token,
        {
          method: "POST",
          body: JSON.stringify(missingUserIds)
        }
      );

      for (const user of missingUsers) {
        users[user.id] = user;
      }
    }

    // Parallelize independent fetches for better performance
    const [member, moderation, statsResult] = await Promise.all([
      mmUserFetch<{
        channel_id: string;
        user_id: string;
        roles: string;
        last_viewed_at: number;
        mention_count: number;
        msg_count: number;
      }>(`/channels/${channelIdPath}/members/me`, token),
      getMattermostCommunityModerationContext(token, channelId),
      mmUserFetch<{ member_count: number }>(`/channels/${channelIdPath}/stats`, token)
        .catch((error) => {
          console.error("Failed to fetch channel stats:", error);
          return null;
        }),
      statusPromise ?? Promise.resolve()
    ]);

    const memberCount = statsResult?.member_count;

    // Check if there are more messages by looking at the order length
    // For "around" queries, set hasMore to true to allow infinite scroll to work
    const hasMore = around ? true : order.length >= parseInt(perPage, 10);

    return NextResponse.json({
      posts: orderedPosts,
      users,
      channel: moderation.channel,
      member,
      community: moderation.community,
      canModerate: moderation.canModerate,
      hasMore,
      memberCount,
      onlineUserIds: includeOnline ? onlineUserIds : undefined
    });
  } catch (error) {
    return handleMattermostError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { channelId } = await params;
    // Encode the channel id once for safe interpolation into upstream REST
    // paths. The raw `channelId` is still used for identity comparisons and
    // request-body fields below.
    const channelIdPath = encodeURIComponent(channelId);
    const body = await req.json();

    const message = body.message as string;
    const rootId = (body.rootId as string | null | undefined) || null;
    const props = (body.props as Record<string, unknown> | undefined) || undefined;

    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    // Fetch user and channel in parallel - they don't depend on each other
    const [currentUser, channel] = await Promise.all([
      mmUserFetch<{
        id: string;
        username: string;
        create_at?: number;
        props?: Record<string, string>;
      }>(`/users/me`, token),
      mmUserFetch<MattermostChannel>(`/channels/${channelIdPath}`, token)
    ]);

    const bannedUntil = isUserChatBanned(currentUser);
    if (bannedUntil) {
      return NextResponse.json(
        {
          error: `@${currentUser.username} is banned from chat until ${new Date(
            Number(bannedUntil)
          ).toISOString()}`,
          bannedUntil,
          prop: CHAT_BAN_PROP
        },
        { status: 403 }
      );
    }

    // DM privacy is enforced at channel creation time (/api/mattermost/direct)
    // No need to re-validate on every message send - improves performance significantly

    // --- Special mentions & regular @mentions in text ---
    const hasSpecialMention = SPECIAL_MENTION_REGEX.test(message);

    const mentionedUsers = Array.from(
      new Set(
        message
          .match(USER_MENTION_REGEX)
          ?.map((mention) => mention.slice(1).toLowerCase())
          .filter((username) => !SPECIAL_MENTIONS.has(username)) || []
      )
    );

    if (hasSpecialMention) {
      const moderation = await getMattermostCommunityModerationContext(
        token,
        channelId
      );

      if (!moderation.canModerate) {
        return NextResponse.json(
          {
            error: "Only community moderators can mention everyone in this channel."
          },
          { status: 403 }
        );
      }
    }

    // Cap how many distinct people one account can reach privately in a rolling
    // window. Mass-DM phishing is otherwise only contained after the fact, by
    // which point the spray has already been delivered. Public channels are not
    // counted: the abuse pattern, and the harm, is private and one-to-one.
    //
    // This sits as late as it can, immediately before the post: everything that
    // can reject the message has already run, so a rejected message never costs
    // a slot. There is deliberately no compensating release afterwards. A
    // release cannot tell its own reservation from one another in-flight
    // request is relying on, so pairing a doomed request with a real one would
    // delete the record of a message that did land, and repeating the pair
    // would defeat the cap entirely. The only remaining way to hold a slot
    // without delivering is an upstream post failure, which is rare, transient,
    // ages out with the window, and errs on the safe side.
    //
    // A group channel consumes one slot even though a post there reaches every
    // member. That is not a way around the cap: /api/mattermost/direct is the
    // only channel-creation path we expose and it is strictly one-to-one, so an
    // account cannot assemble groups to spray. Someone else has to have added
    // them to each group first.
    if (channel.type === "D" || channel.type === "G") {
      const fanout = await checkDmFanout({
        userId: currentUser.id,
        channelId,
        accountCreatedAt: currentUser.create_at
      });

      if (!fanout.allowed) {
        console.warn("MM posts: DM fan-out limit reached", {
          username: currentUser.username,
          recipients: fanout.recipients,
          limit: fanout.limit
        });
        return NextResponse.json(
          {
            error:
              "You have started conversations with too many people recently. Please try again later.",
            retryAfter: fanout.retryAfterSeconds
          },
          { status: 429, headers: { "Retry-After": String(fanout.retryAfterSeconds) } }
        );
      }
    }

    // Send the message - WebSocket will handle UI updates, HTTP is for persistence
    const post = await mmUserFetch(`/posts`, token, {
      method: "POST",
      body: JSON.stringify({
        channel_id: channelId,
        message,
        root_id: rootId || undefined,
        props: props || undefined,
        pending_post_id: body.pendingPostId || `${currentUser.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })
    });

    // --- Background tasks (non-blocking) ---

    // Ensure @mentioned users are members of the public channel (async)
    // Mattermost's native @mention system will handle notifications
    if (mentionedUsers.length) {
      mmUserFetch<MattermostChannel>(`/channels/${channelIdPath}`, token)
        .then((channel) => {
          if (channel.type === "O") {
            return Promise.all(
              mentionedUsers.map(async (username) => {
                try {
                  const user = await ensureMattermostUser(username);
                  await ensureUserInTeam(user.id);
                  await ensureUserInChannel(user.id, channel.id);
                } catch (error) {
                  console.error(
                    "Unable to ensure mentioned user in channel",
                    { username, error }
                  );
                }
              })
            );
          }
        })
        .catch((error) => {
          console.error("Unable to process mentioned users", error);
        });
    }

    // Follow thread for parent author only in public channels (async)
    if (rootId && props?.parent_id && channel.type === "O") {
      mmUserFetch<{ user_id: string }>(`/posts/${encodeURIComponent(String(props.parent_id))}`, token)
        .then((parentPost) => {
          if (parentPost.user_id !== currentUser.id) {
            return followMattermostThreadForUser(parentPost.user_id, rootId);
          }
        })
        .catch((error) => {
          console.error("Unable to follow thread for parent author", error);
        });
    }

    return NextResponse.json({ post });
  } catch (error) {
    return handleMattermostError(error);
  }
}
