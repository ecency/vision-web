import { NextRequest, NextResponse } from "next/server";
import {
  ensureUserInChannel,
  getMattermostTokenFromCookies,
  handleMattermostError,
  MattermostChannel,
  mmUserFetch
} from "@/server/mattermost";

/**
 * Reacting in a public channel joins it, as reading one by link does. The join
 * uses the admin token, so it is limited to public channels, which the caller
 * can read anyway, and to posts that are really in the channel. Any other
 * channel stays as Mattermost has it: a private one cannot be joined this way.
 * Returns false when the post is not in the channel.
 */
async function joinIfPublicAndOwnsPost(token: string, userId: string, channelId: string, postId: string) {
  const channel = await mmUserFetch<MattermostChannel>(`/channels/${encodeURIComponent(channelId)}`, token);
  // Checked before joining, so a mismatched request changes no membership.
  const post = await mmUserFetch<{ channel_id: string }>(`/posts/${encodeURIComponent(postId)}`, token);
  if (post.channel_id !== channel.id) return false;
  if (channel.type === "O") {
    await ensureUserInChannel(userId, channel.id);
  }
  return true;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string; postId: string }> }) {
  const { channelId, postId } = await params;
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const emoji = (body.emoji as string | undefined)?.trim();

    if (!emoji) {
      return NextResponse.json({ error: "emoji required" }, { status: 400 });
    }

    const user = await mmUserFetch<{ id: string }>(`/users/me`, token);

    if (!(await joinIfPublicAndOwnsPost(token, user.id, channelId, postId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const reaction = await mmUserFetch<{ user_id: string; post_id: string; emoji_name: string }>(
      `/reactions`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, post_id: postId, emoji_name: emoji })
      }
    );

    return NextResponse.json(reaction);
  } catch (error) {
    return handleMattermostError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ channelId: string; postId: string }> }) {
  const { channelId, postId } = await params;
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const emoji = (body.emoji as string | undefined)?.trim();

    if (!emoji) {
      return NextResponse.json({ error: "emoji required" }, { status: 400 });
    }

    const user = await mmUserFetch<{ id: string }>(`/users/me`, token);

    if (!(await joinIfPublicAndOwnsPost(token, user.id, channelId, postId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    await mmUserFetch(
      `/users/${user.id}/posts/${encodeURIComponent(postId)}/reactions/${encodeURIComponent(emoji)}`,
      token,
      {
        method: "DELETE"
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleMattermostError(error);
  }
}
