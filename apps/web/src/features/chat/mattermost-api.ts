"use client";

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccessToken, getRefreshToken } from "@/utils";
import { useGlobalStore } from "@/core/global-store";
import { hsTokenRenew } from "@ecency/sdk";
import { chatApiFetch, chatPollInterval, type ChatPollQuery } from "./chat-api-guard";

/** Safely parse JSON from a fetch response, falling back to a readable error */
async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Response was HTML error page, plain text, or empty
    throw new Error(
      res.ok
        ? "Invalid response from chat server"
        : `Chat server error (${res.status})`
    );
  }
}

/**
 * Chat API responses are cast rather than parsed, so a shape change upstream
 * reaches the UI unchecked. A channel id that arrives as anything but a string
 * still satisfies a truthiness check and then interpolates into a template
 * literal, producing a request to `/chats/[object Object]`. Narrow it here so a
 * bad payload is caught at the boundary instead of becoming a broken URL.
 */
function asChannelId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  // Trim before the emptiness test: a whitespace-only id is still truthy and
  // would interpolate into a URL just as badly as a non-string one.
  const channelId = value.trim();
  return channelId.length > 0 ? channelId : null;
}

interface MattermostChannel {
  id: string;
  name: string;
  display_name: string;
  type: string;
  is_favorite?: boolean;
  is_muted?: boolean;
  directUser?: MattermostUser | null;
  mention_count?: number;
  message_count?: number;
  last_post_at?: number;
  last_viewed_at?: number;
}

interface MattermostChannelSummary {
  id: string;
  name: string;
  display_name: string;
  type: string;
}

/**
 * How long a live ban suppresses focus refetches for. Not "forever": a
 * moderator can lift a ban early, which only changes the answer server-side, so
 * an open page has to look again eventually or it stays dead until reload.
 */
const BANNED_RECHECK_MS = 5 * 60_000;

/**
 * A 403 from bootstrap is a decision, not a fault: it is returned for an
 * account whose chat ban is still live. Retrying it inside one fetch cycle
 * cannot change the answer.
 */
export function isBootstrapBanError(error: unknown) {
  return (error as { status?: number } | null)?.status === 403;
}

/**
 * An errored query is always stale, so without this every focus would re-run
 * the whole bootstrap (token verification plus a subscriptions fetch) for a
 * banned account. Two things still have to get through: the ban expiring, which
 * the response tells us the time of, and a moderator lifting it early, which it
 * cannot. So suppress refetches while the ban is known to be live, resume the
 * moment its expiry passes, and in the meantime look again occasionally.
 */
export function shouldRefetchBootstrapOnFocus(
  error: unknown,
  errorUpdatedAt: number,
  now = Date.now()
) {
  if (!isBootstrapBanError(error)) {
    return true;
  }

  const bannedUntil = (error as { bannedUntil?: number } | null)?.bannedUntil;
  if (typeof bannedUntil === "number" && now >= bannedUntil) {
    return true;
  }

  return now - errorUpdatedAt >= BANNED_RECHECK_MS;
}

// `error: Error` is load-bearing: React Query infers the query's TError from
// this predicate, and widening it to `unknown` propagates out to every consumer
// reading `error.message`.
export function shouldRetryBootstrap(failureCount: number, error: Error) {
  if (isBootstrapBanError(error)) {
    return false;
  }

  // Don't retry on auth errors after refresh attempt fails
  const errorMessage = (error as Error)?.message?.toLowerCase() || "";
  const isAuthError =
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("invalid token") ||
    errorMessage.includes("authentication required");

  if (isAuthError) {
    return false; // Don't retry auth errors
  }

  // Retry other errors (network, server issues) up to 3 times
  return failureCount < 3;
}

export function useMattermostBootstrap(community?: string) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const addUser = useGlobalStore((state) => state.addUser);
  const users = useGlobalStore((state) => state.users);

  return useQuery({
    queryKey: ["mattermost-bootstrap", username, community],
    enabled: Boolean(username),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Auto-retry when user returns to tab, throttled while a ban is live.
    refetchOnWindowFocus: (query) =>
      shouldRefetchBootstrapOnFocus(query.state.error, query.state.errorUpdatedAt),
    retry: shouldRetryBootstrap,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    queryFn: async () => {
      let accessToken = getAccessToken(username || "");
      let refreshToken = getRefreshToken(username || "");

      if (!accessToken && !refreshToken) {
        throw new Error("Authentication required");
      }

      // First attempt with existing tokens
      let res = await fetch("/api/mattermost/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          accessToken,
          refreshToken,
          displayName: username,
          community
        })
      });

      // If unauthorized and we have a refresh token, attempt token refresh
      if (res.status === 401 && refreshToken) {
        try {
          console.log("Chat token expired, attempting auto-refresh...");

          // Call HiveSigner to refresh tokens
          const refreshedTokens = await hsTokenRenew(refreshToken);

          // Update tokens in global store (saves to localStorage)
          const currentUser = users.find((u) => u.username === username);
          addUser({
            username: refreshedTokens.username,
            accessToken: refreshedTokens.access_token,
            refreshToken: refreshedTokens.refresh_token,
            expiresIn: refreshedTokens.expires_in,
            tokenObtainedAt: Date.now(),
            postingKey: currentUser?.postingKey,
            loginType: currentUser?.loginType
          });

          console.log("✓ Chat tokens refreshed successfully");

          // Retry bootstrap with refreshed tokens
          res = await fetch("/api/mattermost/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              accessToken: refreshedTokens.access_token,
              refreshToken: refreshedTokens.refresh_token,
              displayName: username,
              community
            })
          });
        } catch (refreshError) {
          console.error("Failed to refresh tokens:", refreshError);
          throw new Error("Authentication required - please log in again");
        }
      }

      if (!res.ok) {
        const data = await safeJson<{ error?: string; bannedUntil?: number }>(res);
        // bannedUntil rides along so the ban can expire without a reload.
        throw Object.assign(new Error(data?.error || "Unable to initialize chat"), {
          status: res.status,
          bannedUntil: data?.bannedUntil
        });
      }

      const bootstrap = (await safeJson(res)) as {
        ok: boolean;
        userId: string;
        channelId?: unknown;
      };
      // A non-string channel id is treated as absent: the caller already has a
      // branch that reports the channel could not be prepared, which is a far
      // better outcome than navigating somewhere that cannot exist.
      return {
        ...bootstrap,
        channelId: asChannelId(bootstrap.channelId)
      } as { ok: boolean; userId: string; channelId: string | null };
    }
  });
}

export function useMattermostChannels(enabled: boolean) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  return useQuery({
    queryKey: ["mattermost-channels", username],
    enabled: enabled && Boolean(username),
    staleTime: 120 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Invalidations re-run this; retrying more than once just piles requests
    // onto an unhealthy backend.
    retry: 1,
    queryFn: async () => {
      const res = await chatApiFetch("/api/mattermost/channels");
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to load channels");
      }
      return (await safeJson(res)) as { channels: MattermostChannel[] };
    }
  });
}

export function useMattermostFavoriteChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId, favorite }: { channelId: string; favorite: boolean }) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to update favorite");
      }

      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["mattermost-channels"],
        exact: false
      });
    }
  });
}

export function useMattermostMuteChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId, mute }: { channelId: string; mute: boolean }) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/mute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mute })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to update mute state");
      }

      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async () => {
      // Refresh both caches: the channel list (mute state hides/shows the row)
      // and the unread summary. The summary carries `unread_eligible`, which the
      // realtime updater trusts; a mute toggle changes it, so the cached flag
      // must be refetched or the badge would keep using the stale value until the
      // periodic refetch (missing an unread after unmute, or over-counting after
      // mute).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mattermost-channels"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-unread"], exact: false })
      ]);
    }
  });
}

export function useMattermostLeaveChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/leave`, {
        method: "POST"
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(data?.error || `Unable to leave channel (${res.status})`);
      }

      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async () => {
      // Invalidate all mattermost-channels queries (matches ["mattermost-channels", username])
      await queryClient.invalidateQueries({
        queryKey: ["mattermost-channels"],
        exact: false
      });
    }
  });
}

export function useMattermostJoinChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/join`, { method: "POST" });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to join channel");
      }

      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async (_data, channelId) => {
      // Mark channel as viewed immediately after joining to prevent historical
      // messages from inflating unread counts (mobile parity)
      try {
        const viewRes = await fetch(`/api/mattermost/channels/${channelId}/view`, { method: "POST" });
        if (!viewRes.ok) {
          console.warn(`Failed to mark joined channel ${channelId} as viewed (${viewRes.status})`);
        }
      } catch {
        // Non-critical - unread badge will correct on next poll
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mattermost-channels"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-unread"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false })
      ]);
    }
  });
}

export function useMattermostUserSearch(term: string, enabled: boolean) {
  const query = term.trim();

  return useQuery({
    queryKey: ["mattermost-user-search", query],
    enabled: enabled && query.length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/mattermost/users/search?q=${encodeURIComponent(query)}`);

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to search users");
      }

      return (await safeJson(res)) as { users: MattermostUser[] };
    }
  });
}

export function useMattermostChannelSearch(term: string, enabled: boolean) {
  const query = term.trim();

  return useQuery({
    queryKey: ["mattermost-channel-search", query],
    enabled: enabled && query.length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/mattermost/channels/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: query })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to search channels");
      }

      return (await safeJson(res)) as { channels: MattermostChannelSummary[] };
    }
  });
}

export function useMattermostMessageSearch(term: string, enabled: boolean) {
  const query = term.trim();

  return useQuery({
    queryKey: ["mattermost-message-search", query],
    enabled: enabled && query.length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/mattermost/search/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: query })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to search messages");
      }

      return (await safeJson(res)) as MattermostPostSearchResponse;
    }
  });
}

export function useMattermostUnread(enabled: boolean) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  return useQuery({
    queryKey: ["mattermost-unread", username],
    enabled: enabled && Boolean(username),
    // Mounted in the navbar on every page: back off while the endpoint is
    // failing so open tabs don't keep a struggling backend under load.
    refetchInterval: (query) => chatPollInterval(60000, query),
    refetchOnWindowFocus: false,
    staleTime: 60000,
    // No retry: the next poll cycle is the retry.
    retry: false,
    queryFn: async () => {
      const res = await chatApiFetch("/api/mattermost/channels/unreads");

      if (res.status === 401) {
        return {
          channels: [],
          totalMentions: 0,
          totalDMs: 0,
          totalThreads: 0,
          totalUnread: 0,
          truncated: false
        } satisfies MattermostUnreadSummary;
      }

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to load unread counts");
      }

      return (await safeJson(res)) as MattermostUnreadSummary;
    }
  });
}

export function useMattermostMarkChannelViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/view`, { method: "POST" });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to mark channel as read");
      }

      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async (_data, channelId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mattermost-unread"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-channels"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false })
      ]);
    }
  });
}

export interface MattermostUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  last_picture_update?: number;
}

export interface MattermostPostsResponse {
  posts: MattermostPost[];
  users: Record<string, MattermostUser>;
  channel?: MattermostChannelSummary;
  member?: {
    user_id?: string;
    last_viewed_at?: number;
    mention_count?: number;
    msg_count?: number;
  };
  community?: string | null;
  canModerate?: boolean;
  hasMore?: boolean;
  memberCount?: number;
  onlineUserIds?: string[];
}

export interface MattermostReaction {
  user_id: string;
  post_id: string;
  emoji_name: string;
  create_at?: number;
}

export interface MattermostUnreadChannel {
  channelId: string;
  type: string;
  mention_count: number;
  message_count: number;
  thread_unread: number;
  // Whether the channel may contribute to the unread badge. The unreads route
  // sets this to false for muted and never-viewed channels (which it keeps out
  // of the badge); the realtime updater must not grow the badge for them.
  // Optional so cached responses from an older route are treated as eligible.
  unread_eligible?: boolean;
}

export interface MattermostUnreadSummary {
  channels: MattermostUnreadChannel[];
  totalMentions: number;
  totalDMs: number;
  totalThreads: number;
  totalUnread: number;
  truncated?: boolean;
}

export interface MattermostPostSearchResponse {
  posts: MattermostPost[];
}

export function useMattermostPosts(
  channelId: string | undefined,
  options?: { includeOnline?: boolean }
) {
  return useQuery({
    queryKey: ["mattermost-posts", channelId],
    enabled: Boolean(channelId),
    queryFn: async () => {
      const includeOnline = options?.includeOnline ? "include_online=1" : "";
      const url = includeOnline
        ? `/api/mattermost/channels/${channelId}/posts?${includeOnline}`
        : `/api/mattermost/channels/${channelId}/posts`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to load messages");
      }

      return (await safeJson(res)) as MattermostPostsResponse;
    }
  });
}

export function useMattermostPostsInfinite(
  channelId: string | undefined,
  options?: { refetchInterval?: number | false; includeOnline?: boolean }
) {
  return useInfiniteQuery({
    queryKey: ["mattermost-posts-infinite", channelId],
    enabled: Boolean(channelId),
    // Polling fallback when the websocket is down: back off while failing.
    refetchInterval: (query: ChatPollQuery) => {
      const base = options?.refetchInterval;
      return base ? chatPollInterval(base, query) : false;
    },
    queryFn: async ({ pageParam }) => {
      const includeOnlineQuery = options?.includeOnline ? "include_online=1" : "";
      const url = pageParam
        ? `/api/mattermost/channels/${channelId}/posts?before=${pageParam}${includeOnlineQuery ? `&${includeOnlineQuery}` : ""}`
        : `/api/mattermost/channels/${channelId}/posts${includeOnlineQuery ? `?${includeOnlineQuery}` : ""}`;

      const res = await chatApiFetch(url);
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to load messages");
      }

      return (await safeJson(res)) as MattermostPostsResponse;
    },
    getNextPageParam: (lastPage) => {
      // Return the oldest post ID if there are more messages
      if (lastPage.hasMore && lastPage.posts.length > 0) {
        return lastPage.posts[0].id;
      }
      return undefined;
    },
    initialPageParam: undefined as string | undefined
  });
}

export function useMattermostPostsAround(
  channelId: string | undefined,
  postId: string | undefined,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["mattermost-posts-around", channelId, postId],
    enabled: enabled && Boolean(channelId) && Boolean(postId),
    staleTime: 60000, // Cache for 1 minute
    retry: 1,
    queryFn: async () => {
      const res = await fetch(
        `/api/mattermost/channels/${channelId}/posts?around=${postId}`
      );

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(data?.error || "Unable to load messages");
      }

      return (await safeJson(res)) as MattermostPostsResponse;
    }
  });
}

export function useMattermostThread(
  channelId: string | undefined,
  rootId: string | undefined,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["mattermost-thread", channelId, rootId],
    enabled: enabled && Boolean(channelId) && Boolean(rootId),
    staleTime: 30000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(
        `/api/mattermost/channels/${channelId}/posts?thread=${rootId}`
      );

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(data?.error || "Unable to load thread");
      }

      return (await safeJson(res)) as MattermostPostsResponse;
    }
  });
}

export function useMattermostDeletePost(channelId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/posts/${postId}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to delete message");
      }

      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false })
      ]);
    }
  });
}

export function useMattermostSendMessage(channelId: string | undefined, options?: { skipInvalidation?: boolean }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
        message,
        rootId,
        props,
        pendingPostId,
        signal
      }: {
        message: string;
        rootId?: string | null;
        props?: MattermostPostProps;
        pendingPostId?: string;
        signal?: AbortSignal;
      }) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, rootId, props, pendingPostId }),
        signal
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(data?.error || `Unable to send message (${res.status})`);
      }

      return (await safeJson(res)) as { post: MattermostPost };
    },
    onSuccess: () => {
      // Skip invalidation when WebSocket is active - it handles updates via "posted" event
      // This prevents redundant fetches and improves performance
      if (!options?.skipInvalidation) {
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false });
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false });
      }
    }
  });
}

export function useMattermostDirectChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (username: string) => {
      const res = await fetch(`/api/mattermost/direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to start direct message");
      }

      const direct = (await safeJson(res)) as { channelId?: unknown };
      const channelId = asChannelId(direct.channelId);
      if (!channelId) {
        throw new Error("Unable to start direct message");
      }
      return { channelId };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mattermost-channels"], exact: false });
    }
  });
}

export interface MattermostPostProps {
  username?: string;
  override_username?: string;
  addedUserId?: string;
  addedUsername?: string;
  from_webhook?: boolean;
  parent_id?: string;
  parent_username?: string;
  parent_message?: string;
  [key: string]: any;
}

export interface MattermostPost {
  id: string;
  user_id: string;
  // Mattermost returns this on every post. Channel-scoped fetches already know
  // the channel so they ignore it, but message search spans channels and needs
  // it to attribute each result.
  channel_id: string;
  message: string;
  create_at: number;
  edit_at?: number;
  type?: string;
  root_id?: string | null;
  pending_post_id?: string;
  is_pinned?: boolean;
  metadata?: {
    reactions?: MattermostReaction[];
  };
  props?: MattermostPostProps;
}

export function useMattermostReactToPost(channelId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      emoji,
      add
    }: {
      postId: string;
      emoji: string;
      add: boolean;
    }) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/posts/${postId}/reactions`, {
        method: add ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to update reaction");
      }

      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false })
      ]);
    }
  });
}

export function useMattermostUpdatePost(channelId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, message }: { postId: string; message: string }) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to update message");
      }

      return (await safeJson(res)) as { post: MattermostPost };
    },
    onSuccess: () => {
      // Don't await - WebSocket handles real-time updates, this is just a fallback
      // Prevents mutation from staying in pending state while queries invalidate
      queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false });
      queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false });
    }
  });
}

export function useMattermostPinnedPosts(channelId: string | undefined) {
  return useQuery({
    queryKey: ["mattermost-pinned-posts", channelId],
    enabled: Boolean(channelId),
    staleTime: 30000, // 30 seconds
    queryFn: async () => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/pinned`);
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to load pinned messages");
      }
      return (await safeJson(res)) as { posts: MattermostPost[]; users: Record<string, MattermostUser> };
    }
  });
}

export function useMattermostPinPost(channelId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/posts/${postId}/pin`, {
        method: "POST"
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to pin message");
      }
      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mattermost-pinned-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false })
      ]);
    }
  });
}

export function useMattermostUnpinPost(channelId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/mattermost/channels/${channelId}/posts/${postId}/pin`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Unable to unpin message");
      }
      return (await safeJson(res)) as { ok: boolean };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mattermost-pinned-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts", channelId], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId], exact: false })
      ]);
    }
  });
}

export type DmPrivacyLevel = "all" | "followers" | "none";

export function useDmPrivacyQuery() {
  const { activeUser } = useActiveAccount();

  return useQuery({
    queryKey: ["mattermost", "dm-privacy"],
    enabled: Boolean(activeUser),
    queryFn: async () => {
      const res = await fetch("/api/mattermost/me/dm-privacy");
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Failed to fetch DM privacy");
      }
      const data = await safeJson<{ privacy: DmPrivacyLevel }>(res);
      return data.privacy;
    },
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
}

export function useUpdateDmPrivacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (privacy: DmPrivacyLevel) => {
      const res = await fetch("/api/mattermost/me/dm-privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy })
      });

      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error || "Failed to update DM privacy");
      }

      return await safeJson<{ ok: boolean }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mattermost", "dm-privacy"], exact: false });
    }
  });
}
