import i18next from "i18next";
import { dateToFullRelative, dateToFormatted } from "@/utils/parse-date";
import type { MattermostPost, MattermostUser } from "./mattermost-api";

/**
 * Format timestamp to short format (e.g., "Jan 1, 12:00 PM")
 */
export function formatTimestamp(timestamp: number): string {
  // Convert millisecond timestamp to ISO string for parse-date utils
  const isoString = new Date(timestamp).toISOString();
  return dateToFormatted(isoString, "MMM D, h:mm A");
}

/**
 * Format timestamp to relative time (e.g., "5 minutes ago", "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
  // Convert millisecond timestamp to ISO string for parse-date utils
  const isoString = new Date(timestamp).toISOString();
  return dateToFullRelative(isoString);
}

/**
 * Get display name for a user (full name > nickname > @username)
 */
export function getUserDisplayName(user?: MattermostUser): string | undefined {
  if (!user) return undefined;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (fullName) return fullName;

  if (user.nickname) return user.nickname;

  if (user.username) return `@${user.username}`;

  return undefined;
}

/**
 * Get display name from a post (handles bot posts and system messages)
 */
export function getPostDisplayName(
  post: MattermostPost,
  usersById: Record<string, MattermostUser>,
  normalizeUsername: (username?: string | null) => string | undefined
): string {
  const formatUsernameWithAt = (username?: string | null) => {
    if (!username) return undefined;
    return username.startsWith("@") ? username : `@${username}`;
  };

  if (post.type === "system_add_to_channel") {
    const addedUserId = post.props?.addedUserId;
    const addedUser = addedUserId ? usersById[addedUserId] : undefined;

    if (addedUser) {
      return getUserDisplayName(addedUser) || `@${addedUser.username}`;
    }

    const addedUsername = formatUsernameWithAt(normalizeUsername(post.props?.addedUsername));
    if (addedUsername) return addedUsername;
  }

  const user = usersById[post.user_id];

  if (user) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
    if (fullName) return fullName;

    if (user.nickname) return user.nickname;

    if (user.username) return `@${user.username}`;
  }

  const fallbackUsername =
    formatUsernameWithAt(normalizeUsername(post.props?.override_username as string | undefined)) ||
    formatUsernameWithAt(normalizeUsername(post.props?.username)) ||
    formatUsernameWithAt(normalizeUsername(post.props?.addedUsername));
  if (fallbackUsername) return fallbackUsername;

  return post.user_id || "Unknown user";
}

/**
 * Get username from a post (handles bot posts)
 */
export function getPostUsername(
  post: MattermostPost,
  usersById: Record<string, MattermostUser>,
  normalizeUsername: (username?: string | null) => string | undefined
): string | undefined {
  if (post.type === "system_add_to_channel") {
    const addedUserId = post.props?.addedUserId;
    const addedUser = addedUserId ? usersById[addedUserId] : undefined;

    if (addedUser?.username) return addedUser.username;

    const addedUsername = normalizeUsername(post.props?.addedUsername);
    if (addedUsername) return addedUsername;
  }

  const user = usersById[post.user_id];

  if (user?.username) return user.username;

  const fallbackUsername =
    normalizeUsername(post.props?.username) ||
    normalizeUsername(post.props?.override_username as string | undefined) ||
    normalizeUsername(post.props?.addedUsername);

  return fallbackUsername;
}

/**
 * Get display name for user who was added in a system message
 */
export function getAddedUserDisplayName(
  post: MattermostPost,
  usersById: Record<string, MattermostUser>
): string {
  const formatUsernameWithAt = (username?: string | null) => {
    if (!username) return undefined;
    return username.startsWith("@") ? username : `@${username}`;
  };

  const addedUserId = post.props?.addedUserId;
  if (addedUserId && usersById[addedUserId]) {
    const user = usersById[addedUserId];
    const usernameWithAt = formatUsernameWithAt(user.username);

    return usernameWithAt || getUserDisplayName(user) || "Someone";
  }

  return formatUsernameWithAt(post.props?.addedUsername) || "Someone";
}

/**
 * Get display message for a post (handles system messages)
 */
/**
 * Posts shown as a centered notice rather than as someone's message: a member
 * joining, and a group being renamed.
 */
export function isChannelNoticePost(post: Pick<MattermostPost, "type">) {
  return post.type === "system_add_to_channel" || post.type === "system_header_change";
}

/**
 * Mattermost announces a header change; in a group the header is its name
 * (see server/chat-group-name). Plain text: show it without markdown.
 */
export function getGroupRenameText(post: MattermostPost): string {
  const name = typeof post.props?.new_header === "string" ? post.props.new_header.trim() : "";
  return name ? i18next.t("chat.group-renamed", { name }) : i18next.t("chat.group-name-cleared");
}

export function getDisplayMessage(post: MattermostPost): string {
  if (post.type === "system_add_to_channel") {
    return "joined the channel";
  }

  return post.message;
}

/**
 * Get avatar URL for a user
 */
export function getAvatarUrl(user: MattermostUser | undefined): string | undefined {
  if (!user?.id) return undefined;

  const cacheBuster = user.last_picture_update ? `?_=${user.last_picture_update}` : "";
  return `/api/mattermost/users/${user.id}/image${cacheBuster}`;
}
