"use client";

import {
  useMattermostBootstrap,
  useMattermostChannels,
  useMattermostDirectChannel,
  useMattermostChannelSearch,
  useMattermostJoinChannel,
  useMattermostFavoriteChannel,
  useMattermostLeaveChannel,
  useMattermostMuteChannel,
  useMattermostUserSearch,
  useMattermostMessageSearch,
  useMattermostUnread,
  useMattermostMarkChannelViewed,
  type MattermostPost,
  type MattermostUser
} from "@/features/chat/mattermost-api";
import { LoginRequired } from "@/features/shared";
import { UserAvatar } from "@/features/shared/user-avatar";
import i18next from "i18next";
import Link from "next/link";
import { useHydrated } from "@/api/queries";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { Dropdown, DropdownItemWithIcon, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { checkSvg, dotsHorizontal, volumeOffSvg } from "@ui/svg";
import { UilPlus } from "@tooni/iconscout-unicons-react";
import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getChatBanInfo } from "@/features/chat/chat-ban-notice";
import { ChatBanScreen } from "@/features/chat/components/chat-ban-screen";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { NewGroupModal } from "@/features/chat/components/new-group-modal";
import { NewPrivateChannelModal } from "@/features/chat/components/private-channel-modals";
import { sortChannelsByActivity } from "@/features/chat/channel-sort";
import { OfficialBadge } from "@/features/chat/components/official-badge";
import { getUserDisplayName } from "@/features/chat/format-utils";
import { ASK_ESIE_HREF, ESIE_USERNAME, safeChatName } from "@/features/chat/official-accounts";
import { ESIE_MOODS } from "@ui/esie/esie-moods.generated";
import {
  getGroupTitle,
  isConversationChannel,
  isGroupChannel
} from "@/features/chat/group-utils";

const TOWN_HALL_CHANNEL_NAME = "town-hall";

// Per-channel kebab trigger: keep the gray-link appearance but give it real
// affordance — a clearly visible icon in dark mode (gray-link alone is a faint
// #6c757d glyph on the dark rail, ~3.7:1, which users miss) plus a hover/focus
// surface so it reads as an interactive control in every desktop browser/theme.
const KEBAB_BUTTON_CLASS =
  "dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-default focus-visible:ring-2 focus-visible:ring-blue-dark-sky";

export function ChatsClient() {
  const { activeUser } = useActiveAccount();
  const hydrated = useHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isOnScreen = () => Boolean(rootRef.current?.getClientRects().length);
  const pathname = usePathname();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewPrivateChannel, setShowNewPrivateChannel] = useState(false);
  const shareText = searchParams?.get("text")?.trim();
  const dmTarget = searchParams?.get("dm")?.trim();
  const openSearchParam = searchParams?.get("search") === "1";
  const isShareMode = Boolean(shareText);

  const { data: bootstrap, isLoading, error, refetch: refetchBootstrap } = useMattermostBootstrap();
  const {
    data: channels,
    isLoading: channelsLoading,
    error: channelsError
  } = useMattermostChannels(Boolean(bootstrap?.ok));
  const {
    data: channelSearchResults,
    isFetching: channelSearchLoading,
    error: channelSearchError
  } = useMattermostChannelSearch(searchTerm, Boolean(bootstrap?.ok));
  const {
    data: messageSearchResults,
    isFetching: messageSearchLoading,
    error: messageSearchError
  } = useMattermostMessageSearch(searchTerm, Boolean(bootstrap?.ok));
  const favoriteChannelMutation = useMattermostFavoriteChannel();
  const muteChannelMutation = useMattermostMuteChannel();
  const leaveChannelMutation = useMattermostLeaveChannel();
  const joinChannelMutation = useMattermostJoinChannel();
  const markChannelViewedMutation = useMattermostMarkChannelViewed();
  const {
    data: userSearch,
    isFetching: userSearchLoading,
    error: userSearchError
  } = useMattermostUserSearch(searchTerm, Boolean(bootstrap?.ok));
  const directChannelMutation = useMattermostDirectChannel();
  const { data: unreadSummary } = useMattermostUnread(Boolean(bootstrap?.ok && activeUser && hydrated));
  const params = useParams<{ id?: string }>();

  const channelOrder = useMemo(() => {
    return new Map((channels?.channels || []).map((channel, index) => [channel.id, index]));
  }, [channels?.channels]);

  const channelsById = useMemo(() => {
    return new Map((channels?.channels || []).map((channel) => [channel.id, channel]));
  }, [channels?.channels]);

  const getDirectUserDisplayName = getUserDisplayName;

  const filteredChannels = useMemo(() => {
    if (!channels?.channels) return [];

    // Only the New chat modal reads this list, so skip the work while it is
    // closed or the term is too short to search.
    const query = searchTerm.trim().toLowerCase();
    if (!showSearch || query.length < 2) return [];

    return channels.channels.filter((channel) => {
      const displayName = channel.display_name || channel.name;
      const directUsername = channel.directUser?.username || "";
      const directDisplayName = getDirectUserDisplayName(channel.directUser) || "";
      const groupNames = (channel.groupUsers ?? [])
        .map((user) => `${user.username} ${getDirectUserDisplayName(user) || ""}`)
        .join(" ");

      return (
        displayName.toLowerCase().includes(query) ||
        channel.name.toLowerCase().includes(query) ||
        directUsername.toLowerCase().includes(query) ||
        directDisplayName.toLowerCase().includes(query) ||
        groupNames.toLowerCase().includes(query) ||
        (channel.group_name || "").toLowerCase().includes(query)
      );
    });
  }, [channels?.channels, getDirectUserDisplayName, searchTerm, showSearch]);

  const unreadByChannelId = useMemo(() => {
    if (!unreadSummary?.channels) return new Map<string, { mention_count: number; message_count: number; thread_unread: number }>();

    return unreadSummary.channels.reduce((acc, channel) => {
      acc.set(channel.channelId, {
        mention_count: channel.mention_count,
        message_count: channel.message_count,
        thread_unread: channel.thread_unread
      });
      return acc;
    }, new Map<string, { mention_count: number; message_count: number; thread_unread: number }>());
  }, [unreadSummary?.channels]);

  const getUnreadCount = useCallback(
    (channel: (typeof filteredChannels)[number]) => {
      const unreadCounts = unreadByChannelId.get(channel.id);
      const mentionCount = channel.mention_count ?? unreadCounts?.mention_count ?? 0;
      const messageCount = channel.message_count ?? unreadCounts?.message_count ?? 0;
      const threadCount = unreadCounts?.thread_unread ?? 0;

      return channel.type === "D"
        ? messageCount
        : Math.max(messageCount, mentionCount) + threadCount;
    },
    [unreadByChannelId]
  );

  const sortedChannels = useMemo(
    () => sortChannelsByActivity(channels?.channels || [], getUnreadCount, channelOrder),
    [channelOrder, channels?.channels, getUnreadCount]
  );
  // Esie is pinned on top, so it is reachable before any conversation with it exists
  const esieChannel = useMemo(
    () => sortedChannels.find((c) => c.type === "D" && c.directUser?.username === ESIE_USERNAME),
    [sortedChannels]
  );
  const listedChannels = useMemo(
    () => (esieChannel ? sortedChannels.filter((c) => c !== esieChannel) : sortedChannels),
    [esieChannel, sortedChannels]
  );
  const searchedChannels = useMemo(
    () => sortChannelsByActivity(filteredChannels, getUnreadCount, channelOrder),
    [channelOrder, filteredChannels, getUnreadCount]
  );


  const joinableChannelResults = useMemo(() => {
    const existingIds = new Set((channels?.channels || []).map((channel) => channel.id));

    return (
      channelSearchResults?.channels?.filter((channel) => !existingIds.has(channel.id)) || []
    );
  }, [channelSearchResults?.channels, channels?.channels]);

  // Auto-start DM when navigating from profile (?dm=username)
  const dmInitiated = useRef<string | null>(null);
  useEffect(() => {
    // the list stays mounted across chats, so a later link to the same person must start again
    if (!dmTarget) dmInitiated.current = null;
    if (dmTarget && bootstrap?.ok && isOnScreen() && dmInitiated.current !== dmTarget) {
      dmInitiated.current = dmTarget;
      directChannelMutation.mutate(dmTarget, {
        onSuccess: (data) => {
          router.replace(buildChannelUrl(data.channelId));
        },
        onError: () => {
          dmInitiated.current = null;
        }
      });
    }
  }, [dmTarget, bootstrap?.ok]);

  const closeSearch = () => {
    setShowSearch(false);
    setSearchTerm("");
    joinChannelMutation.reset();
    directChannelMutation.reset();
  };

  // The layout mounts one ChatsClient on every chats route (CSS-hidden below
  // md) and mobile /chats mounts a second, so only the instance on screen may
  // open the modal, or two would stack.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      if (isOnScreen()) {
        e.preventDefault();
        setShowSearch(true);
      } else if (params?.id) {
        // Mobile channel page: no list is on screen, so go to the one on /chats.
        e.preventDefault();
        router.push("/chats?search=1");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [params?.id, router]);

  useEffect(() => {
    if (!openSearchParam || !bootstrap?.ok || !isOnScreen()) return;
    setShowSearch(true);
    const next = new URLSearchParams(searchParams?.toString());
    next.delete("search");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [openSearchParam, bootstrap?.ok]);

  useEffect(() => {
    if (showSearch) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [showSearch]);

  const startDirectMessage = (username: string) => {
    const target = username.trim();
    if (!target) return;

    directChannelMutation.mutate(target, {
      onSuccess: (data) => {
        closeSearch();
        router.push(buildChannelUrl(data.channelId));
      }
    });
  };

  const joinChannel = (channelId: string) => {
    joinChannelMutation.mutate(channelId, {
      onSuccess: () => {
        closeSearch();
        router.push(buildChannelUrl(channelId));
      }
    });
  };

  const leaveChannel = (channelId: string) => {
    leaveChannelMutation.mutate(channelId, {
      onSuccess: () => {
        if (activeChannelId === channelId) {
          router.push("/chats");
        }
      }
    });
  };

  const handleChannelAction = (e: MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  const getChannelTitle = useCallback(
    (channel: (typeof filteredChannels)[number]) => {
      if (channel.type === "D") {
        const displayName = getDirectUserDisplayName(channel.directUser);
        if (displayName) return displayName;
      }

      if (isGroupChannel(channel)) {
        return (
          safeChatName(channel.group_name) ||
          getGroupTitle(channel.groupUsers, channel.display_name || channel.name)
        );
      }

      return channel.display_name || channel.name;
    },
    [getDirectUserDisplayName]
  );

  const getChannelSubtitle = useCallback(
    (channel: (typeof filteredChannels)[number]) => {
      if (channel.type === "D") {
        if (channel.directUser?.username) return `@${channel.directUser.username}`;

        return i18next.t("chat.channel-type-dm");
      }

      if (isGroupChannel(channel)) {
        // A named group lists who is in it under the name.
        if (channel.group_name && channel.groupUsers?.length) {
          return getGroupTitle(channel.groupUsers, "");
        }
        // The other members plus the viewer.
        const count = channel.groupUsers?.length ? channel.groupUsers.length + 1 : undefined;
        return count
          ? i18next.t("chat.channel-type-group", { count })
          : i18next.t("chat.new-group-members");
      }

      return i18next.t("chat.channel-type");
    },
    []
  );

  const formatTimestamp = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }),
    []
  );

  const subscribedMessageResults = useMemo(() => {
    return (messageSearchResults?.posts || []).filter((post) =>
      channelsById.has(post.channel_id)
    );
  }, [channelsById, messageSearchResults?.posts]);

  // Someone with a DM is left out of People only when that DM is already in
  // Your chats. The server matches more user fields than the local filter, so
  // a DM partner found by, say, nickname must still be reachable here.
  const discoverableUsers = useMemo(() => {
    const existingDmUsernames = new Set(
      searchedChannels
        .filter((channel) => channel.type === "D")
        .map((channel) => channel.directUser?.username?.toLowerCase())
    );
    return (userSearch?.users || []).filter(
      (user) => user.username.toLowerCase() !== activeUser?.username?.toLowerCase() &&
        !existingDmUsernames.has(user.username.toLowerCase())
    );
  }, [activeUser?.username, searchedChannels, userSearch?.users]);

  const buildChannelUrl = useCallback(
    (channelId: string) =>
      shareText ? `/chats/${channelId}?text=${encodeURIComponent(shareText)}` : `/chats/${channelId}`,
    [shareText]
  );

  const trimmedSearch = searchTerm.trim();
  const hasSearchTerm = trimmedSearch.length >= 2;

  const defaultChannelId = useMemo(() => {
    if (!channels?.channels?.length) return undefined;

    const townHallChannel = channels.channels.find((channel) => {
      const displayName = channel.display_name?.toLowerCase() || "";
      return channel.name.toLowerCase() === TOWN_HALL_CHANNEL_NAME || displayName === "town hall" || displayName === "town-hall";
    });

    return townHallChannel?.id || channels.channels[0]?.id;
  }, [channels?.channels]);

  const isTownHallChannel = useCallback((channel: { name: string; display_name?: string }) => {
    const displayName = channel.display_name?.toLowerCase() || "";
    return channel.name.toLowerCase() === TOWN_HALL_CHANNEL_NAME || displayName === "town hall" || displayName === "town-hall";
  }, []);

  const activeChannelId = params?.id || defaultChannelId;

  const renderChannelRow = (channel: (typeof sortedChannels)[number]) => {
    const unread = getUnreadCount(channel);
    const isMuted = Boolean(channel.is_muted);
    const isConversation = isConversationChannel(channel);
    const markAsReadLabel = markChannelViewedMutation.isPending
      ? i18next.t("chat.marking-as-read")
      : i18next.t("chat.mark-as-read");
    const favoriteLabel = channel.is_favorite
      ? i18next.t("favorite-btn.delete")
      : i18next.t("chat.favorite-channel");
    const muteLabel = i18next.t(isMuted ? "chat.unmute-channel" : "chat.mute-channel");
    const isActive = activeChannelId === channel.id;

    return (
      <div
        key={channel.id}
        className={clsx(
          "flex min-w-0 items-center rounded-lg border-l-2 p-1.5 transition",
          isActive
            ? "border-blue-dark-sky bg-blue-duck-egg dark:bg-dark-default"
            : "border-transparent hover:bg-gray-100 focus-within:bg-gray-100 dark:hover:bg-white/5 dark:focus-within:bg-white/5"
        )}
      >
        <Link
          href={buildChannelUrl(channel.id)}
          aria-current={isActive ? "page" : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-dark-sky"
        >
          <div className="relative flex-shrink-0">
            <ChannelAvatar channel={channel} />
            {unread > 0 && (
              <span
                className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[--primary-color] ring-2 ring-[--surface-color]"
                aria-hidden="true"
              />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-0.5 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1 font-semibold min-w-0 flex-1">
                <span className="truncate">{getChannelTitle(channel)}</span>
                {channel.type === "D" && <OfficialBadge username={channel.directUser?.username} />}
                {channel.is_favorite && (
                  <span
                    className="text-amber-500 flex-shrink-0 text-sm"
                    style={{ color: "#f59e0b" }}
                    aria-label="Favorite channel"
                    title="Favorite channel"
                  >
                    ★
                  </span>
                )}
                {isMuted && (
                  <span
                    className="text-[--text-muted] inline-flex shrink-0 size-4 [&>svg]:size-full"
                    aria-label={i18next.t("chat.channel-muted")}
                    title={i18next.t("chat.channel-muted")}
                  >
                    {volumeOffSvg}
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs text-[--text-muted] truncate">{getChannelSubtitle(channel)}</div>
          </div>

          {unread > 0 && (
            <span className="inline-flex min-w-[20px] max-w-[40px] justify-center rounded-full bg-[--primary-color] px-1.5 py-0.5 text-[10px] font-semibold text-[--primary-button-text-color] flex-shrink-0">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>

        <div className="flex-shrink-0" data-chat-channel-actions>
          <Dropdown>
            <DropdownToggle
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Button appearance="gray-link" icon={dotsHorizontal} className={KEBAB_BUTTON_CLASS} aria-label={`${i18next.t("g.menu", { defaultValue: "Menu" })}: ${getChannelTitle(channel)}`} aria-haspopup="menu" />
            </DropdownToggle>
            <DropdownMenu align="right">
              {unread > 0 && (
                <DropdownItemWithIcon
                  icon={checkSvg}
                  label={markAsReadLabel}
                  onClick={(e: MouseEvent) =>
                    handleChannelAction(e, () => markChannelViewedMutation.mutate(channel.id))
                  }
                  disabled={markChannelViewedMutation.isPending}
                />
              )}
              {(!isConversation || channel.is_favorite) && (
                <DropdownItemWithIcon
                  label={favoriteLabel}
                  onClick={(e: MouseEvent) =>
                    handleChannelAction(e, () =>
                      favoriteChannelMutation.mutate({
                        channelId: channel.id,
                        favorite: !channel.is_favorite
                      })
                    )
                  }
                />
              )}
              {!isConversation && (
                <DropdownItemWithIcon
                  label={muteLabel}
                  onClick={(e: MouseEvent) =>
                    handleChannelAction(e, () =>
                      muteChannelMutation.mutate({ channelId: channel.id, mute: !isMuted })
                    )
                  }
                />
              )}
              {isConversation ? (
                <DropdownItemWithIcon
                  label={i18next.t("chat.leave-conversation")}
                  onClick={(e: MouseEvent) => handleChannelAction(e, () => leaveChannel(channel.id))}
                />
              ) : (
                // The chat admin manages private channels from inside them;
                // leaving would drop the only way back in.
                !isTownHallChannel(channel) &&
                !(channel.type === "P" && channels?.canManagePrivateChannels) && (
                  <DropdownItemWithIcon
                    label={i18next.t("chat.leave-channel")}
                    onClick={(e: MouseEvent) => handleChannelAction(e, () => leaveChannel(channel.id))}
                  />
                )
              )}
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
    );
  };

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-[--text-muted]">{i18next.t("chat.loading-chats")}</div>
      </div>
    );
  }

  if (!activeUser) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <LoginRequired />
      </div>
    );
  }

  // Handle authentication errors from bootstrap
  if (!bootstrap && !isLoading && error) {
    // A ban is checked FIRST and by payload, not by message text. Bootstrap fails for a
    // deactivated+banned account, so the channel view never mounts and its composer notice is
    // unreachable — without this branch the fallback below prints the operator-facing string
    // (their own handle and an ISO timestamp) on the chats page.
    const bootstrapBan = getChatBanInfo(error);
    if (bootstrapBan) {
      return <ChatBanScreen info={bootstrapBan} onExpire={refetchBootstrap} />;
    }

    const errorMessage = error?.message?.toLowerCase() || "";
    const isAuthError =
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("invalid token") ||
      errorMessage.includes("username");

    if (isAuthError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
          <div className="text-center">
            <div className="text-sm text-[--text-muted] mb-2">
              {i18next.t("chat.page-title")}
            </div>
            <div className="text-sm text-[--text-muted] mb-4">
              Your chat session has expired
            </div>
            <LoginRequired />
            <button
              onClick={() => refetchBootstrap()}
              className="mt-4 text-sm text-blue-dark-sky hover:text-blue-dark-sky-hover underline"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    // Show other errors with retry button
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="text-sm text-red-500">
          Chat initialization failed: {error.message}
        </div>
        <button
          onClick={() => refetchBootstrap()}
          className="rounded-lg border border-[--border-color] bg-[--surface-color] px-4 py-2 text-sm hover:bg-[--hover-color]"
        >
          Retry
        </button>
      </div>
    );
  }

  // Wait for bootstrap to complete before showing channel list
  if (isLoading || !bootstrap) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-[--text-muted]">{i18next.t("chat.loading-chats")}</div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <NewGroupModal
        show={showNewGroup}
        onHide={() => setShowNewGroup(false)}
        currentUsername={activeUser?.username}
        onCreated={(channelId) => {
          setShowNewGroup(false);
          router.push(buildChannelUrl(channelId));
        }}
      />
      {channels?.canManagePrivateChannels && (
        <NewPrivateChannelModal
          show={showNewPrivateChannel}
          onHide={() => setShowNewPrivateChannel(false)}
          currentUsername={activeUser?.username}
          onCreated={(channelId) => {
            setShowNewPrivateChannel(false);
            router.push(buildChannelUrl(channelId));
          }}
        />
      )}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[--border-color] p-3 sm:p-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{i18next.t("chat.title")}</h2>
            <p className="text-xs text-[--text-muted]">{i18next.t("chat.page-title")}</p>
          </div>
          <Button
            type="button"
            size="sm"
            appearance="secondary"
            outline={true}
            icon={<UilPlus />}
            aria-label={i18next.t("chat.new-chat")}
            title={i18next.t("chat.new-chat")}
            data-chat-search-trigger
            className="!size-10 !shrink-0 !p-0"
            onClick={() => setShowSearch(true)}
          />
        </div>
        {isShareMode && (
          <div className="rounded border border-[--border-color] bg-[--surface-color] p-3">
            <div className="text-xs font-semibold text-[--text-color]">
              {i18next.t("chat.share-intent", { defaultValue: "Share this link in chats" })}
            </div>
            <p className="mt-2 break-words text-sm text-[--text-muted]">{shareText}</p>
          </div>
        )}
        {(error || channelsError || (!showSearch && directChannelMutation.error)) && (
          <div className="grid gap-1 text-sm text-red-500 dark:text-red-400" role="alert">
            {error && <div>{error.message}</div>}
            {channelsError && <div>{(channelsError as Error).message}</div>}
            {!showSearch && directChannelMutation.error && (
              <div>{(directChannelMutation.error as Error).message}</div>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-1">
            {esieChannel ? (
              renderChannelRow(esieChannel)
            ) : (
              <Link
                href={ASK_ESIE_HREF}
                data-chat-esie-pinned
                className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border-l-2 border-transparent p-2.5 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-dark-sky dark:hover:bg-white/5"
              >
                <img
                  src={ESIE_MOODS.avatar.src}
                  width={40}
                  height={40}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="size-10 shrink-0 rounded-full bg-blue-duck-egg dark:bg-dark-default"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-1 font-semibold">
                    <span className="truncate">{i18next.t("chat.esie-title")}</span>
                    <OfficialBadge username={ESIE_USERNAME} />
                  </div>
                  <div className="truncate text-xs text-[--text-muted]">{i18next.t("chat.esie-subtitle")}</div>
                </div>
              </Link>
            )}
            {listedChannels.map(renderChannelRow)}
            {!sortedChannels.length && !channelsLoading && (
              <div className="text-sm text-[--text-muted]">{i18next.t("chat.no-channels")}</div>
            )}
          </div>
        </div>
      </div>
      <Modal show={showSearch} onHide={closeSearch} centered size="lg" className="!pt-3 sm:!py-4" dialogClassName="!mt-0 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden">
        <ModalHeader closeButton={true} className="shrink-0">{i18next.t("chat.new-chat")}</ModalHeader>
        <ModalBody className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[--text-muted]">{i18next.t("chat.find-or-create-hint")}</p>
            <FormControl
              ref={searchInputRef}
              type="search"
              aria-label={i18next.t("chat.search-chats")}
              placeholder={i18next.t("chat.search-chats-placeholder")}
              value={searchTerm}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="w-full"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" appearance="secondary" outline={true} icon={<UilPlus />} iconPlacement="left" className="justify-start" onClick={() => { closeSearch(); setShowNewGroup(true); }}>
                {i18next.t("chat.new-group")}
              </Button>
              {channels?.canManagePrivateChannels && (
                <Button type="button" appearance="secondary" outline={true} icon={<UilPlus />} iconPlacement="left" className="justify-start" onClick={() => { closeSearch(); setShowNewPrivateChannel(true); }}>
                  {i18next.t("chat.new-private-channel")}
                </Button>
              )}
            </div>
            {(channelSearchError || messageSearchError || joinChannelMutation.error || directChannelMutation.error || userSearchError) && (
              <div className="grid gap-1 text-sm text-red-500 dark:text-red-400" role="alert">
                {channelSearchError && <div>{(channelSearchError as Error).message}</div>}
                {messageSearchError && <div>{(messageSearchError as Error).message}</div>}
                {joinChannelMutation.error && <div>{(joinChannelMutation.error as Error).message}</div>}
                {directChannelMutation.error && <div>{(directChannelMutation.error as Error).message}</div>}
                {userSearchError && <div>{(userSearchError as Error).message}</div>}
              </div>
            )}
            {!hasSearchTerm && <p className="text-sm text-[--text-muted]">{i18next.t("chat.search-to-start")}</p>}
            {hasSearchTerm && searchedChannels.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[--text-muted]">
                  <span>{i18next.t("chat.existing-chats")}</span>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {searchedChannels.map((channel) => (
                    <Link key={channel.id} href={buildChannelUrl(channel.id)} onClick={closeSearch} className="flex min-w-0 items-center gap-3 rounded-lg border border-[--border-color] p-2 transition hover:border-blue-dark-sky focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-dark-sky">
                      <ChannelAvatar channel={channel} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{getChannelTitle(channel)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          {hasSearchTerm && (userSearchLoading || discoverableUsers.length > 0) && (
            <div className="space-y-2 rounded border border-[--border-color] bg-[--background-color] p-3">
              <div className="flex items-center justify-between text-xs text-[--text-muted]">
                <span>{i18next.t("chat.people")}</span>
                {userSearchLoading && <span>{i18next.t("chat.searching")}</span>}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {userSearchLoading && <div className="text-sm text-[--text-muted]">{i18next.t("chat.searching")}</div>}
                {!userSearchLoading &&
                  discoverableUsers.map((user) => {
                    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    const secondary = safeChatName(user.nickname || fullName, user.username);

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => startDirectMessage(user.username)}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded border border-[--border-color] bg-[--surface-color] p-2 text-left transition hover:border-blue-dark-sky focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-dark-sky"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar username={user.username} size="medium" className="size-9" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold">@{user.username}</span>
                            {secondary && <span className="truncate text-xs text-[--text-muted]">{secondary}</span>}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-blue-dark-sky">
                          {directChannelMutation.isPending
                            ? i18next.t("chat.starting-dm")
                            : i18next.t("chat.start-dm-button")}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {hasSearchTerm && (channelSearchLoading || joinableChannelResults.length > 0) && (
            <div className="space-y-2 rounded border border-[--border-color] bg-[--background-color] p-3">
              <div className="flex items-center justify-between text-xs text-[--text-muted]">
                <span>{i18next.t("chat.joinable-channels")}</span>
                {channelSearchLoading && <span>{i18next.t("chat.searching-channels")}</span>}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {joinableChannelResults.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded border border-[--border-color] bg-[--surface-color] p-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="break-words font-semibold">{channel.display_name || channel.name}</span>
                      <span className="text-xs text-[--text-muted]">
                        {channel.type === "O"
                          ? i18next.t("chat.channel-type-public")
                          : channel.type === "P"
                            ? i18next.t("chat.channel-type-private")
                            : i18next.t("chat.channel-type")}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => joinChannel(channel.id)}
                      disabled={joinChannelMutation.isPending}
                    >
                      {joinChannelMutation.isPending
                        ? i18next.t("chat.joining-channel")
                        : i18next.t("chat.join-channel-action")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasSearchTerm && (messageSearchLoading || subscribedMessageResults.length > 0) && (
            <div className="space-y-2 rounded border border-[--border-color] bg-[--background-color] p-3">
              <div className="flex items-center justify-between text-xs text-[--text-muted]">
                <span>{i18next.t("chat.message-search-results")}</span>
                {messageSearchLoading && <span>{i18next.t("chat.searching")}</span>}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {subscribedMessageResults.map((post) => {
                  const channel = channelsById.get(post.channel_id);
                  const channelLabel = channel ? getChannelTitle(channel) : i18next.t("chat.channel-type");
                  const channelSubtitle = channel ? getChannelSubtitle(channel) : undefined;
                  const messageLink = shareText
                    ? `/chats/${post.channel_id}?post=${post.id}&text=${encodeURIComponent(shareText)}`
                    : `/chats/${post.channel_id}?post=${post.id}`;

                  return (
                    <Link
                      key={post.id}
                      href={messageLink}
                      onClick={closeSearch}
                      className="flex flex-col gap-1 rounded border border-[--border-color] bg-[--surface-color] p-3 transition hover:border-blue-dark-sky"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-sm font-semibold line-clamp-2 break-words">
                            {post.message || i18next.t("chat.no-message")}
                          </div>
                          <div className="text-xs text-[--text-muted]">
                            {channelLabel}
                            {channelSubtitle ? ` • ${channelSubtitle}` : ""}
                          </div>
                        </div>
                        <span className="text-[11px] text-[--text-muted]">
                          {formatTimestamp.format(new Date(post.create_at))}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          {hasSearchTerm && !searchedChannels.length && !discoverableUsers.length &&
            !joinableChannelResults.length && !subscribedMessageResults.length &&
            !userSearchLoading && !channelSearchLoading && !messageSearchLoading && (
              <p className="text-sm text-[--text-muted]">{i18next.t("chat.no-search-results")}</p>
            )}
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}
