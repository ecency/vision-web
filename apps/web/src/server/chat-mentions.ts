/**
 * Adding @mentioned people to a public channel, so the mention reaches them.
 *
 * Bounded on three sides, since every added person is pulled into a channel
 * and notified on someone else's say-so:
 * - only the first MAX_MENTION_JOINS distinct mentions of a message are looked at
 * - only people who already have an active chat account are added; nobody is
 *   provisioned or reactivated by being mentioned
 * - the people added count as recipients in the sender's DM fan-out limit,
 *   all or nothing, the same as if each had been messaged directly
 */
import { checkDmFanout } from "./chat-dm-fanout";
import {
  ensureUserInChannel,
  ensureUserInTeam,
  isUserInChannel,
  lookupMattermostUser
} from "./mattermost";

export const MAX_MENTION_JOINS = 10;

export interface MentionJoinResult {
  added: string[];
  /** Set when the fan-out limit refused the whole batch. */
  limited?: boolean;
}

export async function addMentionedUsersToChannel({
  channelId,
  senderId,
  senderCreatedAt,
  usernames
}: {
  channelId: string;
  senderId: string;
  senderCreatedAt?: number;
  usernames: string[];
}): Promise<MentionJoinResult> {
  const candidates = await Promise.all(
    usernames.slice(0, MAX_MENTION_JOINS).map(async (username) => {
      try {
        const user = await lookupMattermostUser(username);
        if (!user || user.delete_at > 0 || user.id === senderId) return null;
        return (await isUserInChannel(user.id, channelId)) ? null : user;
      } catch (error) {
        console.error("Unable to resolve mentioned user", { username, error });
        return null;
      }
    })
  );

  const joiners = candidates.filter((user): user is NonNullable<typeof user> => Boolean(user));
  if (!joiners.length) return { added: [] };

  const fanout = await checkDmFanout({
    userId: senderId,
    recipients: joiners.map((user) => user.id),
    accountCreatedAt: senderCreatedAt
  });

  if (!fanout.allowed) {
    console.warn("MM posts: mention auto-join over the fan-out limit", {
      senderId,
      joiners: joiners.length,
      limit: fanout.limit
    });
    return { added: [], limited: true };
  }

  const added: string[] = [];
  for (const user of joiners) {
    try {
      await ensureUserInTeam(user.id);
      await ensureUserInChannel(user.id, channelId);
      added.push(user.id);
    } catch (error) {
      console.error("Unable to add mentioned user to channel", { username: user.username, error });
    }
  }
  return { added };
}
