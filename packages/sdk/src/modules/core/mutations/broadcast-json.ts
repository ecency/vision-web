import { PrivateKey } from "../../../hive-tx";
import { broadcastOperations } from "@/modules/core/hive-tx";
import hs from "hivesigner";
import type { AuthContextV2 } from "@/modules/core/types";
import { shouldTriggerAuthFallback } from "@/modules/core/errors";
import { broadcastWithMethod } from "./use-broadcast-mutation";

export async function broadcastJson<T>(
  username: string | undefined,
  id: string,
  payload: T,
  auth?: AuthContextV2
) {
  if (!username) {
    throw new Error(
      "[Core][Broadcast] Attempted to call broadcast API with anon user"
    );
  }
  const jjson = {
    id,
    required_auths: [],
    required_posting_auths: [username],
    json: JSON.stringify(payload),
  };

  if (auth?.broadcast) {
    return auth.broadcast([["custom_json", jjson]], "posting");
  }

  const postingKey = auth?.postingKey;
  if (postingKey) {
    const privateKey = PrivateKey.fromString(postingKey);

    return broadcastOperations(
      [["custom_json", jjson]],
      privateKey
    );
  }

  // With hivesigner access token
  const accessToken = auth?.accessToken;
  if (accessToken) {
    const response = await new hs.Client({
      accessToken,
    }).customJson([], [username], id, JSON.stringify(payload));
    return response.result;
  }

  /*
   * Adapter, as a last resort rather than first.
   *
   * `auth.broadcast` above is the supported caller-supplied path inherited by
   * AuthContextV2, but the web app's `getSdkAuthContext` does not populate it.
   * A Keychain user whose posting key is not stored and who has no HiveSigner
   * token therefore reached the throw below instead of being asked to sign.
   * This is reachable today from follow and unfollow.
   *
   * Placed last on purpose: every branch above already works for the sessions
   * that reach it, and reordering would change which method signs for people
   * it currently serves. This only claims cases that were previously errors.
   */
  const adapter = auth?.adapter;
  if (adapter) {
    const ops: Parameters<NonNullable<typeof adapter.broadcastWithKeychain>>[1] =
      [["custom_json", jjson]];

    const viaLoginMethod =
      auth?.loginType === "keychain" && adapter.broadcastWithKeychain
        ? () => adapter.broadcastWithKeychain!(username, ops, "posting")
        : auth?.loginType === "hiveauth" && adapter.broadcastWithHiveAuth
          ? () => adapter.broadcastWithHiveAuth!(username, ops, "posting")
          : null;

    if (viaLoginMethod) {
      try {
        return await viaLoginMethod();
      } catch (error) {
        // Same auth fallback as useBroadcastMutation: when the login method
        // cannot sign (an extension that is off, an expired session), offer
        // the sign options instead of failing.
        if (!shouldTriggerAuthFallback(error) || !adapter.showAuthUpgradeUI) {
          throw error;
        }
        const method = await adapter.showAuthUpgradeUI("posting", "custom_json");
        if (!method) {
          throw new Error("Operation requires posting authority. User declined alternate auth.");
        }
        return broadcastWithMethod(method, username, ops, auth, "posting", undefined, undefined, "sync");
      }
    }
  }

  throw new Error(
    "[SDK][Broadcast] – cannot broadcast w/o posting key or token"
  );
}
