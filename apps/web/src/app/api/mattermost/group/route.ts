import { NextRequest, NextResponse } from "next/server";
import {
  lookupMattermostUser,
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch
} from "@/server/mattermost";
import { getDmPrivacyRejection } from "@/server/chat-dm-privacy";
import { checkDmFanout, dmFanoutLimitFor } from "@/server/chat-dm-fanout";

// Mattermost group channels hold 3 to 8 members, the creator included.
const GROUP_MIN_OTHERS = 2;
const GROUP_MAX_OTHERS = 7;

/**
 * Opens (or returns the existing) group conversation between the current user
 * and 2 to 7 others. Every member must accept DMs from every other participant,
 * since a group lets them all write to each other. The creator's own setting
 * is not checked: choosing the members is their consent. Every member also counts as
 * a distinct recipient against the DM fan-out limit, so a group cannot be used
 * to reach more people than one-to-one messages would.
 */
export async function POST(req: NextRequest) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const raw: unknown = body?.usernames;

    if (
      !Array.isArray(raw) ||
      raw.length > GROUP_MAX_OTHERS * 2 ||
      raw.some((name) => typeof name !== "string")
    ) {
      return NextResponse.json({ error: "usernames must be an array of strings" }, { status: 400 });
    }

    const currentUser = await mmUserFetch<{ id: string; username: string; create_at?: number }>(
      `/users/me`,
      token
    );

    const usernames = Array.from(
      new Set(
        (raw as string[])
          .map((name) => name.trim().replace(/^@/, "").toLowerCase())
          .filter((name) => name && name !== currentUser.username.toLowerCase())
      )
    );

    if (usernames.length < GROUP_MIN_OTHERS || usernames.length > GROUP_MAX_OTHERS) {
      return NextResponse.json(
        {
          error: `A group needs between ${GROUP_MIN_OTHERS} and ${GROUP_MAX_OTHERS} other people.`
        },
        { status: 400 }
      );
    }

    const found = await Promise.all(usernames.map((name) => lookupMattermostUser(name)));
    const missing = usernames.filter((_, i) => !found[i]);
    if (missing.length) {
      return NextResponse.json(
        {
          error: `${missing.map((name) => `@${name}`).join(", ")} ${
            missing.length === 1 ? "is" : "are"
          } not on Ecency chat yet.`,
          missing
        },
        { status: 404 }
      );
    }

    const members = found.filter((user): user is NonNullable<typeof user> => !!user);

    const rejections = (
      await Promise.all(
        members.map((member) =>
          getDmPrivacyRejection(member, [
            currentUser.username,
            ...members.filter((other) => other.id !== member.id).map((other) => other.username)
          ])
        )
      )
    ).filter((rejection): rejection is NonNullable<typeof rejection> => !!rejection);

    if (rejections.length) {
      return NextResponse.json(
        {
          error: rejections.map((rejection) => rejection.error).join(" "),
          rejections
        },
        { status: 403 }
      );
    }

    const recipients = members.map((member) => member.id);
    const limit = dmFanoutLimitFor(currentUser.create_at, Date.now());
    if (recipients.length > limit) {
      return NextResponse.json(
        {
          error: `You can start a group with up to ${limit} other people for now.`,
          limit
        },
        { status: 403 }
      );
    }

    // Last check before the channel exists, mirroring the posts route: nothing
    // after this can reject the request except Mattermost itself.
    const fanout = await checkDmFanout({
      userId: currentUser.id,
      recipients,
      accountCreatedAt: currentUser.create_at
    });

    if (!fanout.allowed) {
      console.warn("MM group: DM fan-out limit reached", {
        username: currentUser.username,
        recipients: fanout.recipients,
        limit: fanout.limit
      });
      return NextResponse.json(
        {
          error:
            "You have started conversations with too many people recently. Please try again later.",
          retryAfter: fanout.retryAfterSeconds
        },
        { status: 429, headers: { "Retry-After": String(fanout.retryAfterSeconds) } }
      );
    }

    const channel = await mmUserFetch<{ id: string }>(`/channels/group`, token, {
      method: "POST",
      body: JSON.stringify([currentUser.id, ...recipients])
    });

    // Mattermost returns the existing group for the same members, which the
    // creator may have closed. Starting it again shows it again.
    await mmUserFetch(`/users/${encodeURIComponent(currentUser.id)}/preferences`, token, {
      method: "PUT",
      body: JSON.stringify([
        { user_id: currentUser.id, category: "group_channel_show", name: channel.id, value: "true" }
      ])
    }).catch((error) => console.warn("MM group: unable to reopen group", { error }));

    return NextResponse.json({ channelId: channel.id });
  } catch (error) {
    return handleMattermostError(error);
  }
}
