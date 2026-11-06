import { chatApiFetch } from "@/features/chat/chat-api-guard";

/// Posts a line to the community's Ecency chat channel, only when the player
/// is already in it (the chat session is the Ecency user's, kept in a cookie).
/// Says whether it was sent: no chat session, no such channel or chat being
/// down all answer false, and the caller copies the line instead.
export async function postToAllianceChat(community: string, message: string): Promise<boolean> {
  try {
    const res = await chatApiFetch("/api/mattermost/channels");
    if (!res.ok) return false;
    const body = (await res.json()) as { channels?: { id: string; name: string; type: string }[] };
    // a community's channel is the open channel named after it
    const channel = body.channels?.find((c) => c.name === community && c.type === "O");
    if (!channel) return false;
    const sent = await chatApiFetch(
      `/api/mattermost/channels/${encodeURIComponent(channel.id)}/posts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      }
    );
    return sent.ok;
  } catch {
    return false;
  }
}
