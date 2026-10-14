import { NextResponse } from "next/server";
import {
  deleteMattermostPostAsAdmin,
  getMattermostCommunityModerationContext,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch
} from "@/server/mattermost";
import {
  CHANNEL_WIDE_MENTION_FORBIDDEN,
  canMentionEveryone,
  hasChannelWideMention
} from "@/server/chat-special-mentions";

export async function DELETE(_req: Request, { params }: { params: Promise<{ channelId: string; postId: string }> }) {
  const { channelId, postId } = await params;
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const moderation = await getMattermostCommunityModerationContext(token, channelId);
    const post = await mmUserFetch<{ user_id: string; channel_id: string }>(
      `/posts/${encodeURIComponent(postId)}`,
      token
    );
    // Moderation rights belong to the channel in the URL, so they only reach
    // posts in that channel.
    if (post.channel_id !== moderation.channel.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const isAuthor = post.user_id === moderation.currentUser.id;

    if (!isAuthor && !moderation.canModerate) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (isAuthor) {
      await mmUserFetch(`/posts/${encodeURIComponent(postId)}`, token, { method: "DELETE" });
    } else {
      await deleteMattermostPostAsAdmin(postId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleMattermostError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ channelId: string; postId: string }> }) {
  const { channelId, postId } = await params;
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const message = (body?.message as string | undefined)?.trim();

    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    // The edit lands on the post's own channel, so that is the one checked.
    const existing = await mmUserFetch<{ channel_id: string }>(
      `/posts/${encodeURIComponent(postId)}`,
      token
    );
    if (existing.channel_id !== channelId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (hasChannelWideMention(message)) {
      const moderation = await getMattermostCommunityModerationContext(token, channelId);

      if (!canMentionEveryone(moderation)) {
        return NextResponse.json({ error: CHANNEL_WIDE_MENTION_FORBIDDEN }, { status: 403 });
      }
    }

    const post = await mmUserFetch(`/posts/${encodeURIComponent(postId)}/patch`, token, {
      method: "PUT",
      body: JSON.stringify({ message })
    });

    return NextResponse.json({ post });
  } catch (error) {
    return handleMattermostError(error);
  }
}
