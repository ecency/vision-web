import { chatApiFetch } from "@/features/chat/chat-api-guard";

/// Posts a line to the community's Ecency chat channel as `account`, only when
/// the chat session is theirs and they are already in the channel. Says whether
/// it was sent: no chat session, someone else's, no such channel or chat being
/// down all answer false, and the caller copies the line instead.
export async function postToAllianceChat(
  community: string,
  message: string,
  account: string
): Promise<boolean> {
  try {
    // the session cookie can outlive an Ecency logout or switch: whose is it?
    // (chat users are made from the Hive name; compared as the chat sign-in does)
    const me = await chatApiFetch("/api/mattermost/me");
    if (!me.ok) return false;
    const { username } = (await me.json()) as { username?: unknown };
    if (typeof username !== "string" || username.toLowerCase() !== account.toLowerCase()) return false;
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

/// Copies a line, starting inside the tap that asked for it: Safari takes a
/// copy only while the tap is still current, so call this before any await.
/// Says whether it was copied.
export function copyLine(line: string): Promise<boolean> {
  const byHand = () => {
    const input = document.createElement("textarea");
    input.value = line;
    document.body.appendChild(input);
    input.select();
    try {
      return typeof document.execCommand === "function" && document.execCommand("copy");
    } catch {
      return false;
    } finally {
      input.remove();
    }
  };
  if (!navigator.clipboard?.writeText) return Promise.resolve(byHand());
  return navigator.clipboard.writeText(line).then(
    () => true,
    () => false
  );
}
