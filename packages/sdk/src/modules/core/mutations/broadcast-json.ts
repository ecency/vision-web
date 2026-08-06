import { PrivateKey } from "../../../hive-tx";
import { broadcastOperations } from "@/modules/core/hive-tx";
import hs from "hivesigner";
import type { AuthContextV2 } from "@/modules/core/types";

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
   * `auth.broadcast` above is the deprecated V1 field, and an AuthContextV2
   * does not carry it, so a Keychain user whose posting key is not stored and
   * who has no HiveSigner token reached the throw below instead of being asked
   * to sign. The web app passes V2 everywhere (`getSdkAuthContext`), so this is
   * reachable today from follow and unfollow.
   *
   * Placed last on purpose: every branch above already works for the sessions
   * that reach it, and reordering would change which method signs for people
   * it currently serves. This only claims cases that were previously errors.
   */
  const adapter = auth?.adapter;
  if (adapter) {
    const ops: Parameters<NonNullable<typeof adapter.broadcastWithKeychain>>[1] =
      [["custom_json", jjson]];

    if (auth?.loginType === "keychain" && adapter.broadcastWithKeychain) {
      return adapter.broadcastWithKeychain(username, ops, "posting");
    }
    if (auth?.loginType === "hiveauth" && adapter.broadcastWithHiveAuth) {
      return adapter.broadcastWithHiveAuth(username, ops, "posting");
    }
  }

  throw new Error(
    "[SDK][Broadcast] – cannot broadcast w/o posting key or token"
  );
}
