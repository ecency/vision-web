"use client";

import { useParams } from "next/navigation";
import { MattermostChannelView } from "@/features/chat/mattermost-channel-view";
import { useMattermostBootstrap } from "@/features/chat/mattermost-api";
import { getChatBanInfo } from "@/features/chat/chat-ban-notice";
import { ChatBanScreen } from "@/features/chat/components/chat-ban-screen";
import { ChatErrorBoundary } from "@/features/chat/chat-error-boundary";
import { LoginRequired } from "@/features/shared/login-required";
import { useHydrated } from "@/api/queries";
import { useActiveAccount } from "@/core/hooks/use-active-account";

export default function ChannelPage() {
  const { activeUser } = useActiveAccount();
  const hydrated = useHydrated();
  const params = useParams<{ id: string }>();
  const { data: bootstrap, isLoading, error, refetch } = useMattermostBootstrap();

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

  if (!bootstrap && !isLoading && error) {
    // Before the auth heuristic: a ban is not an expired session, and on a direct-channel URL
    // this pane is the ONLY thing rendered, so getting it wrong leaves no correct copy anywhere.
    const bootstrapBan = getChatBanInfo(error);
    if (bootstrapBan) {
      return <ChatBanScreen info={bootstrapBan} onExpire={refetch} />;
    }
  }

  if (!bootstrap && !isLoading && error?.message.includes("username")) {
    return <LoginRequired />;
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-[--text-muted]">Loading chat…</div>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-[--text-muted]">Unable to initialize chat</div>
      </div>
    );
  }

  return (
    <ChatErrorBoundary>
      <div className="h-full">
        {params.id && <MattermostChannelView channelId={params.id} />}
      </div>
    </ChatErrorBoundary>
  );
}
