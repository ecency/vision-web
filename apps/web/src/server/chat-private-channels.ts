import {
  ensureUserInChannel,
  ensureUserInTeam,
  lookupMattermostUser,
  MattermostUser
} from "@/server/mattermost";

// Mattermost caps a channel's display name at 64 characters.
export const PRIVATE_CHANNEL_NAME_MAX_LENGTH = 64;
// How many people one request may add. More can be added in further requests.
export const PRIVATE_CHANNEL_MAX_ADD = 100;
const LOOKUP_CONCURRENCY = 10;

/** The trimmed name with inner whitespace collapsed, or null when empty or too long. */
export function normalizePrivateChannelName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || Array.from(name).length > PRIVATE_CHANNEL_NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * Lowercased usernames without "@" and duplicates, or null when the input is
 * not a list of strings or names more people than one request may add.
 */
export function parseUsernames(raw: unknown): string[] | null {
  if (
    !Array.isArray(raw) ||
    raw.length > PRIVATE_CHANNEL_MAX_ADD * 2 ||
    raw.some((name) => typeof name !== "string")
  ) {
    return null;
  }
  const usernames = Array.from(
    new Set((raw as string[]).map((name) => name.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))
  );
  return usernames.length > PRIVATE_CHANNEL_MAX_ADD ? null : usernames;
}

/**
 * Chat accounts for the names. Deactivated ones count as missing unless asked
 * for, since adding them gives them nothing.
 */
export async function findChatUsers(usernames: string[], { includeInactive = false } = {}) {
  const found: (MattermostUser | null)[] = [];
  for (let i = 0; i < usernames.length; i += LOOKUP_CONCURRENCY) {
    const batch = await Promise.all(
      usernames.slice(i, i + LOOKUP_CONCURRENCY).map((name) => lookupMattermostUser(name))
    );
    found.push(...batch.map((user) => (user && (includeInactive || !user.delete_at) ? user : null)));
  }
  return {
    users: found.filter((user): user is MattermostUser => !!user),
    missing: usernames.filter((_, i) => !found[i])
  };
}

export function notOnChatError(missing: string[]) {
  return `${missing.map((name) => `@${name}`).join(", ")} ${
    missing.length === 1 ? "is" : "are"
  } not on Ecency chat yet.`;
}

const ADD_CONCURRENCY = 5;

/** Adds each user to the chat team, if needed, and then to the channel. */
export async function addUsersToPrivateChannel(channelId: string, users: Pick<MattermostUser, "id">[]) {
  for (let i = 0; i < users.length; i += ADD_CONCURRENCY) {
    await Promise.all(
      users.slice(i, i + ADD_CONCURRENCY).map(async (user) => {
        await ensureUserInTeam(user.id);
        await ensureUserInChannel(user.id, channelId);
      })
    );
  }
}
