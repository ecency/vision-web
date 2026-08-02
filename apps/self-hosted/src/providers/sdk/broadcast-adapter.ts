import type { Operation, TransactionConfirmation } from "@ecency/sdk";
import type { PlatformAdapter } from "@ecency/sdk";
import { authenticationStore } from "@/store";
import { queryClient } from "@/consts/react-query";
import {
  broadcastWithExtension,
  hasAnyHiveExtension,
} from "@/features/auth/utils/hive-extensions";
import { broadcastWithHiveAuth } from "@/features/auth/utils/hive-auth";

/**
 * Map SDK lowercase key types to Keychain PascalCase authority types.
 */
function toKeychainAuthType(
  keyType: "posting" | "active" | "owner" | "memo"
): "Posting" | "Active" | "Owner" | "Memo" {
  switch (keyType) {
    case "posting":
      return "Posting";
    case "active":
      return "Active";
    case "owner":
      return "Owner";
    case "memo":
      return "Memo";
  }
}

/**
 * Self-hosted platform adapter for SDK mutations.
 *
 * Bridges the SDK's authentication context with the self-hosted app's
 * Zustand auth store and three supported auth methods (keychain, hivesigner, hiveauth).
 */
export function createBroadcastAdapter(): PlatformAdapter {
  return {
    async getUser(username: string) {
      const { user } = authenticationStore.getState();
      if (!user || user.username !== username) {
        return undefined;
      }
      return {
        name: user.username,
        authType: user.loginType,
      };
    },

    async getPostingKey() {
      // Self-hosted app never stores private keys
      return null;
    },

    async getAccessToken(username: string) {
      const { user } = authenticationStore.getState();
      if (!user || user.username !== username) {
        return undefined;
      }
      return user.accessToken;
    },

    async getLoginType(username: string) {
      const { user } = authenticationStore.getState();
      if (!user || user.username !== username) {
        return null;
      }
      // Self-hosted loginType values match SDK auth methods directly
      return user.loginType;
    },

    showError(message: string) {
      console.error("[SelfHosted]", message);
    },

    showSuccess(message: string) {
      console.log("[SelfHosted]", message);
    },

    async broadcastWithKeychain(
      username: string,
      ops: Operation[],
      keyType: "posting" | "active" | "owner" | "memo"
    ): Promise<TransactionConfirmation> {
      if (!hasAnyHiveExtension()) {
        throw new Error("No Hive browser extension is available.");
      }

      // Routes through the extension this account logged in with (stored
      // per-user preference), falling back to the best available one.
      const response = await broadcastWithExtension(
        username,
        ops,
        toKeychainAuthType(keyType),
        authenticationStore.getState().user?.extension
      );

      // KeychainResponse.result contains the transaction confirmation
      return response.result as unknown as TransactionConfirmation;
    },

    async broadcastWithHiveAuth(
      username: string,
      ops: Operation[],
      keyType: "posting" | "active" | "owner" | "memo"
    ): Promise<TransactionConfirmation> {
      const { session } = authenticationStore.getState();
      if (!session) {
        throw new Error("No HiveAuth session available");
      }

      // The requested authority is passed on. Dropping it made every HiveAuth
      // broadcast ask for the posting key, so an active operation such as a tip
      // transfer was signed with the wrong authority and rejected by the chain.
      // broadcastWithHiveAuth returns void (broadcast happens server-side)
      await broadcastWithHiveAuth(session, ops, keyType);

      // HiveAuth broadcasts server-side and doesn't return tx confirmation
      return {} as TransactionConfirmation;
    },

    async invalidateQueries(queryKeys: any[]) {
      await Promise.all(
        queryKeys
          .filter(Boolean)
          .map((entry) =>
            entry && typeof entry === "object" && "predicate" in entry
              ? queryClient.invalidateQueries({ predicate: entry.predicate })
              : queryClient.invalidateQueries({ queryKey: entry })
          )
      );
    },
  };
}
