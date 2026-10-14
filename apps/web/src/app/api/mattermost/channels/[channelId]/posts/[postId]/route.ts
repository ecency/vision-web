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
    const post = await mmUserFetch<{ user_id: string }>(`/posts/${encodeURIComponent(postId)}`, token);

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
