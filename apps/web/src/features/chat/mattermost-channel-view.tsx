"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  useMattermostPostsInfinite,
  useMattermostSendMessage,
  MattermostPost,
  MattermostUser,
  useMattermostDirectChannel,
  useMattermostChannels,
  useMattermostUserSearch,
  useMattermostMarkChannelViewed,
  useMattermostUpdatePost,
  useMattermostPostsAround,
  useMattermostThread,
  useMattermostJoinChannel
} from "./mattermost-api";
import { usePendingPosts } from "./hooks/use-pending-posts";
import { BAN_NOTICE_TICK_MS, ChatBanInfo, getChatBanInfo } from "./chat-ban-notice";
import { useDmWarning } from "./hooks/use-dm-warning";
import { useDeepLinking } from "./hooks/use-deep-linking";
import { useChannelWebSocket } from "./hooks/use-channel-websocket";
import { usePostActions } from "./hooks/use-post-actions";
import { useMessageRendering } from "./hooks/use-message-rendering";
import { useChannelMetadata } from "./hooks/use-channel-metadata";
import { KeyboardShortcutsModal } from "./components/keyboard-shortcuts-modal";
import { ChannelHeader } from "./components/channel-header";
import {
  ensureEmojiDataReady,
  searchEmojis,
  normalizeMessageEmojis,
  decodeMessageEmojis,
  EMOJI_TRIGGER_REGEX,
  type EmojiSuggestion
} from "./emoji-utils";
import { saveDraft, loadDraft, clearDraft } from "./draft-utils";
import { ThreadPanel } from "./components/thread-panel";
import { mergeThreadPosts } from "./components/thread-merge";
import { MessageInput } from "./components/message-input";
import { type PostItem } from "./components/message-list";
import { VirtualizedMessageList } from "./components/virtualized-message-list";
import type { VirtuosoHandle } from "react-virtuoso";
import { DmWarningBanner } from "./components/dm-warning-banner";
import { setProxyBase } from "@ecency/render-helper";
import { Button } from "@ui/button";
import { Modal, ModalBody } from "@ui/modal";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useQueryClient } from "@tanstack/react-query";
import defaults from "@/defaults";
import { useRouter, useSearchParams } from "next/navigation";

const CHANNEL_WIDE_MENTIONS = [
  {
    key: "here",
    label: "@here",
    description: "Notify everyone in this channel unless they have it muted."
  },
  {
    key: "everyone",
    label: "@everyone",
    description: "Notify all channel members unless they muted the channel."
  }
] as const;

setProxyBase(defaults.imageServer);

interface Props {
  channelId: string;
}

export function MattermostChannelView({ channelId }: Props) {
  // --- State that must be declared early (used by data-fetching hooks) ---
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isWebSocketActive, setIsWebSocketActive] = useState(true);
  const [reconnectAttempt, setReconnectAttempt] = useState<number | null>(null);
  const [reconnectDelay, setReconnectDelay] = useState<number | null>(null);
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);

  const searchParams = useSearchParams();
  const shareText = searchParams?.get("text")?.trim();
  const focusedPostId = searchParams?.get("post");
  const [needsAroundFetch, setNeedsAroundFetch] = useState(false);
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [message, setMessage] = useState("");
  const hasAppliedSharedText = useRef(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [emojiStart, setEmojiStart] = useState<number | null>(null);
  const [emojiSuggestions, setEmojiSuggestions] = useState<EmojiSuggestion[]>([]);
  const [isEmojiSearchLoading, setIsEmojiSearchLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MattermostPost | null>(null);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<MattermostPost | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  // Held separately from messageError so the notice PERSISTS while the ban is live.
  // messageError is cleared on every new send attempt; a ban is a standing state, not a
  // one-off failure, so clearing it there would hide the explanation after one keystroke.
  const [banInfo, setBanInfo] = useState<ChatBanInfo | null>(null);
  // Drives the countdown re-render; see the ticking effect below.
  const [banNow, setBanNow] = useState(() => Date.now());
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const { activeUser } = useActiveAccount();
  const { data: channels } = useMattermostChannels(Boolean(channelId));
  const directChannelMutation = useMattermostDirectChannel();
  const joinChannelMutation = useMattermostJoinChannel();
  const router = useRouter();
  const markViewedMutation = useMattermostMarkChannelViewed();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const lastViewUpdateRef = useRef(0);
  const [optimisticLastViewedAt, setOptimisticLastViewedAt] = useState<number | null>(null);
  const hasAutoScrolledRef = useRef(false);
  const updateMutation = useMattermostUpdatePost(channelId);
  const [expandedJoinGroups, setExpandedJoinGroups] = useState<Set<string>>(new Set());
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadCountBelowScroll, setUnreadCountBelowScroll] = useState(0);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const queryClient = useQueryClient();

  // Tick while a ban is live: refreshes the countdown and clears the notice once it lapses, so a
  // 48h timeout doesn't look permanent to someone who left the tab open.
  //
  // A single setTimeout(remaining) is WRONG here and fails in the worst direction: setTimeout
  // takes a 32-bit signed delay, so anything past ~24.8 days overflows and fires almost
  // immediately. A 3-year ban would clear its own notice within a millisecond — the notice would
  // vanish for exactly the users who are most banned. A bounded interval avoids the cliff
  // entirely and keeps the relative time fresh instead of freezing at first render.
  useEffect(() => {
    if (!banInfo) return;
    if (Date.now() >= banInfo.bannedUntil) {
      setBanInfo(null);
      return;
    }
    const id = setInterval(() => {
      const t = Date.now();
      if (t >= banInfo.bannedUntil) {
        setBanInfo(null);
      } else {
        setBanNow(t);
      }
    }, BAN_NOTICE_TICK_MS);
    return () => clearInterval(id);
  }, [banInfo]);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const gifButtonRef = useRef<HTMLButtonElement | null>(null);
  const gifPickerRef = useRef<HTMLDivElement | null>(null);

  type GifPickerStyle = {
    width: string;
    bottom: string;
    left: string | number;
    marginLeft: string;
    borderTopLeftRadius: string;
    borderTopRightRadius: string;
    borderBottomLeftRadius: string;
  };

  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifPickerStyle, setGifPickerStyle] = useState<GifPickerStyle | null>(null);

  // --- Data fetching (uses isWebSocketActive and showOnlineUsers state) ---

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useMattermostPostsInfinite(channelId, {
    refetchInterval: (!isWebSocketActive || !isNearBottom) ? 60000 : false,
    includeOnline: showOnlineUsers
  });

  const aroundQuery = useMattermostPostsAround(
    channelId,
    focusedPostId ?? undefined,
    needsAroundFetch
  );

  const sendMutation = useMattermostSendMessage(channelId, { skipInvalidation: isWebSocketActive });
  const isSubmitting = sendMutation.isPending || updateMutation.isPending;

  const {
    lastSentPendingIdRef,
    lastSentMessageRef,
    lastSentRootIdRef,
    lastSentAtRef,
    confirmedPendingPostIdsRef,
    pendingAbortControllerRef,
    sendMutationRef
  } = usePendingPosts(sendMutation);

  // --- Stable helpers (no hook dependencies) ---

  const normalizeUsername = useCallback((username?: string | null) => {
    if (!username) return username ?? undefined;
    if (username.toLowerCase() === "ecency.") return "ecency";
    return username;
  }, []);

  // --- Derived data ---

  const posts = useMemo(() => {
    const infinitePosts = data?.pages?.flatMap(page => page.posts) || [];
    const aroundPosts = aroundQuery.data?.posts || [];

    const postsMap = new Map<string, MattermostPost>();
    [...infinitePosts, ...aroundPosts].forEach(post => {
      postsMap.set(post.id, post);
    });

    return Array.from(postsMap.values())
      .sort((a, b) => Number(a.create_at) - Number(b.create_at));
  }, [data?.pages, aroundQuery.data]);

  const groupedPosts = useMemo<PostItem[]>(() => {
    const result: PostItem[] = [];
    let currentJoinGroup: MattermostPost[] = [];
    let currentJoinIndices: number[] = [];
    const MESSAGE_GROUP_TIME_WINDOW = 5 * 60 * 1000;

    posts.forEach((post, index) => {
      if (post.type === "system_add_to_channel") {
        currentJoinGroup.push(post);
        currentJoinIndices.push(index);
      } else {
        if (currentJoinGroup.length >= 2) {
          result.push({
            type: 'join-group',
            posts: currentJoinGroup,
            indices: currentJoinIndices,
            groupId: currentJoinGroup[0].id
          });
        } else if (currentJoinGroup.length === 1) {
          result.push({ type: 'message', post: currentJoinGroup[0], index: currentJoinIndices[0], isGroupStart: true });
        }
        currentJoinGroup = [];
        currentJoinIndices = [];

        const lastItem = result[result.length - 1];
        let isGroupStart = true;

        if (
          lastItem &&
          lastItem.type === 'message' &&
          lastItem.post.user_id === post.user_id &&
          lastItem.post.type !== "system_add_to_channel" &&
          post.type !== "system_add_to_channel" &&
          !post.root_id &&
          !lastItem.post.root_id &&
          (post.create_at - lastItem.post.create_at) < MESSAGE_GROUP_TIME_WINDOW
        ) {
          isGroupStart = false;
        }

        result.push({ type: 'message', post, index, isGroupStart });
      }
    });

    if (currentJoinGroup.length >= 2) {
      result.push({
        type: 'join-group',
        posts: currentJoinGroup,
        indices: currentJoinIndices,
        groupId: currentJoinGroup[0].id
      });
    } else if (currentJoinGroup.length === 1) {
      result.push({ type: 'message', post: currentJoinGroup[0], index: currentJoinIndices[0], isGroupStart: true });
    }

    return result;
  }, [posts]);

  // Full thread (root + every reply), fetched from the server so the thread
  // panel shows the whole conversation even when older messages have scrolled
  // out of the channel's loaded window.
  const { data: threadData } = useMattermostThread(
    channelId,
    threadRootId ?? undefined,
    Boolean(threadRootId)
  );

  const usersById = useMemo(() => {
    const acc: Record<string, MattermostUser> = {};
    const fold = (users: Record<string, MattermostUser> | undefined) => {
      if (!users) return;
      Object.entries(users).forEach(([id, user]) => {
        acc[id] = {
          ...user,
          username: normalizeUsername(user.username) ?? user.username
        };
      });
    };
    data?.pages?.forEach((page) => fold(page.users));
    // Authors of thread-only posts may not appear in the channel buffer.
    fold(threadData?.users);
    return acc;
  }, [data?.pages, threadData?.users, normalizeUsername]);

  const channelData = useMemo(() => data?.pages?.[0], [data?.pages]);

  const postsById = useMemo(() => {
    return posts.reduce<Map<string, MattermostPost>>((acc, post) => {
      acc.set(post.id, post);
      return acc;
    }, new Map());
  }, [posts]);

  const threadRootPost = useMemo(() => {
    if (!threadRootId) return null;
    return (
      postsById.get(threadRootId) ??
      (threadData?.posts ?? []).find((post) => post.id === threadRootId) ??
      null
    );
  }, [postsById, threadRootId, threadData?.posts]);

  const parentPostById = useMemo(() => {
    const parents = new Map<string, MattermostPost>();
    const threads = posts.reduce<Map<string, MattermostPost[]>>((acc, post) => {
      const rootId = post.root_id || post.id;
      const thread = acc.get(rootId) ?? [];
      thread.push(post);
      acc.set(rootId, thread);
      return acc;
    }, new Map());

    threads.forEach((threadPosts) => {
      const ordered = [...threadPosts].sort((a, b) => a.create_at - b.create_at);
      ordered.forEach((post, index) => {
        const parent = ordered[index - 1];
        if (parent) {
          parents.set(post.id, parent);
        }
      });
    });

    return parents;
  }, [posts]);

  const threadPosts = useMemo(() => {
    if (!threadRootId) return [];
    return mergeThreadPosts(threadRootId, threadData?.posts, posts);
  }, [posts, threadRootId, threadData?.posts]);

  const usersByUsername = useMemo(() => {
    return Object.values(usersById).reduce<Record<string, MattermostUser>>((acc, user) => {
      if (user.username) {
        acc[user.username.toLowerCase()] = user;
      }
      return acc;
    }, {});
  }, [usersById]);

  const isPublicChannel = channelData?.channel?.type === "O";

  // --- Extracted hooks ---

  const startDirectMessage = useCallback(
    (username: string) => {
      directChannelMutation.mutate(username, {
        onSuccess: (result) => {
          router.push(`/chats/${result.channelId}`);
        }
      });
    },
    [directChannelMutation, router]
  );

  const {
    getDisplayName,
    getUsername,
    getDecodedDisplayMessage,
    renderMessageContent
  } = useMessageRendering({
    usersById,
    usersByUsername,
    activeUsername: activeUser?.username,
    startDirectMessage,
    normalizeUsername
  });

  const {
    typingUsernames,
    sendTypingDebounced
  } = useChannelWebSocket({
    channelId,
    queryClient,
    getCurrentUserId: useCallback(() => channelData?.member?.user_id, [channelData?.member?.user_id]),
    onPostedConfirm: useCallback(() => {
      setMessage("");
      setUploadedImages([]);
      clearDraft(channelId);
      setMentionQuery("");
      setMentionStart(null);
      setEmojiQuery("");
      setEmojiStart(null);
      setReplyingTo(null);
      setMessageError(null);
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    }, [channelId]),
    pendingPostRefs: {
      lastSentPendingIdRef,
      lastSentMessageRef,
      lastSentRootIdRef,
      lastSentAtRef,
      confirmedPendingPostIdsRef,
      pendingAbortControllerRef,
      sendMutationRef
    },
    usersById,
    isWebSocketActive,
    setIsWebSocketActive,
    setReconnectAttempt,
    setReconnectDelay
  });

  const {
    deletingPostId,
    moderationError,
    openReactionPostId,
    setOpenReactionPostId,
    showPinnedModal,
    setShowPinnedModal,
    deleteMutation,
    reactMutation,
    pinnedPostsQuery,
    pinPostMutation,
    unpinPostMutation,
    canPin,
    handleDelete,
    toggleReaction,
    handlePinToggle: handlePinToggleRaw
  } = usePostActions({ channelId, channelData });

  const handlePinToggle = useCallback((postId: string, isPinned: boolean) => {
    const errorMsg = handlePinToggleRaw(postId, isPinned);
    if (errorMsg) {
      setMessageError(errorMsg);
    }
  }, [handlePinToggleRaw]);

  const {
    channelTitle,
    channelSubtitle,
    onlineUsers,
    onlineCount
  } = useChannelMetadata({
    channelId,
    channelData,
    usersById,
    activeUsername: activeUser?.username,
    channels,
    showOnlineUsers,
    setShowOnlineUsers
  });

  // --- Channel read tracking ---

  const effectiveLastViewedAt = optimisticLastViewedAt ?? channelData?.member?.last_viewed_at ?? 0;

  const firstUnreadIndex = useMemo(() => {
    if (!posts.length) return -1;
    return posts.findIndex((post) => post.create_at > effectiveLastViewedAt);
  }, [effectiveLastViewedAt, posts]);

  const showUnreadDivider = firstUnreadIndex !== -1;

  const initialScrollIndex = useMemo(() => {
    if (firstUnreadIndex === -1) return undefined;
    const targetPostIndex = Math.max(0, firstUnreadIndex - 1);
    const targetPostId = posts[targetPostIndex]?.id;
    if (!targetPostId) return undefined;
    const groupedIdx = groupedPosts.findIndex((item) =>
      item.type === "message" ? item.post.id === targetPostId :
      item.type === "join-group" ? item.posts.some((p) => p.id === targetPostId) :
      false
    );
    return groupedIdx !== -1 ? groupedIdx : undefined;
  }, [firstUnreadIndex, posts, groupedPosts]);

  const markChannelRead = useCallback(() => {
    const id = channelData?.channel?.id || channelId;
    if (!id) return;

    const now = Date.now();
    if (now - lastViewUpdateRef.current < 4000) return;

    lastViewUpdateRef.current = now;
    setOptimisticLastViewedAt(now);
    markViewedMutation.mutate(id, {
      onError: () => {
        setOptimisticLastViewedAt(channelData?.member?.last_viewed_at ?? null);
      }
    });
  }, [channelId, channelData?.channel?.id, channelData?.member?.last_viewed_at, markViewedMutation]);

  // --- Mention/emoji state ---

  const normalizedMentionQuery = mentionQuery.trim().toLowerCase();

  const channelWideMentionOptions = useMemo(
    () =>
      CHANNEL_WIDE_MENTIONS.filter((mention) =>
        mention.key.startsWith(normalizedMentionQuery)
      ),
    [normalizedMentionQuery]
  );

  const isChannelWideMentionQuery = useMemo(
    () => CHANNEL_WIDE_MENTIONS.some((mention) => mention.key.startsWith(normalizedMentionQuery)),
    [normalizedMentionQuery]
  );

  const mentionSearch = useMattermostUserSearch(
    mentionQuery,
    Boolean(isPublicChannel && mentionQuery.length >= 2)
  );

  // --- Effects ---

  useEffect(() => {
    if (!showOnlineUsers) return;
    queryClient.invalidateQueries({ queryKey: ["mattermost-posts-infinite", channelId] });
  }, [showOnlineUsers, channelId, queryClient]);

  useEffect(() => {
    if (!showGifPicker) return;

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (gifPickerRef.current?.contains(targetNode)) return;
      if (gifButtonRef.current?.contains(targetNode as Node)) return;
      setShowGifPicker(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showGifPicker]);

  useEffect(() => {
    if (hasAppliedSharedText.current) return;
    if (!shareText) return;
    setMessage((current) => current || shareText);
    hasAppliedSharedText.current = true;
  }, [shareText]);

  // Channel change reset
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    lastViewUpdateRef.current = 0;
    setOptimisticLastViewedAt(null);
    hasAutoScrolledRef.current = false;
    setThreadRootId(null);
    setReplyingTo(null);
    setEditingPost(null);
    hasAppliedSharedText.current = false;

    const draft = loadDraft(channelId);
    if (shareText) {
      setMessage(shareText);
      hasAppliedSharedText.current = true;
    } else if (draft) {
      setMessage(draft);
      hasAppliedSharedText.current = true;
    } else {
      setMessage("");
    }

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, [channelId, shareText]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingPost) {
          setEditingPost(null);
          setMessage("");
          clearDraft(channelId);
          e.preventDefault();
        } else if (replyingTo) {
          setReplyingTo(null);
          e.preventDefault();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        const searchInput = document.querySelector<HTMLInputElement>('[type="search"]');
        if (searchInput) {
          searchInput.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingPost, replyingTo, channelId]);

  useEffect(() => {
    if (data) {
      markChannelRead();
    }
  }, [data, markChannelRead]);

  useEffect(() => {
    ensureEmojiDataReady();
  }, []);

  // --- Scroll ---

  const scrollToPost = useCallback(
    (postId: string, options?: { highlight?: boolean; behavior?: ScrollBehavior }) => {
      const idx = groupedPosts.findIndex((item) =>
        item.type === "message" ? item.post.id === postId :
        item.type === "join-group" ? item.posts.some((p) => p.id === postId) :
        false
      );
      if (idx === -1) return;

      const behavior = options?.behavior === "auto" ? "auto" : "smooth";
      virtuosoRef.current?.scrollToIndex({
        index: idx,
        align: "center",
        behavior: behavior as "auto" | "smooth"
      });

      if (options?.highlight ?? true) {
        setTimeout(() => {
          const target = document.querySelector<HTMLDivElement>(
            `[data-post-id="${postId}"]`
          );
          if (target) {
            target.classList.remove("chat-post-highlight");
            void target.offsetWidth;
            target.classList.add("chat-post-highlight");
          }
        }, 100);
      }
    },
    [groupedPosts]
  );

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      behavior: "smooth"
    });
    setTimeout(() => {
      markChannelRead();
    }, 500);
  }, [markChannelRead]);

  const onStartReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const onAtBottomStateChange = useCallback((atBottom: boolean) => {
    setIsNearBottom(atBottom);
    setShowScrollToBottom(!atBottom);
    if (atBottom) {
      setUnreadCountBelowScroll(0);
      markChannelRead();
    } else if (firstUnreadIndex !== -1) {
      const unreadCount = posts.filter(
        (post) => post.create_at > effectiveLastViewedAt
      ).length;
      setUnreadCountBelowScroll(unreadCount);
    }
  }, [markChannelRead, firstUnreadIndex, posts, effectiveLastViewedAt]);

  // Deep linking
  useDeepLinking({
    channelId,
    focusedPostId: focusedPostId ?? null,
    data,
    isLoading,
    aroundQuery,
    scrollToPost,
    setNeedsAroundFetch,
    setShowJoinPrompt
  });

  // Detect main query membership errors → show join prompt instead of raw error.
  // Server returns 401 "unauthorized" when the user isn't a channel member, so
  // checking only 404 / "no channel member" leaks "unauthorized" into the UI.
  useEffect(() => {
    if (!error || isLoading) return;
    const msg = ((error as Error)?.message ?? '').toLowerCase();
    const isMembershipError =
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('404') ||
      msg.includes('no channel member');
    if (isMembershipError) {
      setShowJoinPrompt(true);
    }
  }, [error, isLoading]);

  useEffect(() => {
    if (posts.length && !hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
    }
  }, [posts.length]);

  // --- DM warning ---

  const { showDmWarning, handleDismissDmWarning } = useDmWarning({
    channelId,
    channelData,
    posts,
    hasNextPage: hasNextPage ?? false,
    sendMutationSuccess: sendMutation.isSuccess
  });

  // --- Textarea auto-resize ---

  const autoResize = useCallback(() => {
    const el = messageInputRef.current;
    if (!el) return;

    el.style.height = "0px";
    const scroll = el.scrollHeight;
    const maxHeight = 200;

    el.style.height = Math.min(scroll, maxHeight) + "px";
    el.style.overflowY = scroll > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    autoResize();
  }, [message, autoResize]);

  // --- Input handlers ---

  const updateMentionState = useCallback(
    (value: string, cursor: number) => {
      if (!isPublicChannel) {
        setMentionQuery("");
        setMentionStart(null);
        return;
      }

      const textUntilCursor = value.slice(0, cursor);
      const mentionMatch = textUntilCursor.match(/@([a-zA-Z][a-zA-Z0-9.-]{1,15})$/i);

      if (mentionMatch) {
        setMentionQuery(mentionMatch[1]);
        setMentionStart(textUntilCursor.lastIndexOf("@"));
      } else {
        setMentionQuery("");
        setMentionStart(null);
      }
    },
    [isPublicChannel]
  );

  const updateEmojiState = useCallback((value: string, cursor: number) => {
    const textUntilCursor = value.slice(0, cursor);
    const emojiMatch = textUntilCursor.match(EMOJI_TRIGGER_REGEX);

    if (emojiMatch) {
      setEmojiQuery(emojiMatch[1]);
      setEmojiStart(textUntilCursor.lastIndexOf(":"));
    } else {
      setEmojiQuery("");
      setEmojiStart(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (!emojiQuery) {
      setEmojiSuggestions([]);
      setIsEmojiSearchLoading(false);
      return () => { active = false; };
    }

    setIsEmojiSearchLoading(true);

    searchEmojis(emojiQuery, 15)
      .then((suggestions) => {
        if (!active) return;
        setEmojiSuggestions(suggestions.slice(0, 8));
      })
      .catch(() => {
        if (active) setEmojiSuggestions([]);
      })
      .finally(() => {
        if (active) setIsEmojiSearchLoading(false);
      });

    return () => { active = false; };
  }, [emojiQuery]);

  const handleMessageChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(() => {
      saveDraft(channelId, value);
    }, 500);

    const cursor = e.target.selectionStart ?? value.length;
    updateMentionState(value, cursor);
    updateEmojiState(value, cursor);

    if (value.length > 0) {
      sendTypingDebounced();
    }

    autoResize();
  };

  const handleImageUploadBegin = useCallback(() => {
    setIsUploadingImage(true);
  }, []);

  const handleImageUpload = useCallback((url: string) => {
    setUploadedImages((prev) => [...prev, url]);
    setIsUploadingImage(false);
  }, []);

  const removeImage = useCallback((index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Submit ---

  const submitMessage = () => {
    if (isSubmitting) return;

    const trimmedMessage = normalizeMessageEmojis(message.trim());
    const hasImages = uploadedImages.length > 0;

    if (!trimmedMessage && !hasImages) return;

    let finalMessage = trimmedMessage;
    if (hasImages) {
      const imageUrls = uploadedImages.join('\n');
      finalMessage = trimmedMessage ? `${trimmedMessage}\n${imageUrls}` : imageUrls;
    }

    setMessageError(null);

    if (editingPost) {
      updateMutation.mutate(
        { postId: editingPost.id, message: finalMessage },
        {
          onError: (err) => {
            setMessageError((err as Error)?.message || "Unable to update message");
          },
          onSuccess: () => {
            setMessage("");
            setUploadedImages([]);
            clearDraft(channelId);
            setMentionQuery("");
            setMentionStart(null);
            setEmojiQuery("");
            setEmojiStart(null);
            setEditingPost(null);
            requestAnimationFrame(() => {
              virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
              messageInputRef.current?.focus();
            });
            markChannelRead();
          }
        }
      );
      return;
    }

    const rootId = replyingTo?.root_id || replyingTo?.id || null;
    const parentProps = replyingTo
      ? {
          parent_id: replyingTo.id,
          parent_username: getUsername(replyingTo),
          parent_message: replyingTo.message
        }
      : undefined;
    const params = new URLSearchParams(searchParams?.toString());
    params.delete("text");
    const nextUrl = params.size ? `/chats/${channelId}?${params.toString()}` : `/chats/${channelId}`;

    const pendingPostId = `${channelData?.member?.user_id || 'user'}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    lastSentPendingIdRef.current = pendingPostId;
    lastSentMessageRef.current = finalMessage;
    lastSentRootIdRef.current = rootId;
    lastSentAtRef.current = Date.now();
    pendingAbortControllerRef.current = new AbortController();

    sendMutation.mutate(
      { message: finalMessage, rootId, props: parentProps, pendingPostId, signal: pendingAbortControllerRef.current.signal },
      {
        onError: (err, variables) => {
          if (pendingAbortControllerRef.current) {
            pendingAbortControllerRef.current = null;
          }
          const pendingId = variables?.pendingPostId;
          if (pendingId && confirmedPendingPostIdsRef.current.has(pendingId)) {
            confirmedPendingPostIdsRef.current.delete(pendingId);
            sendMutationRef.current.reset();
            return;
          }
          if ((err as Error)?.name === "AbortError") {
            return;
          }
          const ban = getChatBanInfo(err);
          if (ban) {
            // The server's `error` names the account and quotes an ISO timestamp: operator copy,
            // not something to show the banned user. The notice is rendered from ban info instead.
            setBanInfo(ban);
            setBanNow(Date.now());
            setMessageError(null);
          } else {
            setMessageError((err as Error)?.message || "Unable to send message");
          }
          lastSentPendingIdRef.current = null;
        },
        onSuccess: (_data, variables) => {
          if (pendingAbortControllerRef.current) {
            pendingAbortControllerRef.current = null;
          }
          const pendingId = variables?.pendingPostId;
          if (!isWebSocketActive || (pendingId && lastSentPendingIdRef.current === pendingId)) {
            setMessage("");
            setUploadedImages([]);
            clearDraft(channelId);
            setMentionQuery("");
            setMentionStart(null);
            setEmojiQuery("");
            setEmojiStart(null);
            setReplyingTo(null);
            lastSentPendingIdRef.current = null;
            lastSentMessageRef.current = null;
            lastSentRootIdRef.current = null;
            lastSentAtRef.current = 0;
            confirmedPendingPostIdsRef.current.delete(pendingId ?? "");
            requestAnimationFrame(() => {
              messageInputRef.current?.focus();
            });
          }
          router.replace(nextUrl);
          markChannelRead();
        }
      }
    );
  };

  // --- Emoji/mention apply ---

  const applyEmoji = (shortcode: string) => {
    const textarea = messageInputRef.current;

    setMessage((prev) => {
      if (emojiStart === null) return prev;

      const before = prev.slice(0, emojiStart);
      const afterStart = emojiStart + (emojiQuery?.length || 0) + 1;
      const after = prev.slice(afterStart);
      const insertion = `:${shortcode}:`;
      const spacer =
        after.startsWith(" ") || after.startsWith("\n") || after === "" ? "" : " ";
      const next = `${before}${insertion}${spacer}${after}`;
      const nextCursor = before.length + insertion.length + spacer.length;

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(nextCursor, nextCursor);
        }
      });

      updateMentionState(next, nextCursor);
      updateEmojiState(next, nextCursor);

      return next;
    });

    setEmojiQuery("");
    setEmojiStart(null);
  };

  const applyMention = (username: string) => {
    setMessage((prev) => {
      if (mentionStart === null) return prev;
      const before = prev.slice(0, mentionStart);
      const afterStart = mentionStart + (mentionQuery?.length || 0) + 1;
      const after = prev.slice(afterStart);
      const spacer =
        after.startsWith(" ") || after.startsWith("\n") || after === "" ? "" : " ";
      return `${before}@${username}${spacer}${after}`;
    });
    setMentionQuery("");
    setMentionStart(null);
    setEmojiQuery("");
    setEmojiStart(null);
  };

  // --- Thread/reply/edit handlers ---

  const openThread = useCallback(
    (post: MattermostPost) => {
      const rootId = post.root_id || post.id;
      setThreadRootId(rootId);
      requestAnimationFrame(() =>
        scrollToPost(rootId, { highlight: false, behavior: "auto" })
      );
    },
    [scrollToPost]
  );

  const handleReply = useCallback((post: MattermostPost) => {
    setEditingPost(null);
    setReplyingTo(post);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, []);

  const handleEdit = useCallback(
    (post: MattermostPost) => {
      setReplyingTo(null);
      setEditingPost(post);
      setMessageError(null);
      const decodedMessage = decodeMessageEmojis(post.message);
      setMessage(decodedMessage);
      const cursor = decodedMessage.length;
      updateMentionState(decodedMessage, cursor);
      updateEmojiState(decodedMessage, cursor);

      requestAnimationFrame(() => {
        const textarea = messageInputRef.current;
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(cursor, cursor);
        }
      });
    },
    [updateEmojiState, updateMentionState]
  );

  // --- Render ---

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-0 md:pb-0 min-h-0">
        <ChannelHeader
          channelTitle={channelTitle}
          channelSubtitle={channelSubtitle}
          effectiveLastViewedAt={effectiveLastViewedAt}
          pinnedPosts={pinnedPostsQuery.data?.posts}
          onlineUsers={onlineUsers}
          onlineCount={onlineCount}
          showOnlineUsers={showOnlineUsers}
          setShowOnlineUsers={setShowOnlineUsers}
          showPinnedModal={showPinnedModal}
          setShowPinnedModal={setShowPinnedModal}
          canPin={canPin}
          handlePinToggle={handlePinToggle}
          unpinPending={unpinPostMutation.isPending}
          scrollToPost={scrollToPost}
          usersById={usersById}
          getDecodedDisplayMessage={getDecodedDisplayMessage}
          showKeyboardShortcuts={showKeyboardShortcuts}
          setShowKeyboardShortcuts={setShowKeyboardShortcuts}
          onClose={() => router.push("/chats")}
        />

        {showDmWarning && (
          <DmWarningBanner onDismiss={handleDismissDmWarning} settingsHref={activeUser?.username ? `/@${activeUser.username}/settings` : undefined} />
        )}

        {reconnectAttempt !== null && reconnectAttempt > 2 && (
          <div className="mt-1 text-center text-[11px] text-[--text-muted]">
            Reconnecting…
          </div>
        )}

        <div className="flex flex-1 min-h-0 flex-col">
          <div className="relative flex-1 min-h-0 overflow-hidden pb-[72px] md:pb-0 md:min-h-[340px]">
            {isLoading && <div className="p-4 text-sm text-[--text-muted]">Loading messages…</div>}
            {error && !showJoinPrompt && <div className="p-4 text-sm text-red-500">{(error as Error).message || "Failed to load"}</div>}
            {moderationError && <div className="p-4 text-sm text-red-500">{moderationError}</div>}
            {!isLoading && !posts.length && !showJoinPrompt && (
              <div className="p-4 text-sm text-[--text-muted]">No messages yet. Say hello!</div>
            )}
            {showJoinPrompt && (
              <div className="flex flex-col items-center justify-center p-8 gap-4">
                <p className="text-[--text-muted]">You need to join this channel to view messages</p>
                <Button onClick={() => { joinChannelMutation.mutate(channelId, { onSuccess: () => { setShowJoinPrompt(false); setNeedsAroundFetch(true); } }); }} isLoading={joinChannelMutation.isPending}>Join Channel</Button>
              </div>
            )}
            {aroundQuery.isLoading && (
              <div className="flex items-center justify-center p-8 gap-2">
                <div className="animate-spin rounded-full size-5 border-b-2 border-blue-500" />
                <span className="text-[--text-muted]">Loading message...</span>
              </div>
            )}
            {aroundQuery.isError && (
              <div className="p-4 text-center text-red-500">{(aroundQuery.error as Error)?.message || "Unable to load message"}</div>
            )}
            {!showJoinPrompt && !isLoading && posts.length > 0 && (
              <VirtualizedMessageList
                groupedPosts={groupedPosts}
                showUnreadDivider={showUnreadDivider}
                firstUnreadIndex={firstUnreadIndex}
                expandedJoinGroups={expandedJoinGroups}
                setExpandedJoinGroups={setExpandedJoinGroups}
                channelId={channelId}
                usersById={usersById}
                channelData={channelData}
                activeUser={activeUser ?? undefined}
                postsById={postsById}
                parentPostById={parentPostById}
                getDisplayName={getDisplayName}
                getUsername={getUsername}
                getDecodedDisplayMessage={getDecodedDisplayMessage}
                renderMessageContent={renderMessageContent}
                normalizeUsername={normalizeUsername}
                startDirectMessage={startDirectMessage}
                openThread={openThread}
                handleReply={handleReply}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                handlePinToggle={handlePinToggle}
                toggleReaction={toggleReaction}
                openReactionPostId={openReactionPostId}
                setOpenReactionPostId={setOpenReactionPostId}
                deletingPostId={deletingPostId}
                reactMutationPending={reactMutation.isPending}
                deleteMutationPending={deleteMutation.isPending}
                canPin={canPin}
                pinMutationPending={pinPostMutation.isPending || unpinPostMutation.isPending}
                onStartReached={onStartReached}
                onAtBottomStateChange={onAtBottomStateChange}
                isFetchingNextPage={isFetchingNextPage ?? false}
                virtuosoRef={virtuosoRef}
                initialScrollIndex={initialScrollIndex}
              />
            )}

            {showScrollToBottom && (
              <div className="absolute bottom-4 right-4 z-20">
                <button type="button" onClick={scrollToBottom} className="flex items-center gap-2 rounded-full border border-[--border-color] bg-[--surface-color] px-4 py-2.5 text-sm font-semibold text-[--text-color] shadow-lg shadow-[rgba(0,0,0,0.12)] transition-all hover:bg-[--hover-color] hover:shadow-xl active:scale-95 dark:border-transparent dark:bg-blue-500 dark:text-white dark:hover:bg-blue-600" aria-label="Scroll to bottom">
                  <span className="text-[--text-color] dark:!text-white">↓</span>
                  {unreadCountBelowScroll > 0 ? (
                    <span className="text-[--text-color] dark:!text-white">{unreadCountBelowScroll} new</span>
                  ) : (
                    <span className="sr-only">Jump to latest</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {threadRootId && (
            <Modal show={true} onHide={() => setThreadRootId(null)} centered>
              <ModalBody className="!p-0">
                <div className="max-h-[80vh] overflow-y-auto rounded-t-xl bg-[--surface-color]">
                  <ThreadPanel
                    threadRootId={threadRootId}
                    threadRootPost={threadRootPost}
                    threadPosts={threadPosts}
                    usersById={usersById}
                    getDisplayName={getDisplayName}
                    getUsername={getUsername}
                    renderMessageContent={renderMessageContent}
                    getDecodedDisplayMessage={getDecodedDisplayMessage}
                    scrollToPost={scrollToPost}
                    onClose={() => setThreadRootId(null)}
                  />
                </div>
              </ModalBody>
            </Modal>
          )}
        </div>
      </div>

      <MessageInput
        message={message}
        setMessage={setMessage}
        messageError={messageError}
        setMessageError={setMessageError}
        banInfo={banInfo}
        banNow={banNow}
        editingPost={editingPost}
        setEditingPost={setEditingPost}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        uploadedImages={uploadedImages}
        removeImage={removeImage}
        handleImageUploadBegin={handleImageUploadBegin}
        handleImageUpload={handleImageUpload}
        isUploadingImage={isUploadingImage}
        emojiQuery={emojiQuery}
        setEmojiQuery={setEmojiQuery}
        emojiSuggestions={emojiSuggestions}
        isEmojiSearchLoading={isEmojiSearchLoading}
        emojiStart={emojiStart}
        setEmojiStart={setEmojiStart}
        applyEmoji={applyEmoji}
        mentionQuery={mentionQuery}
        setMentionQuery={setMentionQuery}
        mentionStart={mentionStart}
        setMentionStart={setMentionStart}
        mentionSearch={mentionSearch}
        applyMention={applyMention}
        channelWideMentionOptions={channelWideMentionOptions}
        isChannelWideMentionQuery={isChannelWideMentionQuery}
        isPublicChannel={isPublicChannel}
        channelData={channelData}
        handleMessageChange={handleMessageChange}
        isSubmitting={isSubmitting}
        submitMessage={submitMessage}
        handleEdit={handleEdit}
        messageInputRef={messageInputRef}
        emojiButtonRef={emojiButtonRef}
        gifButtonRef={gifButtonRef}
        gifPickerRef={gifPickerRef}
        showGifPicker={showGifPicker}
        setShowGifPicker={setShowGifPicker}
        gifPickerStyle={gifPickerStyle}
        setGifPickerStyle={setGifPickerStyle}
        getDisplayName={getDisplayName}
        getDecodedDisplayMessage={getDecodedDisplayMessage}
        renderMessageContent={renderMessageContent}
        posts={posts}
        typingUsernames={typingUsernames}
      />

      <KeyboardShortcutsModal show={showKeyboardShortcuts} onHide={() => setShowKeyboardShortcuts(false)} />

      <style>{`
        @keyframes chat-post-highlight {
          0% { background-color: rgba(59, 130, 246, 0.18); }
          50% { background-color: rgba(59, 130, 246, 0.12); }
          100% { background-color: transparent; }
        }
        [data-post-id].chat-post-highlight {
          animation: chat-post-highlight 1.2s ease-in-out;
          border-radius: 12px;
        }
      `}</style>
    </div>
  );
}
