"use client";

import { getQueryClient } from "@/core/react-query";
import { Button } from "@/features/ui";
import { error } from "@/features/shared";
import { useLoginByMetaMask } from "@/features/shared/login/hooks/use-login-by-metamask";
import { delay } from "@/utils";
import { EcencyAnalytics, getAccountFullQueryOptions } from "@ecency/sdk";
import type { FullAccount as FullAccountEntity } from "@/entities";
import {
  EcencyWalletCurrency,
  EcencyWalletsPrivateApi,
  installHiveSnap,
  getHivePublicKeys
} from "@ecency/sdk/wallets";
import { UilCheckCircle, UilSpinner } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  username: string;
  verifiedWallet: {
    currency: EcencyWalletCurrency;
    address: string;
    addresses: Partial<Record<EcencyWalletCurrency, string>>;
  };
}

export function MetamaskAccountCreating({ username, verifiedWallet }: Props) {
  const [status, setStatus] = useState<"installing-snap" | "getting-keys" | "creating" | "validating" | "success" | "logging-in" | "error">("installing-snap");
  const { mutateAsync: loginByMetaMask } = useLoginByMetaMask(username);
  const { mutateAsync: createAccount } = EcencyWalletsPrivateApi.useCreateAccountWithWallets(username);
  const hasInitiatedRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    username,
    "signed-up-with-wallets"
  );

  const validateAccountIsCreated = useCallback(
    async (shouldStop?: () => boolean): Promise<FullAccountEntity> => {
      const accountQueryOptions = getAccountFullQueryOptions(username);
      const queryClient = getQueryClient();

      while (!shouldStop?.()) {
        try {
          const account = await queryClient.fetchQuery(accountQueryOptions);
          if (account) {
            queryClient.setQueryData(accountQueryOptions.queryKey, account);
            return account as unknown as FullAccountEntity;
          }
        } catch {
          /* Account might not yet exist; retry */
        }
        await delay(5000);
      }

      const abortError = new Error("Account validation aborted");
      abortError.name = "AbortError";
      throw abortError;
    },
    [username]
  );

  useEffect(() => {
    if (hasInitiatedRef.current) return;
    hasInitiatedRef.current = true;

    let cancelled = false;
    const shouldStop = () => cancelled;

    (async () => {
      try {
        // Step 1: Install Hive Snap
        setStatus("installing-snap");
        await installHiveSnap();
        if (shouldStop()) return;

        // Step 2: Get Hive public keys from snap
        setStatus("getting-keys");
        const publicKeys = await getHivePublicKeys();
        if (shouldStop()) return;

        const keysByRole = publicKeys.reduce<Record<string, string>>((acc, k) => {
          if (k.role) acc[k.role] = k.publicKey;
          return acc;
        }, {});

        const hiveKeys = {
          ownerPublicKey: keysByRole["owner"] ?? "",
          activePublicKey: keysByRole["active"] ?? "",
          postingPublicKey: keysByRole["posting"] ?? "",
          memoPublicKey: keysByRole["memo"] ?? ""
        };

        if (!hiveKeys.ownerPublicKey || !hiveKeys.postingPublicKey) {
          throw new Error("Failed to derive Hive keys from MetaMask snap");
        }

        // Step 3: Create account via backend
        setStatus("creating");
        await createAccount({
          currency: verifiedWallet.currency,
          address: verifiedWallet.address,
          walletAddresses: verifiedWallet.addresses,
          hiveKeys
        });
        if (shouldStop()) return;

        // Step 4: Wait for account to appear on-chain
        setStatus("validating");
        await delay(5000);
        await validateAccountIsCreated(shouldStop);
        if (shouldStop()) return;

        // Step 5: Record analytics
        await recordActivity();

        setStatus("success");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.error("Signup error:", err);
        setStatus("error");
        error(
          (err as Error)?.message || i18next.t("signup-wallets.metamask.create-error")
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username, verifiedWallet, validateAccountIsCreated, recordActivity, createAccount, retryCount]);

  const statusMessages: Record<string, string> = {
    "installing-snap": i18next.t("signup-wallets.metamask.installing-snap"),
    "getting-keys": i18next.t("signup-wallets.metamask.getting-keys"),
    "creating": i18next.t("signup-wallets.create-account.creating"),
    "validating": i18next.t("signup-wallets.create-account.validating"),
    "success": i18next.t("signup-wallets.create-account.success"),
    "error": i18next.t("signup-wallets.metamask.create-error")
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="max-w-[440px] w-full my-4 md:my-8 xl:my-12 mx-auto flex flex-col gap-4">
        {status !== "success" && status !== "logging-in" && status !== "error" && (
          <div key={status} className="flex items-center flex-col animate-fade-in-up">
            <UilSpinner className="animate-spin duration-500 opacity-50 size-16" />
            <div className="text-xl font-semibold mt-4">
              {statusMessages[status]}
            </div>
          </div>
        )}

        {status === "success" && (
          <div key="success" className="flex items-center flex-col animate-fade-in-up">
            <UilCheckCircle className="size-16 text-green" />
            <div className="text-xl text-center font-semibold my-4">
              {statusMessages.success}
            </div>
            <p className="text-sm opacity-60 text-center mb-4">
              {i18next.t("signup-wallets.metamask.success-hint")}
            </p>
            <Button
              size="lg"
              onClick={async () => {
                setStatus("logging-in");
                try {
                  await loginByMetaMask();
                } catch {
                  setStatus("success");
                }
              }}
            >
              {i18next.t("signup-wallets.metamask.login-with-metamask")}
            </Button>
          </div>
        )}

        {status === "logging-in" && (
          <div key="logging-in" className="flex items-center flex-col animate-fade-in-up">
            <UilSpinner className="animate-spin duration-500 opacity-50 size-16" />
            <div className="text-xl font-semibold mt-4">
              {i18next.t("signup-wallets.metamask.logging-in")}
            </div>
          </div>
        )}

        {status === "error" && (
          <div key="error" className="flex items-center flex-col animate-fade-in-up">
            <div className="text-xl text-center font-semibold my-4 text-red">
              {statusMessages.error}
            </div>
            <Button
              size="lg"
              onClick={() => {
                hasInitiatedRef.current = false;
                setStatus("installing-snap");
                setRetryCount((c) => c + 1);
              }}
            >
              {i18next.t("g.try-again")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
