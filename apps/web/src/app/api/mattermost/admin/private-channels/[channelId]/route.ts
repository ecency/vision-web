import { NextResponse } from "next/server";
import {
  getMattermostTokenFromCookies,
  getPrivateTeamChannelAsAdmin,
  handleMattermostError,
  listChannelMembersAsAdmin,
  renameChannelAsAdmin,
  requireMattermostSuperAdmin
} from "@/server/mattermost";
import {
  normalizePrivateChannelName,
  PRIVATE_CHANNEL_NAME_MAX_LENGTH
} from "@/server/chat-private-channels";

type Params = { params: Promise<{ channelId: string }> };

/** The private channel's name and members, for the manage dialog. Super-admin only. */
export async function GET(_req: Request, { params }: Params) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const guard = await requireMattermostSuperAdmin(token);
    if (guard.response) {
      return guard.response;
    }

    const { channelId } = await params;
    const channel = await getPrivateTeamChannelAsAdmin(channelId);
    if (!channel) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const members = await listChannelMembersAsAdmin(channel.id);
    return NextResponse.json({
      channel: { id: channel.id, display_name: channel.display_name },
      members
    });
  } catch (error) {
    return handleMattermostError(error);
  }
}

/** Renames the private channel. Super-admin only. */
export async function PUT(req: Request, { params }: Params) {
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

    const { channelId } = await params;
    const channel = await getPrivateTeamChannelAsAdmin(channelId);
    if (!channel) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (channel.display_name !== name) {
      await renameChannelAsAdmin(channel.id, name);
    }
    return NextResponse.json({ name });
  } catch (error) {
    return handleMattermostError(error);
  }
}
