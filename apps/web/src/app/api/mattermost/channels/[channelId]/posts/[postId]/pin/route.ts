import { NextResponse } from "next/server";
import {
  getMattermostCommunityModerationContext,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch
} from "@/server/mattermost";
import { canPinInChannel } from "@/features/chat/utils/pin-permission";

export async function POST(_req: Request, { params }: { params: Promise<{ channelId: string; postId: string }> }) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { channelId, postId } = await params;

  try {
    const moderation = await getMattermostCommunityModerationContext(token, channelId);
    if (!(await isPostInChannel(token, postId, moderation.channel.id))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const denied = await pinDenied(token, channelId, moderation, "pin");
    if (denied) return denied;

    // Check 5-pin limit before pinning (server-side enforcement)
    const pinnedResponse = await mmUserFetch<{
      posts: Record<string, any>;
      order: string[];
    }>(`/channels/${encodeURIComponent(channelId)}/pinned`, token);

    if (pinnedResponse.order && pinnedResponse.order.length >= 5) {
      return NextResponse.json(
        { error: "Cannot pin more than 5 messages per channel" },
        { status: 400 }
      );
    }

    // Pin the post via Mattermost API
    await mmUserFetch(`/posts/${encodeURIComponent(postId)}/pin`, token, {
      method: "POST"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleMattermostError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ channelId: string; postId: string }> }) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { channelId, postId } = await params;

  try {
    const moderation = await getMattermostCommunityModerationContext(token, channelId);
    if (!(await isPostInChannel(token, postId, moderation.channel.id))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const denied = await pinDenied(token, channelId, moderation, "unpin");
    if (denied) return denied;

    // Unpin the post via Mattermost API
    await mmUserFetch(`/posts/${encodeURIComponent(postId)}/unpin`, token, {
      method: "POST"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleMattermostError(error);
  }
}

// Community moderators, and the two people of a direct message; see
// canPinInChannel. Membership is only looked up for a direct message, the one
// case where it decides.
async function pinDenied(
  token: string,
  channelId: string,
  moderation: { channel: { type?: string }; canModerate: boolean },
  verb: "pin" | "unpin"
) {
  const type = moderation.channel.type;
  const isMember =
    !moderation.canModerate && type === "D"
      ? !!(await mmUserFetch(`/channels/${encodeURIComponent(channelId)}/members/me`, token).catch(() => null))
      : false;
  if (canPinInChannel({ type, isMember, canModerate: moderation.canModerate })) return null;
  const error =
    type === "O"
      ? `Only community moderators can ${verb} messages in this channel.`
      : `Only the people in a direct message can ${verb} messages here.`;
  return NextResponse.json({ error }, { status: 403 });
}

// The checks above are for the channel in the URL, so they only cover its posts.
async function isPostInChannel(token: string, postId: string, channelId: string) {
  const post = await mmUserFetch<{ channel_id: string }>(`/posts/${encodeURIComponent(postId)}`, token);
  return post.channel_id === channelId;
}
