import { getRelationshipBetweenAccountsQueryOptions } from "@ecency/sdk";
import { getQueryClient } from "@/core/react-query";
import { getMattermostUserWithProps, getUserDmPrivacy, MattermostUser } from "@/server/mattermost";

export interface DmPrivacyRejection {
  error: string;
  privacy_level: "none" | "followers";
  target_username: string;
}

/**
 * Whether `sender` may open a conversation with `target` under the target's DM
 * privacy setting. Returns the rejection to send back, or null when allowed.
 * Shared by one-to-one and group creation so both apply the same rules.
 */
export async function getDmPrivacyRejection(
  target: Pick<MattermostUser, "id" | "username">,
  senderUsername: string
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
    const relationship = await getQueryClient().fetchQuery(
      getRelationshipBetweenAccountsQueryOptions(target.username, senderUsername)
    );

    if (!relationship?.follows) {
      return {
        error: `@${target.username} only accepts messages from accounts they follow.`,
        privacy_level: "followers",
        target_username: target.username
      };
    }
  }

  return null;
}
