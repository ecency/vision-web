import { NextResponse } from "next/server";
import {
  getMattermostCommunityModerationContext,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch
} from "@/server/mattermost";

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

    // Check permissions based on channel type
    if (moderation.channel.type === "O") {
      // Public/community channel - only moderators can pin
      if (!moderation.canModerate) {
        return NextResponse.json(
          { error: "Only community moderators can pin messages in this channel." },
          { status: 403 }
        );
      }
    } else if (moderation.channel.type === "D" || moderation.channel.type === "G") {
      // Direct message or group message - check membership
      const member = await mmUserFetch(
        `/channels/${encodeURIComponent(channelId)}/members/me`,
        token
      ).catch(() => null);

      if (!member) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

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

    // Check permissions based on channel type
    if (moderation.channel.type === "O") {
      // Public/community channel - only moderators can unpin
      if (!moderation.canModerate) {
        return NextResponse.json(
          { error: "Only community moderators can unpin messages in this channel." },
          { status: 403 }
        );
      }
    } else if (moderation.channel.type === "D" || moderation.channel.type === "G") {
      // Direct message or group message - check membership
      const member = await mmUserFetch(
        `/channels/${encodeURIComponent(channelId)}/members/me`,
        token
      ).catch(() => null);

      if (!member) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    // Unpin the post via Mattermost API
    await mmUserFetch(`/posts/${encodeURIComponent(postId)}/unpin`, token, {
      method: "POST"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleMattermostError(error);
  }
}

// The checks above are for the channel in the URL, so they only cover its posts.
async function isPostInChannel(token: string, postId: string, channelId: string) {
  const post = await mmUserFetch<{ channel_id: string }>(`/posts/${encodeURIComponent(postId)}`, token);
  return post.channel_id === channelId;
}
