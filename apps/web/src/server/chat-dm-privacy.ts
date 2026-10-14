import { getRelationshipBetweenAccountsQueryOptions } from "@ecency/sdk";
import { getQueryClient } from "@/core/react-query";
import { getMattermostUserWithProps, getUserDmPrivacy, MattermostUser } from "@/server/mattermost";

export interface DmPrivacyRejection {
  error: string;
  privacy_level: "none" | "followers";
  target_username: string;
}

/**
 * Whether every one of `senders` may reach `target` under the target's DM
 * privacy setting. Returns the rejection to send back, or null when allowed.
 * One-to-one creation passes the creator alone. A group passes every other
 * participant, because in a group they can all message the target, so a
 * "followers only" member must follow each of them, not just the creator.
 */
export async function getDmPrivacyRejection(
  target: Pick<MattermostUser, "id" | "username">,
  senderUsernames: string[]
): Promise<DmPrivacyRejection | null> {
  const targetWithProps = await getMattermostUserWithProps(target.id);
  const dmPrivacy = getUserDmPrivacy(targetWithProps);

  if (dmPrivacy === "none") {
    return {
      error: `@${target.username} has disabled direct messages from all users.`,
      privacy_level: "none",
      target_username: target.username
    };
  }

  if (dmPrivacy === "followers") {
    // Hive refuses the lookup outright for a name it does not know. Such a name
    // cannot be followed, so it counts as no follow instead of a server error.
    // Any other failure is an outage and still fails the request.
    const relationships = await Promise.all(
      senderUsernames.map((sender) =>
        getQueryClient()
          .fetchQuery(getRelationshipBetweenAccountsQueryOptions(target.username, sender))
          .catch((error: unknown) => {
            if (isUnknownAccountError(error)) return null;
            throw error;
          })
      )
    );
    const unfollowed = senderUsernames.filter((_, i) => !relationships[i]?.follows);

    if (unfollowed.length) {
      return {
        error:
          senderUsernames.length === 1
            ? `@${target.username} only accepts messages from accounts they follow.`
            : `@${target.username} only accepts messages from accounts they follow, which excludes ${unfollowed
                .map((name) => `@${name}`)
                .join(", ")}.`,
        privacy_level: "followers",
        target_username: target.username
      };
    }
  }

  return null;
}

// Hive answers "Assert Exception:Account <name> does not exist".
function isUnknownAccountError(error: unknown) {
  return error instanceof Error && /account \S+ does not exist/i.test(error.message);
}
