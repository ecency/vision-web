import i18next from "i18next";
import type { MattermostReaction, MattermostUser } from "./mattermost-api";
import { getUserDisplayName } from "./format-utils";

/** Mattermost allows 3 to 8 members in a group, the creator included. */
export const GROUP_MIN_OTHERS = 2;
export const GROUP_MAX_OTHERS = 7;

/** Characters (code points) a group name may have. Checked on the server too. */
export const GROUP_NAME_MAX_LENGTH = 64;

/** The length of a group name as the server counts it, so emoji count as one. */
export function groupNameLength(name: string): number {
  return Array.from(name.trim()).length;
}

export function isGroupChannel(channel?: { type?: string } | null) {
  return channel?.type === "G";
}

/** A direct message or a group: private conversations, listed together. */
export function isConversationChannel(channel?: { type?: string } | null) {
  return channel?.type === "D" || channel?.type === "G";
}

/** "a, b and c" in the reader's language. */
function joinNames(names: string[]) {
  try {
    return new Intl.ListFormat(i18next.language || "en", { style: "long", type: "conjunction" }).format(
      names
    );
  } catch {
    return names.join(", ");
  }
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
  if (names.length <= maxNames) return joinNames(names);
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
  if (currentUserId && userId === currentUserId) return i18next.t("chat.reactor-you");
  const user = usersById[userId];
  if (!user) return i18next.t("chat.reactor-unknown");
  return user.username ? `@${user.username}` : shortName(user);
}

/** "You, @alice and 3 more". Used for the reaction pill tooltip. */
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
  if (names.length <= maxNames) return joinNames(names);
  return i18next.t("chat.reactors-more", {
    names: names.slice(0, maxNames).join(", "),
    count: names.length - maxNames
  });
}

/**
 * Authors and reactors that are not in the users map yet, for a batched lookup.
 * A message or a reaction that arrives live can come from someone the loaded
 * pages never mentioned, such as the first message in a new group.
 */
export function findMissingUserIds(
  posts: Array<{ user_id?: string; metadata?: { reactions?: MattermostReaction[] } }>,
  usersById: Record<string, MattermostUser>
) {
  const missing = new Set<string>();
  const check = (userId?: string) => {
    if (userId && !usersById[userId]) missing.add(userId);
  };
  posts.forEach((post) => {
    check(post.user_id);
    post.metadata?.reactions?.forEach((reaction) => check(reaction.user_id));
  });
  return Array.from(missing).sort();
}
