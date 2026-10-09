import { NextResponse } from "next/server";
import {
  anyUserHasPreference,
  getMattermostTokenFromCookies,
  handleMattermostError,
  hasPreference,
  mmUserFetch
} from "@/server/mattermost";
import {
  GROUP_NAME_MAX_LENGTH,
  GROUP_OWNER_PREF_CATEGORY,
  normalizeGroupName
} from "@/server/chat-group-name";

/**
 * Names a group conversation, or clears its name with "". Only the person who
 * started the group may do it. A group started before owners were recorded
 * has no owner yet: the first member to name it becomes its owner.
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
        { error: `A group name can be up to ${GROUP_NAME_MAX_LENGTH} characters.` },
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
      return NextResponse.json({ error: "Only group conversations can be renamed here." }, { status: 400 });
    }

    const ownPreferences = await mmUserFetch<Array<{ category: string; name: string; value: string }>>(
      `/users/me/preferences`,
      token
    );
    const isOwner = hasPreference(ownPreferences, GROUP_OWNER_PREF_CATEGORY, channelId);

    let claim = false;
    if (!isOwner) {
      const members = await mmUserFetch<Array<{ id: string }>>(
        `/users?in_channel=${channelPath}&per_page=20`,
        token
      );
      const others = members.map((member) => member.id).filter((id) => id !== currentUser.id);
      if (await anyUserHasPreference(others, GROUP_OWNER_PREF_CATEGORY, channelId)) {
        return NextResponse.json(
          { error: "Only the person who started this group can rename it." },
          { status: 403 }
        );
      }
      claim = true;
    }

    if (normalizeGroupName(channel.header ?? "") !== name) {
      await mmUserFetch(`/channels/${channelPath}/patch`, token, {
        method: "PUT",
        body: JSON.stringify({ header: name })
      });
    }

    if (claim) {
      await mmUserFetch(`/users/${encodeURIComponent(currentUser.id)}/preferences`, token, {
        method: "PUT",
        body: JSON.stringify([
          { user_id: currentUser.id, category: GROUP_OWNER_PREF_CATEGORY, name: channelId, value: "true" }
        ])
      });
    }

    return NextResponse.json({ name });
  } catch (error) {
    return handleMattermostError(error);
  }
}
