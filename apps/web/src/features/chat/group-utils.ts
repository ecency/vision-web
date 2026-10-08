import type { MattermostReaction, MattermostUser } from "./mattermost-api";
import { getUserDisplayName } from "./format-utils";

/** Mattermost allows 3 to 8 members in a group, the creator included. */
export const GROUP_MIN_OTHERS = 2;
export const GROUP_MAX_OTHERS = 7;

export function isGroupChannel(channel?: { type?: string } | null) {
  return channel?.type === "G";
}

/** A direct message or a group: private conversations, listed together. */
export function isConversationChannel(channel?: { type?: string } | null) {
  return channel?.type === "D" || channel?.type === "G";
}

function shortName(user: MattermostUser) {
  return getUserDisplayName(user) || user.username;
}

/**
 * "alice, bob and carol", "alice, bob, carol +2". Shown wherever a group needs
 * a name: Mattermost's own display name for a group is the members' usernames
 * cut at 64 characters, and includes the viewer.
 */
export function getGroupTitle(users: MattermostUser[] | undefined, fallback: string, maxNames = 3) {
  const names = (users ?? []).map(shortName).filter(Boolean);
  if (!names.length) return fallback;
  if (names.length <= maxNames) {
    return names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, maxNames).join(", ")} +${names.length - maxNames}`;
}

export interface GroupedReaction {
  emojiName: string;
  userIds: string[];
  reacted: boolean;
}

/** One entry per emoji, in the order each emoji was first used. */
export function groupReactions(
  reactions: MattermostReaction[] | undefined,
  currentUserId?: string
): GroupedReaction[] {
  const byEmoji = new Map<string, GroupedReaction>();
  (reactions ?? []).forEach((reaction) => {
    const entry = byEmoji.get(reaction.emoji_name) ?? {
      emojiName: reaction.emoji_name,
      userIds: [],
      reacted: false
    };
    if (!entry.userIds.includes(reaction.user_id)) {
      entry.userIds.push(reaction.user_id);
    }
    if (currentUserId && reaction.user_id === currentUserId) {
      entry.reacted = true;
    }
    byEmoji.set(reaction.emoji_name, entry);
  });
  return Array.from(byEmoji.values());
}

/**
 * The name to show for a reactor. A reactor whose record has not loaded yet
 * reads as "someone" rather than as a raw id.
 */
export function getReactorName(
  userId: string,
  usersById: Record<string, MattermostUser>,
  currentUserId?: string
) {
  if (currentUserId && userId === currentUserId) return "You";
  const user = usersById[userId];
  if (!user) return "someone";
  return user.username ? `@${user.username}` : shortName(user);
}

/** "You, @alice and 3 others". Used for the reaction pill tooltip. */
export function formatReactorNames(
  userIds: string[],
  usersById: Record<string, MattermostUser>,
  currentUserId?: string,
  maxNames = 5
) {
  // The viewer first, as chat apps commonly do.
  const ordered = [...userIds].sort((a, b) =>
    a === currentUserId ? -1 : b === currentUserId ? 1 : 0
  );
  const names = ordered.map((id) => getReactorName(id, usersById, currentUserId));
  if (names.length <= maxNames) {
    return names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const rest = names.length - maxNames;
  return `${names.slice(0, maxNames).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/** Reactor ids that are not in the users map yet, for a batched lookup. */
export function findMissingReactorIds(
  posts: Array<{ metadata?: { reactions?: MattermostReaction[] } }>,
  usersById: Record<string, MattermostUser>
) {
  const missing = new Set<string>();
  posts.forEach((post) => {
    post.metadata?.reactions?.forEach((reaction) => {
      if (reaction.user_id && !usersById[reaction.user_id]) missing.add(reaction.user_id);
    });
  });
  return Array.from(missing).sort();
}
