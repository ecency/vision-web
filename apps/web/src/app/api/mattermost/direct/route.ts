import { NextRequest, NextResponse } from "next/server";
import {
  findMattermostUser,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch,
  MattermostUser
} from "@/server/mattermost";
import { getDmPrivacyRejection } from "@/server/chat-dm-privacy";

export async function POST(req: NextRequest) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const username = (body.username as string | undefined)?.trim().replace(/^@/, "");

    if (!username) {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }

    // Fetch both users in parallel - they don't depend on each other
    const [targetUser, currentUser] = await Promise.all([
      findMattermostUser(username),
      mmUserFetch<MattermostUser>(`/users/me`, token)
    ]);

    if (!targetUser) {
      return NextResponse.json(
        { error: `@${username} is not on Ecency chat yet.` },
        { status: 404 }
      );
    }

    const rejection = await getDmPrivacyRejection(targetUser, [currentUser.username]);
    if (rejection) {
      return NextResponse.json(rejection, { status: 403 });
    }

    const channel = await mmUserFetch<{ id: string }>(`/channels/direct`, token, {
      method: "POST",
      body: JSON.stringify([currentUser.id, targetUser.id])
    });

    return NextResponse.json({ channelId: channel.id });
  } catch (error) {
    return handleMattermostError(error);
  }
}
