import i18next from "i18next";
import { error } from "../../feedback";
import { PrivateKey, PublicKey } from "@ecency/sdk";
import { isWif, sha256 } from "@ecency/sdk";
import { FullAccount } from "@/entities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { broadcastOperations, getAccountFullQueryOptions, useGrantPostingPermission } from "@ecency/sdk";
import { EcencyConfigManager } from "@/config";
import { formatError } from "@/api/format-error";
import { makeHsCode } from "@/utils";
import { useLoginInApp } from "./use-login-in-app";
import { useGlobalStore } from "@/core/global-store";
import { setSessionActiveKey } from "@/utils/session-active-key";
import { useRef } from "react";

async function signer(message: string, privateKey: PrivateKey) {
  const hash = sha256(message);
  return new Promise<string>((resolve) => resolve(privateKey.sign(hash).toString()));
}

export function useLoginByKey(
  username: string,
  keyOrSeed: string,
  isVerified: boolean
) {
  const setSigningKey = useGlobalStore((state) => state.setSigningKey);
  const loginInApp = useLoginInApp(username);
  const queryClient = useQueryClient();

  // Ref to hold the active private key for broadcasting during login.
  // The key is set during the login mutation before calling grantPostingPermission,
  // since the user is not yet logged in and the standard adapter cannot resolve keys.
  const activeKeyRef = useRef<PrivateKey | null>(null);
  const grantPostingPermission = useGrantPostingPermission(username, {
    broadcast: async (ops) => {
      const key = activeKeyRef.current;
      if (!key) {
        throw new Error("No active key available for granting posting permission");
      }
      return broadcastOperations(ops, key);
    }
  });

  return useMutation({
    mutationKey: ["login-by-key", username, keyOrSeed, isVerified],
    mutationFn: async (prefetchedAccount?: FullAccount) => {
      if (username === "" || keyOrSeed === "") {
        throw new Error(i18next.t("login.error-fields-required"));
      }

      if (!isVerified) {
        throw new Error(i18next.t("login.captcha-check-required"));
      }

      let isPublicKey = false;
      try {
        PublicKey.fromString(keyOrSeed);
        isPublicKey = true;
      } catch {}
      if (isPublicKey) {
        throw new Error(i18next.t("login.error-public-key"));
      }

      let account: FullAccount | undefined = prefetchedAccount;

      if (!account) {
        try {
          account = (await queryClient.fetchQuery(getAccountFullQueryOptions(username))) ?? undefined;
        } catch (err) {
          const wrapped = new Error(i18next.t("login.error-user-fetch"));
          (wrapped as any).cause = err;
          throw wrapped;
        }
      }

      if (!account || account.name !== username) {
        throw new Error(i18next.t("login.error-user-not-found"));
      }

      const isPlainPassword = !isWif(keyOrSeed);

      let privateKey: PrivateKey;
      let postingKey: PrivateKey | null = null;

      // Whether using posting private key to login
      let withPostingKey = false;

      const isPostingKey =
        !isPlainPassword &&
        account.posting.key_auths.some(([pub]) => {
          try {
            return pub === PrivateKey.fromString(keyOrSeed).createPublic().toString();
          } catch {
            return false;
          }
        });

      if (isPostingKey) {
        // Login with posting private key
        withPostingKey = true;
        privateKey = PrivateKey.fromString(keyOrSeed);
        postingKey = privateKey;
      } else {
        // Login with master password, BIP44 seed or active private key
        // Get active and posting private keys from user entered code
        if (isPlainPassword) {
          // Lazy-load Hive key derivation so @ecency/wallets (heavy crypto
          // deps) stays out of the eager bundle. Only reached when logging in
          // with a plain password/seed (WIF active-key logins take the
          // else-branch and never reach this import).
          const { deriveHiveKeys, detectHiveKeyDerivation } = await import("@ecency/wallets");
          const derivation = await detectHiveKeyDerivation(account.name, keyOrSeed);

          const candidates: { active: PrivateKey; posting: PrivateKey }[] = [];
          const addBip44Candidates = (mnemonic: string, max = 10) => {
            for (let i = 0; i < max; i++) {
              try {
                const keys = deriveHiveKeys(mnemonic, i);
                candidates.push({
                  active: PrivateKey.fromString(keys.active),
                  posting: PrivateKey.fromString(keys.posting)
                });
              } catch {}
            }
          };

          if (derivation === "bip44") {
            addBip44Candidates(keyOrSeed);
          } else if (derivation === "master-password") {
            candidates.push({
              active: PrivateKey.fromLogin(account.name, keyOrSeed, "active"),
              posting: PrivateKey.fromLogin(account.name, keyOrSeed, "posting")
            });
            addBip44Candidates(keyOrSeed);
          } else {
            addBip44Candidates(keyOrSeed);
            candidates.push({
              active: PrivateKey.fromLogin(account.name, keyOrSeed, "active"),
              posting: PrivateKey.fromLogin(account.name, keyOrSeed, "posting")
            });
          }

          let activeMatch: { active: PrivateKey; posting: PrivateKey } | undefined;
          let postingMatch: { active: PrivateKey; posting: PrivateKey } | undefined;

          for (const c of candidates) {
            if (
              !activeMatch &&
              account.active.key_auths.some(([pub]) => pub === c.active.createPublic().toString())
            ) {
              activeMatch = c;
            }

            if (
              !postingMatch &&
              account.posting.key_auths.some(([pub]) => pub === c.posting.createPublic().toString())
            ) {
              postingMatch = c;
            }

            if (activeMatch && postingMatch) {
              break;
            }
          }

          const match = activeMatch || postingMatch;

          if (!match) {
            // A recovered account can keep an owner key from an older master
            // password while its active and posting keys have been replaced.
            // Recognize that case without treating the owner key as a login key.
            const ownerPublic = PrivateKey.fromLogin(account.name, keyOrSeed, "owner")
              .createPublic().toString();
            if (account.owner.key_auths.some(([pub]) => String(pub) === ownerPublic)) {
              throw new Error(i18next.t("login.error-owner-only", {
                defaultValue: "Owner key matches, but active and posting keys have changed. Use a current key."
              }));
            }
            throw new Error(i18next.t("login.error-authenticate"));
          }

          if (activeMatch) {
            privateKey = match.active;
            postingKey = match.posting;
          } else {
            privateKey = match.posting;
            postingKey = match.posting;
            withPostingKey = true;
          }
        } else {
          privateKey = PrivateKey.fromString(keyOrSeed);
        }

        // Generate public key from the private key
        const activePublicInput = privateKey.createPublic().toString();

        // Compare keys against all active authorities
        const hasActiveKey = account.active.key_auths.some(([pub]) => pub === activePublicInput);

        if (!hasActiveKey && !withPostingKey) {
          if (account.owner.key_auths.some(([pub]) => String(pub) === activePublicInput)) {
            throw new Error(i18next.t("login.error-owner-key", {
              defaultValue: "Owner keys cannot sign in here. Use a current active or posting key."
            }));
          }
          throw new Error(i18next.t("login.error-authenticate")); // enter master or active key
        }

        const hasPostingPerm =
          account?.posting!.account_auths.filter(
            (x) => x[0] === EcencyConfigManager.CONFIG.service.hsClientId
          ).length > 0;

        if (!hasPostingPerm && !withPostingKey) {
          try {
            activeKeyRef.current = privateKey;
            await grantPostingPermission.mutateAsync({
              currentPosting: account.posting,
              grantedAccount: EcencyConfigManager.CONFIG.service.hsClientId,
              weightThreshold: account.posting.weight_threshold,
              memoKey: account.memo_key,
              jsonMetadata: account.json_metadata
            });
          } catch (err) {
            throw new Error(i18next.t("login.error-permission"));
          } finally {
            activeKeyRef.current = null;
          }
        }
      }

      // Prepare hivesigner code
      const code = await makeHsCode(
        EcencyConfigManager.CONFIG.service.hsClientId,
        account.name,
        (message) => signer(message, privateKey)
      );

      await loginInApp(code, postingKey ? postingKey.toString() : null, account, "privateKey");

      setSigningKey(privateKey.toString());

      // Logging in with a master password, seed or active key already hands the
      // app an active-authority key (`withPostingKey` is false only after it was
      // matched against the account's active authority above). Hold it in memory
      // so tips, transfers and power ups don't open the auth upgrade dialog for a
      // key the user has already typed. Must run after loginInApp: activating the
      // user clears the previous account's key.
      if (!withPostingKey) {
        setSessionActiveKey(privateKey.toString(), account.name);
      }
    },
    onError: (e) => error(...formatError(e))
  });
}
