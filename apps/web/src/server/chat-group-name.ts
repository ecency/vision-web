import { createHash } from "crypto";
import { GROUP_NAME_MAX_LENGTH } from "@/features/chat/group-utils";

/**
 * Group names. Mattermost refuses to change the name or display name of a group
 * conversation, so a custom name is kept in the group's header, which members
 * may change and which Mattermost announces in the conversation when it does.
 * Who may rename a group is kept apart, see getGroupOwnerId.
 */
export { GROUP_NAME_MAX_LENGTH };

/**
 * Trims, folds whitespace and drops control, zero width and direction
 * characters. The zero width joiner and non-joiner stay: emoji sequences and
 * several scripts need them. Returns "" to clear the name, or null when it is
 * too long or not text.
 */
export function normalizeGroupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (Array.from(name).length > GROUP_NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * The internal name Mattermost gives the group of exactly these members, so a
 * group can be looked up before it is created. Mirrors
 * model.GetGroupNameFromUserIds: SHA-1 over the sorted ids, hex encoded.
 */
export function getGroupChannelName(userIds: string[]): string {
  const hash = createHash("sha1");
  [...userIds].sort().forEach((id) => hash.update(id));
  return hash.digest("hex");
}
