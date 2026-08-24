import { formatError } from "@/api/format-error";
import { updateAccountKeysCache } from "@/api/mutations/update-account-keys-cache";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error, success } from "@/features/shared";
import { KeyOrHot } from "@/features/shared/key-or-hot";
import { Button } from "@/features/ui";
import { getAccountFullQueryOptions, dedupeAndSortKeyAuths } from "@ecency/sdk";
import { deriveHiveMasterPasswordKeys } from "@ecency/wallets";
import { PrivateKey } from "@ecency/sdk";
import type { Operation } from "@ecency/sdk";
import type { Authority } from "@ecency/sdk";
import { UilArrowLeft, UilCheckCircle, UilSpinner } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { useKeyDerivationStore } from "../../_hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWebBroadcastAdapter } from "@/providers/sdk/web-broadcast-adapter";
import { broadcastOperations } from "@ecency/sdk";

type KeyAuthority = "owner" | "active" | "posting" | "memo";

interface Props {
  masterPassword: string;
  keysToRevokeByAuthority: Record<KeyAuthority, string[]>;
  onBack: () => void;
  onSuccess: () => void;
}

export function Step4Confirm({ masterPassword, keysToRevokeByAuthority, onBack, onSuccess }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  if (!username) {
    throw new Error("Cannot confirm key update without an active user");
  }

  const keys = useMemo(
    () => deriveHiveMasterPasswordKeys(username, masterPassword),
    [username, masterPassword]
  );

  const setMultipleDerivations = useKeyDerivationStore((state) => state.setMultipleDerivations);
  const [isApplying, setIsApplying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const queryClient = useQueryClient();

  const { data: accountData } = useQuery(getAccountFullQueryOptions(username));

  const buildAccountUpdateOp = (): Operation => {
    if (!accountData) {
      throw new Error("Account data not loaded");
    }

    const newKeys = {
      owner: PrivateKey.fromString(keys.owner),
      active: PrivateKey.fromString(keys.active),
      posting: PrivateKey.fromString(keys.posting),
      memo_key: PrivateKey.fromString(keys.memo)
    };

    const prepareAuth = (keyName: "owner" | "active" | "posting") => {
      const auth: Authority = JSON.parse(JSON.stringify(accountData[keyName]));
      const keysToRevoke = keysToRevokeByAuthority[keyName] || [];
      const existingKeys = auth.key_auths.filter(
        ([key]) => !keysToRevoke.includes(key.toString())
      );
      auth.key_auths = dedupeAndSortKeyAuths(
        existingKeys,
        [[newKeys[keyName].createPublic().toString(), 1]]
      );
      return auth;
    };

    return [
      "account_update",
      {
        account: username,
        json_metadata: accountData.json_metadata,
        owner: prepareAuth("owner"),
        active: prepareAuth("active"),
        posting: prepareAuth("posting"),
        memo_key: newKeys.memo_key.createPublic().toString()
      }
    ] as unknown as Operation;
  };

  const handleSuccess = async () => {
    setMultipleDerivations(username, {
      [keys.ownerPubkey]: "master-password",
      [keys.activePubkey]: "master-password",
      [keys.postingPubkey]: "master-password",
      [keys.memoPubkey]: "master-password"
    });

    // Optimistic cache update + background refetch
    updateAccountKeysCache(queryClient, username, {
      addMap: {
        owner: keys.ownerPubkey,
        active: keys.activePubkey,
        posting: keys.postingPubkey
      },
      memoKey: keys.memoPubkey,
      revokeMap: keysToRevokeByAuthority
    });

    setIsComplete(true);
    success(i18next.t("permissions.keys.key-created"));
    setTimeout(() => onSuccess(), 1500);
  };

  // Sign with private key (entered directly)
  const handleSignByKey = async (privateKey: PrivateKey) => {
    setIsApplying(true);
    try {
      const op = buildAccountUpdateOp();
      await broadcastOperations([op], privateKey);
      await handleSuccess();
    } catch (err: any) {
      setIsApplying(false);
      error(...formatError(err));
    }
  };

  // Sign with Keychain / MetaMask (adapter routes to correct method)
  const handleSignByKeychain = async () => {
    setIsApplying(true);
    try {
      const op = buildAccountUpdateOp();
      const adapter = getWebBroadcastAdapter();
      await adapter.broadcastWithKeychain!(username, [op], "owner");
      await handleSuccess();
    } catch (err: any) {
      setIsApplying(false);
      error(...formatError(err));
    }
  };

  // Sign with MetaMask (same path as keychain — adapter detects metamask)
  const handleSignByMetaMask = handleSignByKeychain;

  if (isComplete) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <UilCheckCircle className="size-16 text-green-500" />
        <h3 className="text-xl font-semibold">{i18next.t("permissions.add-keys.step4.success")}</h3>
        <p className="text-sm opacity-75 text-center">
          {i18next.t("permissions.add-keys.step4.success-description")}
        </p>
      </div>
    );
  }

  if (isApplying) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <UilSpinner className="size-16 animate-spin opacity-50" />
        <h3 className="text-xl font-semibold">{i18next.t("permissions.add-keys.step4.applying")}</h3>
        <p className="text-sm opacity-75">{i18next.t("permissions.add-keys.step4.please-wait")}</p>
      </div>
    );
  }

  const getTotalRevocationCount = () => {
    return Object.values(keysToRevokeByAuthority).reduce(
      (total, keys) => total + keys.length,
      0
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
          {i18next.t("permissions.add-keys.step4.title")}
        </h3>
        <p className="text-sm text-green-800 dark:text-green-200">
          {i18next.t("permissions.add-keys.step4.description")}
        </p>
      </div>

      <div className="bg-white dark:bg-dark-200 border border-[--border-color] rounded-lg p-4">
        <div className="space-y-3">
          <div>
            <div className="text-xs opacity-50 uppercase mb-1">
              {i18next.t("permissions.add-keys.step4.adding")}
            </div>
            <div className="text-sm">
              {i18next.t("permissions.add-keys.step4.new-master-password-keys", {
                defaultValue: "4 new keys (owner, active, posting, memo) from master password"
              })}
            </div>
          </div>

          {getTotalRevocationCount() > 0 && (
            <div>
              <div className="text-xs opacity-50 uppercase mb-1">
                {i18next.t("permissions.add-keys.step4.revoking")}
              </div>
              <div className="text-sm text-red-600 dark:text-red-400">
                {i18next.t("permissions.add-keys.step4.revoking-count", {
                  count: getTotalRevocationCount()
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <KeyOrHot
        inProgress={isApplying}
        onKey={handleSignByKey}
        onKc={handleSignByKeychain}
        onMetaMask={handleSignByMetaMask}
        authority="owner"
      />

      <div className="flex justify-start mt-2">
        <Button appearance="gray-link" icon={<UilArrowLeft />} onClick={onBack}>
          {i18next.t("g.back")}
        </Button>
      </div>
    </div>
  );
}
