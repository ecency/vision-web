import { NextResponse } from "next/server";
import {
  addUserLeftChannel,
  COMMUNITY_CHANNEL_NAME_PATTERN,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch,
  MattermostChannel,
  MattermostUser
} from "@/server/mattermost";

export async function POST(_: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { channelId } = await params;
    const [channel, currentUser] = await Promise.all([
      mmUserFetch<MattermostChannel>(`/channels/${encodeURIComponent(channelId)}`, token),
      mmUserFetch<MattermostUser>(`/users/me`, token)
    ]);

    if (channel.type === "D") {
      // Mattermost "Close conversation" for DMs is a preference update, not a leave.
      // Extract the other user's ID from the channel name (format: userId1__userId2)
      const parts = channel.name?.split("__") ?? [];
      const otherUserId =
        parts.length === 2
          ? parts.find((id) => id !== currentUser.id) || parts[0]
          : channelId; // Fallback to channelId if parsing fails

      await mmUserFetch(`/users/${currentUser.id}/preferences`, token, {
        method: "PUT",
        body: JSON.stringify([
          {
            user_id: currentUser.id,
            category: "direct_channel_show",
            name: otherUserId,
            value: "false"
          }
        ])
      });
    } else if (channel.type === "G") {
      // Mattermost does not remove members from a group; closing one hides it
      // for this user, like a DM. It shows again while it has unread messages.
      await mmUserFetch(`/users/${currentUser.id}/preferences`, token, {
        method: "PUT",
        body: JSON.stringify([
          {
            user_id: currentUser.id,
            category: "group_channel_show",
            name: channel.id,
            value: "false"
          }
        ])
      });
    } else {
      await mmUserFetch(`/channels/${encodeURIComponent(channelId)}/members/me`, token, { method: "DELETE" });

      // Track that the user manually left this community channel
      // so bootstrap doesn't auto-rejoin them
      if (channel.type === "O" && COMMUNITY_CHANNEL_NAME_PATTERN.test(channel.name)) {
        await addUserLeftChannel(currentUser.id, channel.name).catch((e) =>
          console.warn("Failed to record left channel", { channelId, error: e })
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleMattermostError(error);
  }
}
