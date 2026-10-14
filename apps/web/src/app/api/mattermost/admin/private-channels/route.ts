import { NextResponse } from "next/server";
import {
  createPrivateTeamChannel,
  getMattermostTokenFromCookies,
  handleMattermostError,
  requireMattermostSuperAdmin
} from "@/server/mattermost";
import {
  addUsersToPrivateChannel,
  findChatUsers,
  normalizePrivateChannelName,
  notOnChatError,
  parseUsernames,
  PRIVATE_CHANNEL_MAX_ADD,
  PRIVATE_CHANNEL_NAME_MAX_LENGTH
} from "@/server/chat-private-channels";

/**
 * Creates a private channel with a name and its first members. Super-admin
 * only: regular users start group conversations instead, which are small and
 * fixed, so private channels never need DM privacy or fan-out checks.
 */
export async function POST(req: Request) {
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
    const name = normalizePrivateChannelName(body?.name);
    if (!name) {
      return NextResponse.json(
        { error: `A channel name is required, up to ${PRIVATE_CHANNEL_NAME_MAX_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const usernames = parseUsernames(body?.usernames ?? []);
    if (!usernames) {
      return NextResponse.json(
        { error: `usernames must be a list of up to ${PRIVATE_CHANNEL_MAX_ADD} names.` },
        { status: 400 }
      );
    }

    const others = usernames.filter((username) => username !== guard.user.username.toLowerCase());
    const { users, missing } = await findChatUsers(others);
    if (missing.length) {
      return NextResponse.json({ error: notOnChatError(missing), missing }, { status: 404 });
    }

    const channel = await createPrivateTeamChannel(token, name);

    try {
      await addUsersToPrivateChannel(channel.id, users);
    } catch (error) {
      // The channel exists and is listed for its creator, who can add the rest
      // from the manage dialog, so answer with it rather than fail.
      console.error("MM private channel: unable to add every member", { channelId: channel.id, error });
      return NextResponse.json({ channelId: channel.id, incomplete: true });
    }

    return NextResponse.json({ channelId: channel.id });
  } catch (error) {
    return handleMattermostError(error);
  }
}
