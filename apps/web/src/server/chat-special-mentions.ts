import { isMattermostSuperAdmin, MattermostUser } from "@/server/mattermost";

/** Mentions that notify a whole channel. Mattermost honours @here, @channel and @all. */
export const SPECIAL_MENTIONS = new Set(["here", "everyone", "channel", "all"]);

// Mattermost reads "@all." as @all but "@all-stars" or "@all.x" as a username,
// so the mention ends where a username could not go on.
const SPECIAL_MENTION_REGEX = /(^|[^a-z0-9_.@-])@(here|everyone|channel|all)(?![a-z0-9_-]|\.[a-z0-9])/i;

export function hasChannelWideMention(message: string) {
  return SPECIAL_MENTION_REGEX.test(message);
}

/** Community moderators may notify their channel; the chat admin may notify any channel. */
export function canMentionEveryone(moderation: {
  canModerate: boolean;
  currentUser: Pick<MattermostUser, "username" | "roles">;
}) {
  return moderation.canModerate || isMattermostSuperAdmin(moderation.currentUser);
}

export const CHANNEL_WIDE_MENTION_FORBIDDEN =
  "Only moderators can mention everyone in this channel.";
