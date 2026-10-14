import { NextResponse } from "next/server";
import {
  getMattermostTokenFromCookies,
  getPrivateTeamChannelAsAdmin,
  handleMattermostError,
  isMattermostNotFoundError,
  removeUserFromChannel,
  requireMattermostSuperAdmin
} from "@/server/mattermost";
import {
  addUsersToPrivateChannel,
  findChatUsers,
  notOnChatError,
  parseUsernames,
  PRIVATE_CHANNEL_MAX_ADD
} from "@/server/chat-private-channels";

type Params = { params: Promise<{ channelId: string }> };

/** Adds people to the private channel. Super-admin only. */
export async function POST(req: Request, { params }: Params) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const guard = await requireMattermostSuperAdmin(token);
    if (guard.response) {
      return guard.response;
    }

    const body = await req.json().catch(() => null);
    const usernames = parseUsernames(body?.usernames);
    if (!usernames?.length) {
      return NextResponse.json(
        { error: `usernames must be a list of 1 to ${PRIVATE_CHANNEL_MAX_ADD} names.` },
        { status: 400 }
      );
    }

    const { channelId } = await params;
    const channel = await getPrivateTeamChannelAsAdmin(channelId);
    if (!channel) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { users, missing } = await findChatUsers(usernames);
    if (missing.length) {
      return NextResponse.json({ error: notOnChatError(missing), missing }, { status: 404 });
    }

    await addUsersToPrivateChannel(channel.id, users);
    return NextResponse.json({ added: users.map((user) => user.username) });
  } catch (error) {
    return handleMattermostError(error);
  }
}

/** Removes one person from the private channel. Super-admin only. */
export async function DELETE(req: Request, { params }: Params) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const guard = await requireMattermostSuperAdmin(token);
    if (guard.response) {
      return guard.response;
    }

    const body = await req.json().catch(() => null);
    const [username] = parseUsernames(typeof body?.username === "string" ? [body.username] : null) ?? [];
    if (!username) {
      return NextResponse.json({ error: "username is required" }, { status: 400 });
    }

    const { channelId } = await params;
    const channel = await getPrivateTeamChannelAsAdmin(channelId);
    if (!channel) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Deactivated accounts can still be members, so look them up as they are.
    const { users } = await findChatUsers([username], { includeInactive: true });
    if (users.length) {
      await removeUserFromChannel(users[0].id, channel.id).catch((error) => {
        // Not a member: the requested end state already holds.
        if (!isMattermostNotFoundError(error)) throw error;
      });
    }
    return NextResponse.json({ removed: username });
  } catch (error) {
    return handleMattermostError(error);
  }
}
