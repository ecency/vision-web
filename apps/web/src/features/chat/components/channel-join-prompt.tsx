"use client";

import i18next from "i18next";
import { Button } from "@ui/button";
import { useMattermostJoinChannel } from "../mattermost-api";

// A refused join (not a public channel, archived, or gone) cannot be retried, so the
// button would only sit there doing nothing.
const isNoAccessError = (error: Error) => /forbidden|\(40[034]\)/i.test(error.message);

export function ChannelJoinPrompt({ channelId, onJoined }: { channelId: string; onJoined: () => void }) {
  const joinChannelMutation = useMattermostJoinChannel();
  // The view can be reused for another channel; only show an error from a
  // join of the channel on screen.
  const error = joinChannelMutation.variables === channelId ? (joinChannelMutation.error as Error | null) : null;

  if (error && isNoAccessError(error)) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-[--text-muted]">{i18next.t("chat.join-no-access")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 gap-4">
      <p className="text-[--text-muted]">{i18next.t("chat.join-required")}</p>
      <Button
        onClick={() => joinChannelMutation.mutate(channelId, { onSuccess: onJoined })}
        isLoading={joinChannelMutation.isPending}
      >
        {i18next.t("chat.join-channel-button")}
      </Button>
      {error && <p className="text-sm text-red-500">{error.message}</p>}
    </div>
  );
}
