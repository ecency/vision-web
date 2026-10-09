/**
 * Group names. Mattermost refuses to change the name or display name of a group
 * conversation, so a custom name is kept in the group's header, which members
 * may change and which Mattermost announces in the conversation when it does.
 *
 * Only the person who started the group may name it. That is recorded as a
 * preference on their own account when the group is first created, so every
 * region reads the same answer.
 */
export const GROUP_OWNER_PREF_CATEGORY = "ecency_group_owner";

/** Mattermost caps a channel header far higher; a name has to fit a sidebar. */
export const GROUP_NAME_MAX_LENGTH = 64;

/**
 * A group came back from create rather than being made just now when it is
 * older than the request plus this margin for clock drift between hosts.
 */
export const GROUP_CREATED_NOW_MARGIN_MS = 5_000;

/**
 * Trims, folds whitespace and drops control characters. Returns "" to clear
 * the name, or null when it is too long.
 */
export function normalizeGroupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (Array.from(name).length > GROUP_NAME_MAX_LENGTH) return null;
  return name;
}

export function wasCreatedNow(createAt: number | undefined, requestStartedAt: number) {
  return typeof createAt === "number" && createAt >= requestStartedAt - GROUP_CREATED_NOW_MARGIN_MS;
}
