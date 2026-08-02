"use client";

import type { Operation } from "@ecency/sdk";
import { InstanceConfigManager } from "@/core";
import { authenticationStore } from "@/store";
import { HIVESIGNER_REDIRECT_PATH } from "./constants";
import type { AuthMethod, AuthUser } from "./types";
import {
  clearHiveAuthSession,
  clearUser,
  saveHiveAuthSession,
  saveUser,
} from "./storage";
import {
  broadcastWithExtension,
  getDetectedExtensions,
  getPreferredExtensionId,
  setPreferredExtensionId,
  signBufferWithExtension,
} from "./utils/hive-extensions";
import type { HiveExtensionId } from "./types";
import {
  broadcastWithHivesigner,
  getHivesignerLoginUrl,
  createHivesignerState,
  resolveHivesignerClientId,
} from './utils/hivesigner';
import { broadcastWithHiveAuth, loginWithHiveAuth } from "./utils/hive-auth";

/**
 * Login with the given method and username.
 * Updates store and storage; callers should handle loading state.
 * `extension` picks which browser extension signs (Keeper / Keychain / Peak
 * Vault) for the "keychain" method; it is remembered per username.
 */
export async function login(
  method: AuthMethod,
  username: string,
  extension?: HiveExtensionId,
): Promise<void> {
  const { setUser, setSession } = authenticationStore.getState();

  switch (method) {
    case "keychain": {
      const chosen =
        extension ?? getPreferredExtensionId(username) ?? getDetectedExtensions()[0]?.id;

      // Prove control of a posting key by signing a throwaway challenge.
      const challenge = `Login to Ecency Blog: ${Date.now()}`;
      await signBufferWithExtension(username, challenge, "Posting", chosen);

      const newUser: AuthUser = {
        username,
        loginType: "keychain",
        ...(chosen ? { extension: chosen } : {}),
      };
      setUser(newUser);
      saveUser(newUser);
      if (chosen) setPreferredExtensionId(username, chosen);
      break;
    }

    case "hiveauth": {
      await loginWithHiveAuth(username, {
        onQRCode: (qrData) => {
          window.dispatchEvent(
            new CustomEvent("hiveauth:qrcode", { detail: qrData })
          );
        },
        onWaiting: () => {
          window.dispatchEvent(new CustomEvent("hiveauth:waiting"));
        },
        onSuccess: (session) => {
          const newUser: AuthUser = {
            username,
            loginType: "hiveauth",
            expiresAt: session.expire * 1000,
          };
          setUser(newUser);
          saveUser(newUser);
          setSession(session);
          saveHiveAuthSession(session);
        },
        onError: (error) => {
          window.dispatchEvent(
            new CustomEvent("hiveauth:error", { detail: error })
          );
        },
      });
      break;
    }

    case "hivesigner":
      throw new Error("Use loginWithHivesigner() for the hivesigner OAuth flow");
  }
}

/**
 * Redirect to Hivesigner for login.
 */
export function loginWithHivesigner(): void {
  if (typeof window === "undefined") return;

  const clientId = resolveHivesignerClientId(
    InstanceConfigManager.getConfigValue(
      ({ configuration }) => configuration.general?.hivesigner?.clientId
    )
  );
  // The provider hides the method when this is null, so getting here without a
  // client means the picker was bypassed.
  if (!clientId) return;

  // A fixed path, so the redirect_uri is identical whichever page login started
  // from and can actually be registered. The current pathname produced a
  // different URI per page, none of which would match.
  const redirectUri = window.location.origin + HIVESIGNER_REDIRECT_PATH;
  window.location.href = getHivesignerLoginUrl(
    redirectUri,
    createHivesignerState(),
    clientId
  );
}

/**
 * Log out the current user and clear store and storage.
 */
export function logout(): void {
  const { setUser, setSession } = authenticationStore.getState();
  setUser(undefined);
  setSession(undefined);
  clearUser();
  clearHiveAuthSession();
}

export type BroadcastAuthorityType = "Active" | "Posting" | "Owner" | "Memo";

/**
 * Broadcast operations using the current user's auth method.
 * Throws if not authenticated or session/keychain is missing.
 * @param authorityType - For keychain: which key to use (e.g. "Active" for transfers).
 */
export async function broadcast(
  operations: Operation[],
  options?: { authorityType?: BroadcastAuthorityType }
): Promise<unknown> {
  const { user, session } = authenticationStore.getState();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const authorityType = options?.authorityType ?? "Posting";

  switch (user.loginType) {
    case "keychain":
      // Routes through the extension this account logged in with (Keeper,
      // Keychain or Peak Vault), falling back to the best available one.
      return broadcastWithExtension(user.username, operations, authorityType, user.extension);

    case "hivesigner":
      if (!user.accessToken) {
        throw new Error("No access token available");
      }
      return broadcastWithHivesigner(user.accessToken, operations);

    case "hiveauth":
      if (!session) {
        throw new Error("No HiveAuth session available");
      }
      return broadcastWithHiveAuth(session, operations);

    default:
      throw new Error(`Unknown login type: ${user.loginType}`);
  }
}
