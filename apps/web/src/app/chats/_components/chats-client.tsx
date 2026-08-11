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
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { Dropdown, DropdownItemWithIcon, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { checkSvg, dotsHorizontal, volumeOffSvg } from "@ui/svg";
import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getChatBanInfo } from "@/features/chat/chat-ban-notice";
import { ChatBanScreen } from "@/features/chat/components/chat-ban-screen";

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
  const shareText = searchParams?.get("text")?.trim();
  const dmTarget = searchParams?.get("dm")?.trim();
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

  const getDirectUserDisplayName = useCallback((user?: MattermostUser | null) => {
    if (!user) return undefined;

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
    if (fullName) return fullName;

    if (user.nickname) return user.nickname;

    if (user.username) return `@${user.username}`;

    return undefined;
  }, []);

  const filteredChannels = useMemo(() => {
    if (!channels?.channels) return [];

    const query = searchTerm.trim().toLowerCase();
    if (!query) return channels.channels;

    return channels.channels.filter((channel) => {
      const displayName = channel.display_name || channel.name;
      const directUsername = channel.directUser?.username || "";
      const directDisplayName = getDirectUserDisplayName(channel.directUser) || "";

      return (
        displayName.toLowerCase().includes(query) ||
        channel.name.toLowerCase().includes(query) ||
        directUsername.toLowerCase().includes(query) ||
        directDisplayName.toLowerCase().includes(query)
      );
    });
  }, [channels?.channels, getDirectUserDisplayName, searchTerm]);

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

  const sortedChannels = useMemo(() => {
    const defaultOrder = Number.MAX_SAFE_INTEGER;

    return [...filteredChannels]
      .map((channel) => ({
        channel,
        unread: getUnreadCount(channel) > 0,
        favorite: Boolean(channel.is_favorite),
        // Order by the logged-in user's most recent interaction (last viewed),
        // falling back to latest post time if we have never opened the channel.
        lastInteraction: channel.last_viewed_at ?? channel.last_post_at ?? 0,
        order: channelOrder.get(channel.id) ?? defaultOrder
      }))
      .sort((a, b) => {
        if (a.unread !== b.unread) {
          return a.unread ? -1 : 1;
        }

        if (a.favorite !== b.favorite) {
          return a.favorite ? -1 : 1;
        }

        if (a.lastInteraction !== b.lastInteraction) {
          return b.lastInteraction - a.lastInteraction;
        }

        return a.order - b.order;
      })
      .map((item) => item.channel);
  }, [channelOrder, filteredChannels, getUnreadCount]);

  // Group channels by category for better organization
  const channelsByCategory = useMemo(() => {
    const favorites: typeof sortedChannels = [];
    const directMessages: typeof sortedChannels = [];
    const regularChannels: typeof sortedChannels = [];

    sortedChannels.forEach((channel) => {
      if (channel.is_favorite) {
        favorites.push(channel);
      } else if (channel.type === "D") {
        directMessages.push(channel);
      } else {
        regularChannels.push(channel);
      }
    });

    return { favorites, directMessages, regularChannels };
  }, [sortedChannels]);


  const joinableChannelResults = useMemo(() => {
    const existingIds = new Set((channels?.channels || []).map((channel) => channel.id));

    return (
      channelSearchResults?.channels?.filter((channel) => !existingIds.has(channel.id)) || []
    );
  }, [channelSearchResults?.channels, channels?.channels]);

  // Auto-start DM when navigating from profile (?dm=username)
  const dmInitiated = useRef<string | null>(null);
  useEffect(() => {
    if (dmTarget && bootstrap?.ok && dmInitiated.current !== dmTarget) {
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

  const startDirectMessage = (username: string) => {
    const target = username.trim();
    if (!target) return;

    directChannelMutation.mutate(target, {
      onSuccess: (data) => {
        setSearchTerm("");
        router.push(buildChannelUrl(data.channelId));
      }
    });
  };

  const joinChannel = (channelId: string) => {
    joinChannelMutation.mutate(channelId, {
      onSuccess: () => {
        setSearchTerm("");
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

  const handleChannelLinkClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    const targetElement = event.target as HTMLElement | null;

    if (targetElement?.closest("[data-chat-channel-actions]")) {
      event.preventDefault();
    }
  }, []);

  const getChannelTitle = useCallback(
    (channel: (typeof filteredChannels)[number]) => {
      if (channel.type === "D") {
        const displayName = getDirectUserDisplayName(channel.directUser);
        if (displayName) return displayName;
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-[--border-color] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{i18next.t("chat.title")}</h2>
            <p className="text-xs text-[--text-muted]">{i18next.t("chat.page-title")}</p>
          </div>
          <div className="flex items-center gap-2">
            {(isLoading || channelsLoading) && (
              <div className="text-xs text-[--text-muted]">{i18next.t("chat.loading")}</div>
            )}
          </div>
        </div>
        <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
          <FormControl
            // Native search input: the channel-view keyboard shortcut focuses it
            // via a `[type="search"]` selector, so keep the DOM type and narrow
            // it for the FormControl props union (InputProps has no "search").
            type="search"
            placeholder={i18next.t("chat.search-channels")}
            value={searchTerm}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
            className="w-full"
          />
          {searchTerm && (
            <Button type="button" appearance="secondary" onClick={() => setSearchTerm("")}>
              Clear
            </Button>
          )}
        </form>
        {isShareMode && (
          <div className="rounded border border-[--border-color] bg-[--surface-color] p-3">
            <div className="text-xs font-semibold text-[--text-color]">
              {i18next.t("chat.share-intent", { defaultValue: "Share this link in chats" })}
            </div>
            <p className="mt-2 break-words text-sm text-[--text-muted]">{shareText}</p>
          </div>
        )}
        {(channelsError || channelSearchError || messageSearchError || joinChannelMutation.error ||
          directChannelMutation.error || userSearchError || error) && (
          <div className="grid gap-1 text-sm text-red-500">
            {error && <div>{error.message}</div>}
            {channelsError && <div>{(channelsError as Error).message}</div>}
            {channelSearchError && <div>{(channelSearchError as Error).message}</div>}
            {messageSearchError && <div>{(messageSearchError as Error).message}</div>}
            {joinChannelMutation.error && <div>{(joinChannelMutation.error as Error).message}</div>}
            {directChannelMutation.error && <div>{(directChannelMutation.error as Error).message}</div>}
            {userSearchError && <div>{(userSearchError as Error).message}</div>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[--text-muted]">
                {hasSearchTerm && i18next.t("chat.searching-channels")}
              </p>
              {hasSearchTerm && channelSearchLoading && (
                <span className="text-xs text-[--text-muted]">{i18next.t("chat.searching")}</span>
              )}
            </div>

            {/* grid-cols-1 => minmax(0,1fr): the single column must shrink to the
                rail width instead of sizing to the widest card's max-content, which
                a long (truncated, nowrap) channel name would otherwise blow out,
                pushing the unread badge + kebab past overflow-x-hidden and clipping
                them off the right edge. */}
            <div className="grid grid-cols-1 gap-4">
              {/* Favorites Section */}
              {!hasSearchTerm && channelsByCategory.favorites.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[--text-muted]">
                      <span className="text-amber-500" style={{ color: "#f59e0b" }}>
                        ★
                      </span>{" "}
                      Favorites
                    </span>
                    <div className="h-px flex-1 bg-[--border-color]" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {channelsByCategory.favorites.map((channel) => {
                      const unread = getUnreadCount(channel);
                      const isMuted = Boolean(channel.is_muted);
                      const markAsReadLabel = markChannelViewedMutation.isPending
                        ? i18next.t("chat.marking-as-read")
                        : i18next.t("chat.mark-as-read");
                      const favoriteLabel = channel.is_favorite
                        ? i18next.t("favorite-btn.delete")
                        : i18next.t("chat.favorite-channel");
                      const muteLabel = i18next.t(isMuted ? "chat.unmute-channel" : "chat.mute-channel");
                      const isActive = activeChannelId === channel.id;

                      return (
                        <Link
                          href={buildChannelUrl(channel.id)}
                          key={channel.id}
                          className={clsx(
                            "rounded-lg border-l-2 p-2.5 transition",
                            isActive
                              ? "border-blue-dark-sky bg-blue-duck-egg dark:bg-dark-default"
                              : "border-transparent hover:bg-gray-100 dark:hover:bg-white/5"
                          )}
                          onClickCapture={handleChannelLinkClick}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative flex-shrink-0">
                              {channel.type === "D" && channel.directUser ? (
                                <UserAvatar username={channel.directUser.username} size="medium" className="size-10" />
                              ) : (
                                <UserAvatar username={channel.name} size="medium" className="size-10" />
                              )}
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
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}

                            {channel.type !== "D" ? (
                              <div className="flex-shrink-0" data-chat-channel-actions onClick={(e) => e.stopPropagation()}>
                                <Dropdown>
                                  <DropdownToggle
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                  >
                                    <Button appearance="gray-link" icon={dotsHorizontal} className={KEBAB_BUTTON_CLASS} aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
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
                                    <DropdownItemWithIcon
                                      label={muteLabel}
                                      onClick={(e: MouseEvent) =>
                                        handleChannelAction(e, () =>
                                          muteChannelMutation.mutate({ channelId: channel.id, mute: !isMuted })
                                        )
                                      }
                                    />
                                    {!isTownHallChannel(channel) && (
                                      <DropdownItemWithIcon
                                        label={i18next.t("chat.leave-channel")}
                                        onClick={(e: MouseEvent) =>
                                          handleChannelAction(e, () => leaveChannel(channel.id))
                                        }
                                      />
                                    )}
                                  </DropdownMenu>
                                </Dropdown>
                              </div>
                            ) : (
                              unread > 0 && (
                                <div className="ml-2 flex-shrink-0" data-chat-channel-actions onClick={(e) => e.stopPropagation()}>
                                  <Dropdown>
                                    <DropdownToggle
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                    >
                                      <Button appearance="gray-link" icon={dotsHorizontal} className={KEBAB_BUTTON_CLASS} aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
                                    </DropdownToggle>
                                    <DropdownMenu align="right">
                                      <DropdownItemWithIcon
                                        icon={checkSvg}
                                        label={markAsReadLabel}
                                        onClick={(e: MouseEvent) =>
                                          handleChannelAction(e, () => markChannelViewedMutation.mutate(channel.id))
                                        }
                                        disabled={markChannelViewedMutation.isPending}
                                      />
                                    </DropdownMenu>
                                  </Dropdown>
                                </div>
                              )
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Direct Messages Section */}
              {!hasSearchTerm && channelsByCategory.directMessages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[--text-muted]">
                      💬 Direct Messages
                    </span>
                    <div className="h-px flex-1 bg-[--border-color]" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {channelsByCategory.directMessages.map((channel) => {
                      const unread = getUnreadCount(channel);
                      const isMuted = Boolean(channel.is_muted);
                      const markAsReadLabel = markChannelViewedMutation.isPending
                        ? i18next.t("chat.marking-as-read")
                        : i18next.t("chat.mark-as-read");
                      const isActive = activeChannelId === channel.id;

                      return (
                        <Link
                          href={buildChannelUrl(channel.id)}
                          key={channel.id}
                          className={clsx(
                            "rounded-lg border-l-2 p-2.5 transition",
                            isActive
                              ? "border-blue-dark-sky bg-blue-duck-egg dark:bg-dark-default"
                              : "border-transparent hover:bg-gray-100 dark:hover:bg-white/5"
                          )}
                          onClickCapture={handleChannelLinkClick}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative flex-shrink-0">
                              {channel.directUser && (
                                <UserAvatar username={channel.directUser.username} size="medium" className="size-10" />
                              )}
                              {unread > 0 && (
                                <span
                                  className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[--primary-color] ring-2 ring-[--surface-color]"
                                  aria-hidden="true"
                                />
                              )}
                            </div>

                            <div className="flex flex-1 flex-col gap-0.5 min-w-0 overflow-hidden">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex items-center font-semibold min-w-0 flex-1">
                                  <span className="truncate">{getChannelTitle(channel)}</span>
                                </div>
                              </div>
                              <div className="text-xs text-[--text-muted] truncate">{getChannelSubtitle(channel)}</div>
                            </div>

                            {unread > 0 && (
                              <span className="inline-flex min-w-[20px] max-w-[40px] justify-center rounded-full bg-[--primary-color] px-1.5 py-0.5 text-[10px] font-semibold text-[--primary-button-text-color] flex-shrink-0">
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}

                            <div className="flex-shrink-0" data-chat-channel-actions onClick={(e) => e.stopPropagation()}>
                              <Dropdown>
                                <DropdownToggle
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                >
                                  <Button appearance="gray-link" icon={dotsHorizontal} className={KEBAB_BUTTON_CLASS} aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
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
                                  <DropdownItemWithIcon
                                    label={i18next.t("chat.leave-conversation")}
                                    onClick={(e: MouseEvent) =>
                                      handleChannelAction(e, () => leaveChannel(channel.id))
                                    }
                                  />
                                </DropdownMenu>
                              </Dropdown>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Regular Channels Section */}
              {!hasSearchTerm && channelsByCategory.regularChannels.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[--text-muted]">
                      # Channels
                    </span>
                    <div className="h-px flex-1 bg-[--border-color]" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {channelsByCategory.regularChannels.map((channel) => {
                      const unread = getUnreadCount(channel);
                      const isMuted = Boolean(channel.is_muted);
                      const markAsReadLabel = markChannelViewedMutation.isPending
                        ? i18next.t("chat.marking-as-read")
                        : i18next.t("chat.mark-as-read");
                      const favoriteLabel = channel.is_favorite
                        ? i18next.t("favorite-btn.delete")
                        : i18next.t("chat.favorite-channel");
                      const muteLabel = i18next.t(isMuted ? "chat.unmute-channel" : "chat.mute-channel");
                      const isActive = activeChannelId === channel.id;

                      return (
                        <Link
                          href={buildChannelUrl(channel.id)}
                          key={channel.id}
                          className={clsx(
                            "rounded-lg border-l-2 p-2.5 transition",
                            isActive
                              ? "border-blue-dark-sky bg-blue-duck-egg dark:bg-dark-default"
                              : "border-transparent hover:bg-gray-100 dark:hover:bg-white/5"
                          )}
                          onClickCapture={handleChannelLinkClick}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative flex-shrink-0">
                              <UserAvatar username={channel.name} size="medium" className="size-10" />
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
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}

                            <div className="flex-shrink-0" data-chat-channel-actions onClick={(e) => e.stopPropagation()}>
                              <Dropdown>
                                <DropdownToggle
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                >
                                  <Button appearance="gray-link" icon={dotsHorizontal} className={KEBAB_BUTTON_CLASS} aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
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
                                  <DropdownItemWithIcon
                                    label={muteLabel}
                                    onClick={(e: MouseEvent) =>
                                      handleChannelAction(e, () =>
                                        muteChannelMutation.mutate({ channelId: channel.id, mute: !isMuted })
                                      )
                                    }
                                  />
                                  {!isTownHallChannel(channel) && (
                                    <DropdownItemWithIcon
                                      label={i18next.t("chat.leave-channel")}
                                      onClick={(e: MouseEvent) =>
                                        handleChannelAction(e, () => leaveChannel(channel.id))
                                      }
                                    />
                                  )}
                                </DropdownMenu>
                              </Dropdown>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search Results - Flat List */}
              {hasSearchTerm && sortedChannels.map((channel) => {
                const unread = getUnreadCount(channel);
                const isMuted = Boolean(channel.is_muted);
                const markAsReadLabel = markChannelViewedMutation.isPending
                  ? i18next.t("chat.marking-as-read")
                  : i18next.t("chat.mark-as-read");
                const favoriteLabel = channel.is_favorite
                  ? i18next.t("favorite-btn.delete")
                  : i18next.t("chat.favorite-channel");
                const muteLabel = i18next.t(isMuted ? "chat.unmute-channel" : "chat.mute-channel");
                const isActive = activeChannelId === channel.id;

                return (
                  <Link
                    href={buildChannelUrl(channel.id)}
                    key={channel.id}
                    className={clsx(
                      "rounded-lg border-l-2 p-2.5 transition",
                      isActive
                        ? "border-blue-dark-sky bg-blue-duck-egg dark:bg-dark-default"
                        : "border-transparent hover:bg-gray-100 dark:hover:bg-white/5"
                    )}
                    onClickCapture={handleChannelLinkClick}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        {channel.type === "D" && channel.directUser ? (
                          <UserAvatar username={channel.directUser.username} size="medium" className="size-10" />
                        ) : (
                          <UserAvatar username={channel.name} size="medium" className="size-10" />
                        )}
                        {unread > 0 && (
                          <span
                            className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[--primary-color] ring-2 ring-[--surface-color]"
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold truncate">
                            <span className="truncate">{getChannelTitle(channel)}</span>
                            {channel.is_favorite && (
                              <span className="text-amber-500 flex-shrink-0" aria-label="Favorite channel" title="Favorite channel">
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
                        <span className="ml-auto inline-flex min-w-[24px] flex-shrink-0 justify-center rounded-full bg-[--primary-color] px-2 py-1 text-xs font-semibold text-[--primary-button-text-color]">
                          {unread}
                        </span>
                      )}

                      {channel.type !== "D" ? (
                        <div className="ml-2 flex-shrink-0" data-chat-channel-actions onClick={(e) => e.stopPropagation()}>
                          <Dropdown>
                            <DropdownToggle
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <Button appearance="gray-link" icon={dotsHorizontal} className={KEBAB_BUTTON_CLASS} aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
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
                                    <DropdownItemWithIcon
                                      label={muteLabel}
                                      onClick={(e: MouseEvent) =>
                                        handleChannelAction(e, () =>
                                          muteChannelMutation.mutate({ channelId: channel.id, mute: !isMuted })
                                        )
                                      }
                                    />
                                    {!isTownHallChannel(channel) && (
                                      <DropdownItemWithIcon
                                        label={i18next.t("chat.leave-channel")}
                                        onClick={(e: MouseEvent) =>
                                          handleChannelAction(e, () => leaveChannel(channel.id))
                                        }
                                      />
                                    )}
                                  </DropdownMenu>
                                </Dropdown>
                              </div>
                            ) : (
                        unread > 0 && (
                          <div className="ml-2 flex-shrink-0" data-chat-channel-actions onClick={(e) => e.stopPropagation()}>
                            <Dropdown>
                              <DropdownToggle
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <Button appearance="gray-link" icon={dotsHorizontal} className={KEBAB_BUTTON_CLASS} aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
                              </DropdownToggle>
                              <DropdownMenu align="right">
                                <DropdownItemWithIcon
                                  icon={checkSvg}
                                  label={markAsReadLabel}
                                  onClick={(e: MouseEvent) =>
                                    handleChannelAction(e, () => markChannelViewedMutation.mutate(channel.id))
                                  }
                                  disabled={markChannelViewedMutation.isPending}
                                />
                              </DropdownMenu>
                            </Dropdown>
                          </div>
                        )
                      )}
                    </div>
                  </Link>
                );
              })}
              {!sortedChannels.length && !channelsLoading && (
                <div className="text-sm text-[--text-muted]">
                  {hasSearchTerm ? i18next.t("chat.no-channels-search") : i18next.t("chat.no-channels")}
                </div>
              )}
            </div>
          </div>

          {hasSearchTerm && (
            <div className="space-y-2 rounded border border-[--border-color] bg-[--background-color] p-3">
              <div className="flex items-center justify-between text-xs text-[--text-muted]">
                <span>{i18next.t("chat.search-user")}</span>
                {userSearchLoading && <span>{i18next.t("chat.searching")}</span>}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {userSearchLoading && <div className="text-sm text-[--text-muted]">{i18next.t("chat.searching")}</div>}
                {!userSearchLoading &&
                  userSearch?.users?.map((user) => {
                    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    const secondary = user.nickname || fullName;

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => startDirectMessage(user.username)}
                        className="flex items-center justify-between gap-3 rounded border border-[--border-color] bg-[--surface-color] p-2 text-left transition hover:border-blue-dark-sky"
                      >
                        <div className="flex items-center gap-3">
                          <UserAvatar username={user.username} size="medium" className="size-9" />
                          <div className="flex flex-col">
                            <span className="font-semibold">@{user.username}</span>
                            {secondary && <span className="text-xs text-[--text-muted]">{secondary}</span>}
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
                {!userSearchLoading && !userSearch?.users?.length && (
                  <div className="text-sm text-[--text-muted]">{i18next.t("chat.no-user")}</div>
                )}
              </div>
            </div>
          )}

          {hasSearchTerm && (
            <div className="space-y-2 rounded border border-[--border-color] bg-[--background-color] p-3">
              <div className="flex items-center justify-between text-xs text-[--text-muted]">
                <span>{i18next.t("chat.joinable-channels")}</span>
                {channelSearchLoading && <span>{i18next.t("chat.searching-channels")}</span>}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {joinableChannelResults.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between rounded border border-[--border-color] bg-[--surface-color] p-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{channel.display_name || channel.name}</span>
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
                {!channelSearchLoading && !joinableChannelResults.length && (
                  <div className="text-sm text-[--text-muted]">{i18next.t("chat.no-additional-channels")}</div>
                )}
              </div>
            </div>
          )}

          {hasSearchTerm && (
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
                {!messageSearchLoading && !subscribedMessageResults.length && (
                  <div className="text-sm text-[--text-muted]">{i18next.t("chat.no-messages-found")}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
