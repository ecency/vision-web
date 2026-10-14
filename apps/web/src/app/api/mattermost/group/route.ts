import { NextRequest, NextResponse } from "next/server";
import { callRPC } from "@ecency/sdk/hive";
import {
  getGroupOwnerId,
  getMattermostTeamId,
  lookupMattermostUser,
  getMattermostTokenFromCookies,
  handleMattermostError,
  isMattermostNotFoundError,
  mmUserFetch,
  setGroupOwnerId
} from "@/server/mattermost";
import { getDmPrivacyRejection } from "@/server/chat-dm-privacy";
import { checkDmFanout, dmFanoutLimitFor } from "@/server/chat-dm-fanout";
import { getGroupChannelName } from "@/server/chat-group-name";

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

    // A chat account is not proof of a Hive account. When Hive cannot be
    // asked, nobody is confirmed, so the group is not created.
    const onHive = await findHiveAccounts(usernames);
    if (!onHive) {
      return NextResponse.json(
        { error: "Unable to check these accounts right now. Please try again." },
        { status: 503, headers: { "Retry-After": "5" } }
      );
    }
    const notOnHive = usernames.filter((name) => !onHive.has(name));
    if (notOnHive.length) {
      return NextResponse.json(
        {
          error: `${notOnHive.map((name) => `@${name}`).join(", ")} ${
            notOnHive.length === 1 ? "is not a Hive account" : "are not Hive accounts"
          }.`,
          missing: notOnHive
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

    // Whether this exact group exists already decides who owns it: only the
    // person whose request creates it. Mattermost answers create with the
    // existing group either way, so look first. When the lookup fails, nobody
    // is made owner and the group has no name control.
    const memberIds = [currentUser.id, ...recipients];
    const existedBefore = await mmUserFetch(
      `/teams/${encodeURIComponent(getMattermostTeamId())}/channels/name/${getGroupChannelName(memberIds)}?include_deleted=true`,
      token
    ).then(
      () => true,
      (error) => (isMattermostNotFoundError(error) ? false : null)
    );

    const channel = await mmUserFetch<{ id: string }>(`/channels/group`, token, {
      method: "POST",
      body: JSON.stringify(memberIds)
    });

    if (existedBefore === false) {
      // The only moment ownership is written, so try twice before giving up.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (!(await getGroupOwnerId(channel.id, { fresh: true }))) {
            await setGroupOwnerId(channel.id, currentUser.id);
          }
          break;
        } catch (error) {
          if (attempt === 2) {
            console.error("MM group: unable to record the group owner", { error });
          }
        }
      }
    }

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

/** The given names that exist on Hive, or null when Hive could not be asked. */
async function findHiveAccounts(usernames: string[]): Promise<Set<string> | null> {
  try {
    const accounts = await callRPC("condenser_api.get_accounts", [usernames]);
    if (!Array.isArray(accounts)) return null;
    return new Set(
      accounts
        .map((account) => (account as { name?: unknown })?.name)
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.toLowerCase())
    );
  } catch {
    return null;
  }
}
