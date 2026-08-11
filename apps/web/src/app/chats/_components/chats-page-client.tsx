"use client";

import { useMemo } from "react";
import { useHydrated } from "@/api/queries";
import { useMattermostBootstrap, useMattermostChannels } from "@/features/chat/mattermost-api";
import { getChatBanInfo } from "@/features/chat/chat-ban-notice";
import { ChatBanScreen } from "@/features/chat/components/chat-ban-screen";
import { MattermostChannelView } from "@/features/chat/mattermost-channel-view";
import { ChatErrorBoundary } from "@/features/chat/chat-error-boundary";
import { LoginRequired } from "@/features/shared";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const TOWN_HALL_CHANNEL_NAME = "town-hall";

export function ChatsPageClient() {
  const { activeUser } = useActiveAccount();
  const hydrated = useHydrated();
  const { data: bootstrap, isLoading, error, refetch } = useMattermostBootstrap();
  const { data: channels, isLoading: channelsLoading } = useMattermostChannels(Boolean(bootstrap?.ok));

  const defaultChannelId = useMemo(() => {
    if (!channels?.channels?.length) return undefined;

    const townHallChannel = channels.channels.find((channel) => {
      const displayName = channel.display_name?.toLowerCase() || "";
      return channel.name.toLowerCase() === TOWN_HALL_CHANNEL_NAME || displayName === "town hall" || displayName === "town-hall";
    });

    return townHallChannel?.id || channels.channels[0]?.id;
  }, [channels?.channels]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-[--text-muted]">Loading chat…</div>
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

  // Handle all authentication errors
  if (!bootstrap && !isLoading && error) {
    // Checked by payload and BEFORE the message-text heuristics below. A ban is not an auth
    // failure, and matching on wording would be fragile: the operator string embeds the account
    // name and an ISO date, neither of which is a stable thing to pattern-match on.
    const bootstrapBan = getChatBanInfo(error);
    if (bootstrapBan) {
      return <ChatBanScreen info={bootstrapBan} onExpire={refetch} />;
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
              Your chat session has expired
            </div>
            <LoginRequired />
            <button
              onClick={() => refetch()}
              className="mt-4 text-sm text-blue-500 hover:text-blue-600 underline"
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
          onClick={() => refetch()}
          className="rounded-lg border border-[--border-color] bg-[--surface-color] px-4 py-2 text-sm hover:bg-[--hover-color]"
        >
          Retry
        </button>
      </div>
    );
  }

  // Wait for bootstrap to complete before rendering channel view
  if (isLoading || !bootstrap) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-[--text-muted]">Loading chat…</div>
      </div>
    );
  }

  if (!defaultChannelId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-[--text-muted]">
          {channelsLoading ? "Loading chat…" : "No channels available"}
        </div>
      </div>
    );
  }

  return (
    <ChatErrorBoundary>
      <div className="h-full overflow-hidden">
        <MattermostChannelView channelId={defaultChannelId} />
      </div>
    </ChatErrorBoundary>
  );
}
