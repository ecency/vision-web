import { NextResponse } from "next/server";
import {
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch,
  toPublicChatUserMap
} from "@/server/mattermost";

interface MattermostUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  last_picture_update?: number;
}

export async function GET(_req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { channelId } = await params;

  try {
    // Fetch pinned posts from Mattermost
    const response = await mmUserFetch<{
      posts: Record<string, any>;
      order: string[];
    }>(`/channels/${encodeURIComponent(channelId)}/pinned`, token);

    const posts = response.posts;
    const order = response.order;

    // Convert to array and sort by creation time
    const orderedPosts = order
      .map((id) => posts[id])
      .filter(Boolean)
      .sort((a, b) => Number(a.create_at) - Number(b.create_at));

    // Fetch user data for post authors
    const userIds = Array.from(
      new Set(orderedPosts.map((post) => post.user_id).filter(Boolean))
    );

    let users: Record<string, MattermostUser> = {};

    if (userIds.length > 0) {
      const fetchedUsers = await mmUserFetch<MattermostUser[]>(
        "/users/ids",
        token,
        {
          method: "POST",
          body: JSON.stringify(userIds)
        }
      );

      users = fetchedUsers.reduce<Record<string, MattermostUser>>(
        (acc, user) => {
          acc[user.id] = user;
          return acc;
        },
        {}
      );
    }

    return NextResponse.json({
      posts: orderedPosts,
      users: toPublicChatUserMap(users)
    });
  } catch (error) {
    return handleMattermostError(error);
  }
}
