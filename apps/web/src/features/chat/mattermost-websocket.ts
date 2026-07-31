import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { MattermostPost, MattermostPostsResponse } from "@/features/chat/mattermost-api";

declare global {
  interface Window {
    mmWebSocket?: MattermostWebSocket;
  }
}

/**
 * WebSocket client for Mattermost real-time messaging
 *
 * Authentication:
 * - First-party web app: Uses httpOnly cookie automatically (don't call withToken())
 * - Third-party apps: Call withToken(token) to pass token as query parameter
 *
 * Example usage:
 * ```typescript
 * // First-party (web app) - uses httpOnly cookie
 * const ws = new MattermostWebSocket()
 *   .withChannel(channelId)
 *   .withQueryClient(queryClient)
 *   .onConnectionChange(setIsActive)
 *   .onTyping(handleTyping);
 * await ws.connect();
 *
 * // Third-party app - uses token parameter
 * const ws = new MattermostWebSocket()
 *   .withChannel(channelId)
 *   .withToken(apiToken)
 *   .onTyping(handleTyping);
 * await ws.connect();
 * ```
 */

interface MattermostWSEvent {
  event: string;
  data: {
    channel_id?: string;
    user_id?: string;
    post?: any;
    post_id?: string;
    [key: string]: any;
  };
  broadcast: {
    channel_id?: string;
    user_id?: string;
    [key: string]: any;
  };
  seq?: number;
}

export type ConnectionStatus = "live" | "connected" | "paused" | "disconnected";

// Global instance tracker to prevent duplicate connections
let globalInstance: MattermostWebSocket | null = null;

export class MattermostWebSocket {
  private ws: WebSocket | null = null;
  private channelId: string | null = null;
  private token: string | null = null;
  private connectionState: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
  private queryClient: QueryClient | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity; // Never give up - keep trying with backoff
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private lastPongReceived = Date.now();
  private onConnectionChangeCallback: ((active: boolean) => void) | null = null;
  private onConnectionStatusCallback: ((status: ConnectionStatus) => void) | null = null;
  private onTypingCallback: ((userId: string) => void) | null = null;
  private onPostedCallback: ((post: any) => void) | null = null;
  private onReconnectingCallback: ((attempt: number, nextDelay: number) => void) | null = null;
  private typingThrottle = new Map<string, number>();
  private readonly TYPING_THROTTLE_MS = 3000;
  private isConnected = false;

  // Sequence number for WebSocket messages (required by Mattermost)
  private messageSeq = 1;

  // Idle management
  private lastActivityTime = Date.now();
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private currentStatus: ConnectionStatus = "disconnected";

  // Connection metrics for debugging
  private metrics = {
    connectionsOpened: 0,
    reconnects: 0,
    totalDisconnects: 0,
    firstConnectedAt: 0,
    lastConnectedAt: 0,
    lastDisconnectedAt: 0
  };

  // Prevent indefinite reconnects - give up after 1 hour
  private readonly MAX_DISCONNECT_DURATION = 60 * 60 * 1000; // 1 hour
  private firstDisconnectTime: number | null = null;

  // Event listeners for cleanup
  private visibilityChangeHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private networkChangeHandler: (() => void) | null = null;

  // Idle thresholds
  private readonly IDLE_WARNING_MS = 5 * 60 * 1000;      // 5 min - reduce ping frequency
  private readonly IDLE_DISCONNECT_MS = 15 * 60 * 1000;  // 15 min - disconnect and poll
  private readonly POLL_INTERVAL_MS = 60 * 1000;         // 1 min - polling when disconnected

  // Ping intervals
  private readonly PING_ACTIVE = 30 * 1000;      // 30s when active
  private readonly PING_IDLE = 120 * 1000;       // 2 min when idle but connected
  private readonly PING_BACKGROUND = 180 * 1000; // 3 min when tab hidden
  private readonly PONG_TIMEOUT = 10 * 1000;     // 10s to receive pong

  private currentPingInterval = this.PING_ACTIVE;

  // Exponential backoff for reconnections
  private getReconnectDelay(): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 60 seconds max
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), maxDelay);
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  // Constructor warns if multiple instances exist
  constructor() {
    if (globalInstance && globalInstance.isConnected) {
      console.warn("[WebSocket] Creating new instance while another is still connected. This may indicate a memory leak. Previous instance should be disconnected first.");
    }
    // Store reference for tracking (not enforcing singleton - channels can change)
    globalInstance = this;
  }

  // Clear global instance reference (called by disconnect)
  private clearInstanceIfCurrent(): void {
    if (globalInstance === this) { // Only clear if we're the current global instance
      globalInstance = null;
    }
  }

  // Builder pattern methods
  public withChannel(channelId: string): this {
    this.channelId = channelId;
    return this;
  }

  // Optional: for third-party apps that can't use cookies
  public withToken(token: string): this {
    this.token = token;
    return this;
  }

  public withQueryClient(client: QueryClient): this {
    this.queryClient = client;
    return this;
  }

  public onConnectionChange(callback: (active: boolean) => void): this {
    this.onConnectionChangeCallback = callback;
    return this;
  }

  public onConnectionStatus(callback: (status: ConnectionStatus) => void): this {
    this.onConnectionStatusCallback = callback;
    return this;
  }

  public onTyping(callback: (userId: string) => void): this {
    this.onTypingCallback = callback;
    return this;
  }

  public onPosted(callback: (post: any) => void): this {
    this.onPostedCallback = callback;
    return this;
  }

  public onReconnecting(callback: (attempt: number, nextDelay: number) => void): this {
    this.onReconnectingCallback = callback;
    return this;
  }

  // Get connection metrics for debugging
  public getMetrics() {
    return {
      ...this.metrics,
      currentState: this.connectionState,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      uptime: this.metrics.firstConnectedAt ? Date.now() - this.metrics.firstConnectedAt : 0
    };
  }

  // Connection management
  public async connect(): Promise<void> {
    if (this.isConnected || this.connectionState === "connecting") {
      return;
    }

    this.connectionState = "connecting";

    try {
      // If token is provided (third-party apps), use it in query param
      // Otherwise rely on httpOnly cookie sent automatically by browser (first-party app)
      const wsUrl = this.token
        ? `/api/mattermost/websocket?token=${this.token}`
        : `/api/mattermost/websocket`;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const fullUrl = `${protocol}//${window.location.host}${wsUrl}`;

      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.connectionState = "connected";
        this.reconnectAttempts = 0; // Reset on successful connection
        this.firstDisconnectTime = null; // Reset disconnect timer
        this.lastActivityTime = Date.now();
        this.lastPongReceived = Date.now();
        this.updateStatus("live");

        // Track metrics
        this.metrics.connectionsOpened++;
        if (this.metrics.firstConnectedAt === 0) {
          this.metrics.firstConnectedAt = Date.now();
        }
        this.metrics.lastConnectedAt = Date.now();

        this.onConnectionChangeCallback?.(true);

        // Start ping interval to keep connection alive
        this.startPingInterval();

        // Start idle management
        this.startIdleManagement();

        // Monitor page visibility for background optimization
        this.setupPageVisibilityListener();

        // Monitor network connectivity changes
        this.setupNetworkListeners();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: MattermostWSEvent = JSON.parse(event.data);

          // Handle pong responses
          // Mattermost responds with {status:"OK", data:{text:"pong"}} not {event:"pong"}
          if (message.event === "pong" || (message as any).data?.text === "pong") {
            this.handlePong();
            return;
          }

          this.handleMessage(message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.warn("WebSocket error:", error);
        this.connectionState = "error";
        // Don't increment reconnectAttempts here - will be handled in onclose
      };

      this.ws.onclose = (evt: CloseEvent) => {
        this.isConnected = false;
        this.connectionState = "disconnected";
        this.stopPingInterval();
        this.stopPongTimeout();

        // Track metrics
        this.metrics.totalDisconnects++;
        this.metrics.lastDisconnectedAt = Date.now();

        // Don't reconnect if this is an intentional disconnect (maxReconnectAttempts === 0)
        // This prevents reconnecting to old channels after component unmounts
        if (this.maxReconnectAttempts === 0) {
          console.warn("[WebSocket] Closed intentionally, not reconnecting");
          return;
        }

        // Track first disconnect time for max duration check
        if (this.firstDisconnectTime === null) {
          this.firstDisconnectTime = Date.now();
        }

        // Check if we've been disconnected too long (1 hour)
        const disconnectDuration = Date.now() - this.firstDisconnectTime;
        if (disconnectDuration > this.MAX_DISCONNECT_DURATION) {
          console.error(`[WebSocket] Disconnected for ${Math.round(disconnectDuration / 1000 / 60)} minutes. Giving up. Please refresh the page.`);
          this.onConnectionChangeCallback?.(false);
          return;
        }

        // Always attempt to reconnect (unless manually disconnected via disconnect())
        // Exponential backoff handles the delay
        this.reconnectAttempts++;
        this.metrics.reconnects++;
        const delay = this.getReconnectDelay();

        console.warn(`[WebSocket] Closed (code: ${evt.code}, clean: ${evt.wasClean}). Reconnecting in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts})...`);

        // Notify reconnecting callback with attempt number and delay
        this.onReconnectingCallback?.(this.reconnectAttempts, delay);

        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, delay);

        // Notify callback on first disconnect
        if (this.reconnectAttempts === 1) {
          this.onConnectionChangeCallback?.(false);
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      this.connectionState = "error";
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.onConnectionChangeCallback?.(false);
      }
    }
  }

  public disconnect(): void {
    // Mark as intentional disconnect to prevent auto-reconnect
    this.maxReconnectAttempts = 0;

    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Stop ping interval
    this.stopPingInterval();

    // Stop pong timeout
    this.stopPongTimeout();

    // Stop idle management
    this.stopIdleManagement();

    // Stop polling
    this.stopPolling();

    // Remove event listeners to prevent memory leaks
    this.removeEventListeners();

    // Clear typing throttle map to prevent memory leak
    this.typingThrottle.clear();

    // Close WebSocket
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.connectionState = "disconnected";
    this.updateStatus("disconnected");
    this.onConnectionChangeCallback?.(false);

    // Clear global instance reference if we're the current one
    this.clearInstanceIfCurrent();

    // Restore unlimited reconnects for future connections
    this.maxReconnectAttempts = Infinity;
  }

  // Clean up all event listeners
  private removeEventListeners(): void {
    if (typeof document !== "undefined" && this.visibilityChangeHandler) {
      document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }

    if (typeof window !== "undefined") {
      if (this.onlineHandler) {
        window.removeEventListener("online", this.onlineHandler);
        this.onlineHandler = null;
      }

      if (this.offlineHandler) {
        window.removeEventListener("offline", this.offlineHandler);
        this.offlineHandler = null;
      }
    }

    if (typeof navigator !== "undefined" && "connection" in navigator && this.networkChangeHandler) {
      const connection = (navigator as any).connection;
      if (connection && "removeEventListener" in connection) {
        connection.removeEventListener("change", this.networkChangeHandler);
        this.networkChangeHandler = null;
      }
    }
  }

  // Event handlers
  private handleMessage(message: MattermostWSEvent): void {
    switch (message.event) {
      case "hello":
        this.handleHello(message);
        break;
      case "posted":
        this.handlePosted(message);
        break;
      case "post_edited":
        this.handlePostEdited(message);
        break;
      case "post_deleted":
        this.handlePostDeleted(message);
        break;
      case "typing":
        this.handleTyping(message);
        break;
      case "reaction_added":
      case "reaction_removed":
        this.handleReaction(message);
        break;
      case "channel_viewed":
        this.handleChannelViewed(message);
        break;
      case "user_added":
      case "user_removed":
        this.handleUserChange(message);
        break;
      default:
        // Log unknown events for debugging
        // console.log("Unknown WebSocket event:", message.event);
        break;
    }
  }

  private handleHello(message: MattermostWSEvent): void {
    // WebSocket authenticated successfully
  }

  private handlePosted(message: MattermostWSEvent): void {
    const channelId = message.broadcast?.channel_id;
    if (!channelId || !this.queryClient) return;

    let parsedPost: MattermostPost | null = null;

    if (message.data?.post) {
      try {
        parsedPost = JSON.parse(message.data.post) as MattermostPost;
        if (this.onPostedCallback) {
          this.onPostedCallback(parsedPost);
        }
      } catch (error) {
        console.error("Failed to parse posted message", error);
      }
    }

    if (parsedPost) {
      this.upsertPostInCaches(channelId, parsedPost);
      this.updateChannelLastPost(channelId, parsedPost.create_at);
      this.incrementUnreadCount(channelId);
    } else {
      this.queryClient.invalidateQueries({
        queryKey: ["mattermost-posts-infinite", channelId]
      });
    }
  }

  private handlePostEdited(message: MattermostWSEvent): void {
    const channelId = message.broadcast?.channel_id;
    if (!channelId || !this.queryClient) return;

    if (message.data?.post) {
      try {
        const post = JSON.parse(message.data.post) as MattermostPost;
        this.updatePostInCaches(channelId, post.id, () => post);
      } catch (error) {
        console.error("Failed to parse edited message", error);
        this.queryClient.invalidateQueries({
          queryKey: ["mattermost-posts-infinite", channelId]
        });
      }
    } else {
      this.queryClient.invalidateQueries({
        queryKey: ["mattermost-posts-infinite", channelId]
      });
    }

    // Also invalidate pinned posts in case the edit was a pin/unpin action
    this.queryClient.invalidateQueries({
      queryKey: ["mattermost-pinned-posts", channelId]
    });
  }

  private handlePostDeleted(message: MattermostWSEvent): void {
    const channelId = message.broadcast?.channel_id;
    if (!channelId || !this.queryClient) return;

    const postId = message.data?.post_id;
    if (postId) {
      this.removePostFromCaches(channelId, postId);
    } else {
      this.queryClient.invalidateQueries({
        queryKey: ["mattermost-posts-infinite", channelId]
      });
    }

    // Also invalidate pinned posts in case a pinned message was deleted
    this.queryClient.invalidateQueries({
      queryKey: ["mattermost-pinned-posts", channelId]
    });
  }

  private handleTyping(message: MattermostWSEvent): void {
    const channelId = message.broadcast?.channel_id;
    const userId = message.data?.user_id;

    // Only forward typing events for the active channel
    if (channelId === this.channelId && userId && this.onTypingCallback) {
      this.onTypingCallback(userId);
    }
  }

  private handleReaction(message: MattermostWSEvent): void {
    const channelId = message.broadcast?.channel_id;
    if (!channelId || !this.queryClient) return;

    const postId = message.data?.post_id;
    const emojiName = message.data?.emoji_name;
    const userId = message.data?.user_id;
    if (!postId || !emojiName || !userId) {
      this.queryClient.invalidateQueries({
        queryKey: ["mattermost-posts-infinite", channelId]
      });
      return;
    }

    const isAdd = message.event === "reaction_added";
    this.updatePostInCaches(channelId, postId, (post) => {
      const reactions = post.metadata?.reactions ? [...post.metadata.reactions] : [];
      const existingIndex = reactions.findIndex(
        (reaction) => reaction.user_id === userId && reaction.emoji_name === emojiName
      );

      if (isAdd && existingIndex === -1) {
        reactions.push({ user_id: userId, post_id: postId, emoji_name: emojiName });
      } else if (!isAdd && existingIndex !== -1) {
        reactions.splice(existingIndex, 1);
      }

      return {
        ...post,
        metadata: {
          ...post.metadata,
          reactions
        }
      };
    });
  }

  private handleChannelViewed(message: MattermostWSEvent): void {
    const channelId = message.data?.channel_id;
    if (!channelId || !this.queryClient) return;

    this.resetUnreadCount(channelId);
  }

  private handleUserChange(message: MattermostWSEvent): void {
    const channelId = message.broadcast?.channel_id;
    if (!channelId || !this.queryClient) return;

    this.queryClient.invalidateQueries({
      queryKey: ["mattermost-posts-infinite", channelId]
    });

    this.queryClient.invalidateQueries({
      queryKey: ["mattermost-channels"]
    });
  }

  private upsertPostInCaches(channelId: string, post: MattermostPost): void {
    if (!this.queryClient) return;

    const updatePages = (data?: InfiniteData<MattermostPostsResponse>) => {
      if (!data || !data.pages.length) return data;
      const pages = [...data.pages];
      const firstPage = pages[0];
      const existingIndex = firstPage.posts.findIndex((item) => item.id === post.id);
      const nextPosts = [...firstPage.posts];

      if (existingIndex >= 0) {
        nextPosts[existingIndex] = post;
      } else {
        nextPosts.push(post);
        nextPosts.sort((a, b) => a.create_at - b.create_at);
      }

      pages[0] = { ...firstPage, posts: nextPosts };
      return { ...data, pages };
    };

    this.queryClient.setQueryData<InfiniteData<MattermostPostsResponse>>(
      ["mattermost-posts-infinite", channelId],
      updatePages
    );

    this.queryClient.setQueryData<MattermostPostsResponse>(
      ["mattermost-posts", channelId],
      (data) => {
        if (!data) return data;
        const existingIndex = data.posts.findIndex((item) => item.id === post.id);
        const nextPosts = [...data.posts];
        if (existingIndex >= 0) {
          nextPosts[existingIndex] = post;
        } else {
          nextPosts.push(post);
          nextPosts.sort((a, b) => a.create_at - b.create_at);
        }
        return { ...data, posts: nextPosts };
      }
    );
  }

  private updatePostInCaches(
    channelId: string,
    postId: string,
    updater: (post: MattermostPost) => MattermostPost
  ): void {
    if (!this.queryClient) return;

    this.queryClient.setQueryData<InfiniteData<MattermostPostsResponse>>(
      ["mattermost-posts-infinite", channelId],
      (data) => {
        if (!data) return data;
        let changed = false;
        const pages = data.pages.map((page) => {
          const index = page.posts.findIndex((post) => post.id === postId);
          if (index === -1) return page;
          const nextPosts = [...page.posts];
          nextPosts[index] = updater(nextPosts[index]);
          changed = true;
          return { ...page, posts: nextPosts };
        });
        return changed ? { ...data, pages } : data;
      }
    );

    this.queryClient.setQueryData<MattermostPostsResponse>(
      ["mattermost-posts", channelId],
      (data) => {
        if (!data) return data;
        const index = data.posts.findIndex((post) => post.id === postId);
        if (index === -1) return data;
        const nextPosts = [...data.posts];
        nextPosts[index] = updater(nextPosts[index]);
        return { ...data, posts: nextPosts };
      }
    );
  }

  private removePostFromCaches(channelId: string, postId: string): void {
    if (!this.queryClient) return;

    this.queryClient.setQueryData<InfiniteData<MattermostPostsResponse>>(
      ["mattermost-posts-infinite", channelId],
      (data) => {
        if (!data) return data;
        let changed = false;
        const pages = data.pages.map((page) => {
          const nextPosts = page.posts.filter((post) => post.id !== postId);
          if (nextPosts.length !== page.posts.length) {
            changed = true;
            return { ...page, posts: nextPosts };
          }
          return page;
        });
        return changed ? { ...data, pages } : data;
      }
    );

    this.queryClient.setQueryData<MattermostPostsResponse>(
      ["mattermost-posts", channelId],
      (data) => {
        if (!data) return data;
        const nextPosts = data.posts.filter((post) => post.id !== postId);
        if (nextPosts.length === data.posts.length) return data;
        return { ...data, posts: nextPosts };
      }
    );
  }

  private updateChannelLastPost(channelId: string, createdAt: number): void {
    if (!this.queryClient) return;
    this.queryClient.setQueriesData<{ channels: Array<{ id: string; last_post_at?: number }> }>(
      { queryKey: ["mattermost-channels"] },
      (data) => {
        if (!data?.channels) return data;
        let changed = false;
        const channels = data.channels.map((channel) => {
          if (channel.id !== channelId) return channel;
          if ((channel.last_post_at ?? 0) >= createdAt) return channel;
          changed = true;
          return { ...channel, last_post_at: createdAt };
        });
        return changed ? { ...data, channels } : data;
      }
    );
  }

  /**
   * A channel the unreads route reported as emptied (every post deleted) is
   * no longer empty once a post arrives, so its `unread_eligible: false` is
   * stale rather than structural. Patching the badge locally is not enough
   * either: the channel-list route hides such a DM, and a post event does not
   * invalidate that list — so the badge would grow with no row to open. Refetch
   * both and let the server re-derive.
   */
  private isEmptiedChannel(channelId: string): boolean {
    if (!this.queryClient) return false;

    return this.queryClient
      .getQueriesData<{
        channels?: Array<{ channelId: string; unread_emptied?: boolean }>;
      }>({ queryKey: ["mattermost-unread"] })
      .some(([, data]) =>
        data?.channels?.some(
          (channel) => channel.channelId === channelId && channel.unread_emptied === true
        )
      );
  }

  private incrementUnreadCount(channelId: string): void {
    if (!this.queryClient) return;
    if (channelId === this.channelId) return;

    if (this.isEmptiedChannel(channelId)) {
      this.queryClient.invalidateQueries({ queryKey: ["mattermost-unread"] });
      this.queryClient.invalidateQueries({ queryKey: ["mattermost-channels"] });
      return;
    }

    this.queryClient.setQueriesData<{
      channels: Array<{ channelId: string; type: string; mention_count: number; message_count: number; thread_unread?: number; unread_eligible?: boolean }>;
      totalMentions: number;
      totalDMs: number;
      totalThreads?: number;
      totalUnread: number;
      truncated?: boolean;
    }>({ queryKey: ["mattermost-unread"] }, (data) => {
      if (!data?.channels) return data;
      if (data.truncated) return data;

      const target = data.channels.find((channel) => channel.channelId === channelId);
      if (!target) return data;

      // Muted and never-viewed channels are deliberately kept out of the badge by
      // the unreads route (unread_eligible === false). Growing the badge here would
      // count a channel the list route never shows — a phantom unread. Skip them.
      // (undefined means an older cached response: treat as eligible, no regression.)
      // Emptied channels are handled above — that verdict expires, these do not.
      if (target.unread_eligible === false) return data;

      const isDm = target.type === "D";
      // Compute effective unread before and after to get the delta
      const oldEffective = isDm
        ? target.message_count
        : Math.max(target.mention_count, target.message_count) + (target.thread_unread ?? 0);
      const newMessageCount = target.message_count + 1;
      const newEffective = isDm
        ? newMessageCount
        : Math.max(target.mention_count, newMessageCount) + (target.thread_unread ?? 0);

      const channels = data.channels.map((channel) => {
        if (channel.channelId !== channelId) return channel;
        return { ...channel, message_count: newMessageCount };
      });

      return {
        ...data,
        channels,
        totalUnread: data.totalUnread + (newEffective - oldEffective),
        totalDMs: isDm ? data.totalDMs + 1 : data.totalDMs
      };
    });
  }

  private resetUnreadCount(channelId: string): void {
    if (!this.queryClient) return;

    this.queryClient.setQueriesData<{
      channels: Array<{ channelId: string; type: string; mention_count: number; message_count: number; thread_unread?: number }>;
      totalMentions: number;
      totalDMs: number;
      totalThreads?: number;
      totalUnread: number;
      truncated?: boolean;
    }>({ queryKey: ["mattermost-unread"] }, (data) => {
      if (!data?.channels) return data;
      if (data.truncated) return data;

      const target = data.channels.find((channel) => channel.channelId === channelId);
      if (!target) return data;

      const isDm = target.type === "D";
      // Compute effective unread being cleared using the same formula as the route
      const effectiveDelta = isDm
        ? target.message_count
        : Math.max(target.mention_count, target.message_count) + (target.thread_unread ?? 0);

      const channels = data.channels.map((channel) => {
        if (channel.channelId !== channelId) return channel;
        return { ...channel, mention_count: 0, message_count: 0, thread_unread: 0 };
      });

      return {
        ...data,
        channels,
        totalMentions: Math.max(0, data.totalMentions - target.mention_count),
        totalDMs: Math.max(0, data.totalDMs - (isDm ? target.message_count : 0)),
        totalThreads: Math.max(0, (data.totalThreads ?? 0) - (isDm ? 0 : (target.thread_unread ?? 0))),
        totalUnread: Math.max(0, data.totalUnread - effectiveDelta)
      };
    });
  }

  // Utility methods
  public sendTyping(channelId: string): void {
    if (!this.ws || this.connectionState !== "connected") {
      // If disconnected but polling, try to reconnect
      if (this.currentStatus === "paused") {
        this.resumeConnection();
      }
      return;
    }

    const lastSent = this.typingThrottle.get(channelId);
    const now = Date.now();

    if (lastSent && now - lastSent < this.TYPING_THROTTLE_MS) {
      return; // Throttle typing events
    }

    this.typingThrottle.set(channelId, now);

    // Clean up old entries from map to prevent memory leak
    // Keep entries less than 10 seconds old
    this.typingThrottle.forEach((timestamp, key) => {
      if (now - timestamp > 10000) {
        this.typingThrottle.delete(key);
      }
    });

    // Record activity
    this.recordActivity();

    const payload = {
      action: "user_typing",
      seq: this.messageSeq++,
      data: {
        channel_id: channelId,
        parent_id: ""
      }
    };

    try {
      this.ws.send(JSON.stringify(payload));
    } catch (error) {
      console.error("Failed to send typing event:", error);
    }
  }

  // Record user activity to reset idle timer
  private recordActivity(): void {
    this.lastActivityTime = Date.now();

    // If we were idle/paused, go back to live
    if (this.currentStatus !== "live" && this.isConnected) {
      this.updateStatus("live");
      this.adjustPingInterval(this.PING_ACTIVE);
    }
  }

  // Keep connection alive with periodic pings
  private startPingInterval(): void {
    this.stopPingInterval(); // Clear any existing interval
    this.pingInterval = setInterval(() => {
      if (this.ws && this.connectionState === "connected") {
        // Check if last pong was received recently
        // Threshold must exceed ping interval so the first check doesn't
        // fire before the first ping is even sent
        const timeSinceLastPong = Date.now() - this.lastPongReceived;
        if (timeSinceLastPong > this.currentPingInterval + this.PONG_TIMEOUT) {
          console.warn("No pong received for too long, reconnecting...");
          this.ws.close(1000, "Ping timeout");
          return;
        }

        try {
          this.ws.send(JSON.stringify({
            action: "ping",
            seq: this.messageSeq++
          }));

          // Start timeout for pong response
          this.startPongTimeout();
        } catch (error) {
          console.error("Failed to send ping:", error);
          // Try to reconnect on ping failure
          if (this.ws) {
            this.ws.close(1011, "Ping send failed");
          }
        }
      }
    }, this.currentPingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handlePong(): void {
    this.lastPongReceived = Date.now();
    this.stopPongTimeout();
  }

  private startPongTimeout(): void {
    this.stopPongTimeout();
    this.pongTimeout = setTimeout(() => {
      console.warn("Pong timeout - no response to ping");
      // Close connection to trigger reconnect
      if (this.ws) {
        this.ws.close(1000, "Pong timeout");
      }
    }, this.PONG_TIMEOUT);
  }

  private stopPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private adjustPingInterval(newInterval: number): void {
    if (this.currentPingInterval === newInterval) return;

    this.currentPingInterval = newInterval;
    if (this.isConnected) {
      this.startPingInterval(); // Restart with new interval
    }
  }

  // Idle management
  private startIdleManagement(): void {
    this.stopIdleManagement(); // Clear any existing interval
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleState();
    }, 30000); // Check every 30 seconds
  }

  private stopIdleManagement(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  private checkIdleState(): void {
    const now = Date.now();
    const idleTime = now - this.lastActivityTime;

    // Don't change state if tab is hidden (page visibility handles that)
    if (document.hidden) return;

    if (idleTime >= this.IDLE_DISCONNECT_MS) {
      // Idle for 15+ minutes - disconnect and start polling
      this.disconnectAndPoll();
    } else if (idleTime >= this.IDLE_WARNING_MS) {
      // Idle for 5+ minutes - reduce ping frequency but stay connected
      if (this.currentStatus === "live") {
        this.updateStatus("connected");
        this.adjustPingInterval(this.PING_IDLE);
      }
    }
  }

  private disconnectAndPoll(): void {
    if (this.currentStatus === "paused") return; // Already polling

    // Close WebSocket but don't trigger full disconnect
    this.stopPingInterval();
    this.stopIdleManagement();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.updateStatus("paused");
    this.onConnectionChangeCallback?.(false);

    // Start polling for new messages
    this.startPolling();
  }

  private startPolling(): void {
    this.stopPolling(); // Clear any existing polling

    this.pollInterval = setInterval(() => {
      // Invalidate queries to fetch new messages
      if (this.queryClient && this.channelId) {
        this.queryClient.invalidateQueries({
          queryKey: ["mattermost-posts-infinite", this.channelId]
        });
        this.queryClient.invalidateQueries({
          queryKey: ["mattermost-unread"]
        });
      }
    }, this.POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Resume real-time connection from paused state
  public resumeConnection(): void {
    if (this.currentStatus !== "paused") return;

    this.stopPolling();
    this.lastActivityTime = Date.now();
    this.connect(); // Reconnect WebSocket
  }

  // Page visibility handling
  private setupPageVisibilityListener(): void {
    if (typeof document === "undefined") return;
    if (this.visibilityChangeHandler) return; // Already set up

    this.visibilityChangeHandler = () => {
      if (document.hidden) {
        // Tab hidden - reduce ping frequency to save resources
        if (this.isConnected) {
          this.adjustPingInterval(this.PING_BACKGROUND);
        }
      } else {
        // Tab visible - check if we need to resume
        if (this.currentStatus === "paused") {
          // User returned to tab, resume connection
          this.resumeConnection();
        } else if (this.isConnected) {
          // Restore active ping interval
          const idleTime = Date.now() - this.lastActivityTime;
          if (idleTime < this.IDLE_WARNING_MS) {
            this.adjustPingInterval(this.PING_ACTIVE);
          } else {
            this.adjustPingInterval(this.PING_IDLE);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
  }

  private updateStatus(status: ConnectionStatus): void {
    if (this.currentStatus === status) return;

    this.currentStatus = status;
    this.onConnectionStatusCallback?.(status);
  }

  // Network connectivity monitoring
  private setupNetworkListeners(): void {
    if (typeof window === "undefined" || !("onLine" in navigator)) return;
    if (this.onlineHandler || this.offlineHandler) return; // Already set up

    this.onlineHandler = () => {
      console.log("Network connection restored, attempting to reconnect WebSocket...");
      // Reset reconnect attempts when network comes back
      this.reconnectAttempts = Math.max(0, this.reconnectAttempts - 2);
      // Try to reconnect immediately when network is back
      if (!this.isConnected && this.connectionState !== "connecting") {
        this.connect();
      }
    };

    this.offlineHandler = () => {
      console.log("Network connection lost");
      if (this.ws) {
        this.ws.close(1000, "Network offline");
      }
    };

    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);

    // Also monitor network changes via connection API
    if ("connection" in navigator) {
      const connection = (navigator as any).connection;
      if (connection && "addEventListener" in connection && !this.networkChangeHandler) {
        this.networkChangeHandler = () => {
          console.log("Network type changed:", connection.effectiveType);
          // On network type change, verify connection is still alive
          if (this.isConnected && this.ws) {
            // Send a ping to verify connection
            try {
              this.ws.send(JSON.stringify({
                action: "ping",
                seq: this.messageSeq++
              }));
            } catch {
              // If ping fails, close and reconnect
              this.ws.close(1000, "Network change verification failed");
            }
          }
        };
        connection.addEventListener("change", this.networkChangeHandler);
      }
    }
  }
}
