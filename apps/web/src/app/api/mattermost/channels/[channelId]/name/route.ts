import { NextResponse } from "next/server";
import {
  getGroupOwnerId,
  getMattermostTokenFromCookies,
  handleMattermostError,
  isGroupOwnerMissing,
  mmUserFetch,
  setGroupOwnerId
} from "@/server/mattermost";
import { GROUP_NAME_MAX_LENGTH, normalizeGroupName } from "@/server/chat-group-name";

/**
 * Names a group conversation, or clears its name with "". Only the group's
 * owner may do it. A group with no owner yet, such as one started before
 * owners were recorded, is claimed by the first member who names it.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { channelId } = await params;
    const body = await req.json().catch(() => null);
    const name = normalizeGroupName(body?.name);
    if (name === null) {
      return NextResponse.json(
        { error: `A group name can be up to ${GROUP_NAME_MAX_LENGTH} characters.`, code: "too_long" },
        { status: 400 }
      );
    }

    const channelPath = encodeURIComponent(channelId);
    // Reading the channel as the caller also proves they are in it.
    const [channel, currentUser] = await Promise.all([
      mmUserFetch<{ id: string; type: string; header?: string }>(`/channels/${channelPath}`, token),
      mmUserFetch<{ id: string }>(`/users/me`, token)
    ]);

    if (channel.type !== "G") {
      return NextResponse.json(
        { error: "Only group conversations can be renamed here.", code: "not_group" },
        { status: 400 }
      );
    }

    const forbidden = () =>
      NextResponse.json(
        { error: "Only the person who started this group can rename it.", code: "not_owner" },
        { status: 403 }
      );

    const ownerId = await getGroupOwnerId(channel.id, { fresh: true });
    if (ownerId && ownerId !== currentUser.id) {
      return forbidden();
    }

    if (!ownerId) {
      // A failed read can look like "no owner"; make sure before claiming.
      if (!(await isGroupOwnerMissing(channel.id))) {
        return forbidden();
      }
      // Claim, then read back, so a claim another member made just before
      // wins over this one.
      await setGroupOwnerId(channel.id, currentUser.id);
      const confirmed = await getGroupOwnerId(channel.id, { fresh: true });
      if (confirmed !== currentUser.id) {
        return forbidden();
      }
    }

    if (normalizeGroupName(channel.header ?? "") !== name) {
      await mmUserFetch(`/channels/${channelPath}/patch`, token, {
        method: "PUT",
        body: JSON.stringify({ header: name })
      });
    }

    return NextResponse.json({ name });
  } catch (error) {
    return handleMattermostError(error);
  }
}
