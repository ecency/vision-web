"use client";

import { formatError } from "@/api/format-error";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getQueryClient } from "@/core/react-query";
import { error, Stepper } from "@/features/shared";
import { KeyOrHot } from "@/features/shared/key-or-hot";
import { Button, Spinner } from "@/features/ui";
import {
  EcencyWalletCurrency,
  EcencyWalletsPrivateApi,
  useSaveWalletInformationToMetadata,
  fetchMultichainAddresses,
  installHiveSnap,
  getHivePublicKeys,
  type WalletAddressMap
} from "@ecency/wallets";
import { getAccountFullQueryOptions, checkUsernameWalletsPendingQueryOptions } from "@ecency/sdk";
import { PrivateKey } from "@ecency/sdk";
import { broadcastOperations } from "@ecency/sdk";
import {
  UilArrowLeft,
  UilArrowUpRight,
  UilCheckCircle,
  UilLock,
  UilSpinner,
  UilTransaction,
  UilWallet
} from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { getAccessToken, getSdkAuthContext } from "@/utils";
import { getLoginType, getUser } from "@/utils/user-token";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Props {
  onBack: () => void;
}

type Step = "connect" | "sign" | "linking" | "success";

const METAMASK_STEPS = [
  {
    step: "connect",
    title: i18next.t("wallet.link-metamask.step-connect", { defaultValue: "Connect" }),
    icon: <UilWallet className="size-6" />,
    description: i18next.t("wallet.link-metamask.step-connect-desc", {
      defaultValue: "Connect MetaMask and install Hive Snap"
    })
  },
  {
    step: "sign",
    title: i18next.t("wallet.link-metamask.step-sign", { defaultValue: "Authorize" }),
    icon: <UilLock className="size-6" />,
    description: i18next.t("wallet.link-metamask.step-sign-desc", {
      defaultValue: "Sign with owner key to add MetaMask keys"
    })
  },
  {
    step: "linking",
    title: i18next.t("wallet.link-metamask.step-link", { defaultValue: "Link" }),
    icon: <UilTransaction className="size-6" />,
    description: i18next.t("wallet.link-metamask.step-link-desc", {
      defaultValue: "Save wallet addresses to your profile"
    })
  }
];

const METAMASK_STEPS_SHORT = [
  METAMASK_STEPS[0],
  {
    step: "linking",
    title: i18next.t("wallet.link-metamask.step-link", { defaultValue: "Link" }),
    icon: <UilTransaction className="size-6" />,
    description: i18next.t("wallet.link-metamask.step-link-desc", {
      defaultValue: "Save wallet addresses to your profile"
    })
  }
];

function SetupExternalMetamaskInner({ username, onBack }: Props & { username: string }) {
  const isMetaMaskUser = getLoginType(username) === "metamask";

  const [step, setStep] = useState<Step>("connect");
  const [isConnecting, setIsConnecting] = useState(false);
  const [evmAddress, setEvmAddress] = useState("");
  const [chainAddresses, setChainAddresses] = useState<WalletAddressMap>({});
  const [hivePublicKeys, setHivePublicKeys] = useState<Record<string, string>>({});

  const authContext = useMemo(
    () => getSdkAuthContext(getUser(username)),
    [username]
  );

  const [isLinking, setIsLinking] = useState(false);

  const { mutateAsync: saveTokens } = useSaveWalletInformationToMetadata(username, authContext);

  const { mutateAsync: saveToPrivateApi } = EcencyWalletsPrivateApi.useUpdateAccountWithWallets(
    username,
    getAccessToken(username)
  );

  const allAddresses = useMemo<WalletAddressMap>(() => {
    const evmAddresses = evmAddress
      ? {
          [EcencyWalletCurrency.ETH]: evmAddress,
          [EcencyWalletCurrency.BNB]: evmAddress
        }
      : {};
    return { ...evmAddresses, ...chainAddresses };
  }, [evmAddress, chainAddresses]);

  const connectAndFetch = useCallback(async () => {
    if (!window.ethereum?.isMetaMask) {
      error(i18next.t("signup-wallets.metamask.not-found"));
      return;
    }

    setIsConnecting(true);
    try {
      // 1. Connect MetaMask (EVM)
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts"
      })) as string[];
      if (!accounts?.[0]) throw new Error("No accounts returned");
      setEvmAddress(accounts[0]);

      // 2. Fetch non-EVM addresses (SOL, BTC)
      const multichain = await fetchMultichainAddresses();
      setChainAddresses(multichain);

      // 3. Install Hive Snap and get public keys
      await installHiveSnap();
      const publicKeys = await getHivePublicKeys();
      const keysByRole = publicKeys.reduce<Record<string, string>>((acc, k) => {
        if (k.role) acc[k.role] = k.publicKey;
        return acc;
      }, {});
      setHivePublicKeys(keysByRole);

      if (isMetaMaskUser) {
        // MetaMask users skip the sign step - go straight to linking
        setStep("linking");
      } else {
        setStep("sign");
      }
    } catch (err) {
      console.error("MetaMask connect error:", err);
      error(i18next.t("signup-wallets.metamask.connect-error"));
    } finally {
      setIsConnecting(false);
    }
  }, [isMetaMaskUser]);

  const saveWalletData = useCallback(async () => {
    const tokenEntries = Object.entries(allAddresses)
      .filter(([, addr]) => Boolean(addr))
      .map(([currency, address]) => ({
        currency,
        type: "CHAIN" as const,
        address: address!,
        show: true
      }));

    // Save chain addresses to posting_json_metadata (on-chain broadcast)
    await saveTokens(tokenEntries);

    // Save to Ecency private API (best-effort — don't block success on this)
    // Skip if the API already has the same addresses
    const walletAddresses = Object.fromEntries(
      Object.entries(allAddresses).filter(([, addr]) => Boolean(addr))
    ) as Record<string, string>;

    try {
      const queryClient = getQueryClient();
      const accessToken = getAccessToken(username);
      const existingData = await queryClient.fetchQuery(
        checkUsernameWalletsPendingQueryOptions(username, accessToken)
      );

      // Build a map of existing addresses from the API (normalize keys to uppercase)
      const existingAddresses = new Map<string, string>();
      for (const wallet of existingData?.wallets ?? []) {
        if (wallet.symbol && wallet.address) {
          existingAddresses.set(wallet.symbol.toUpperCase(), wallet.address);
        }
      }

      // Check if all new addresses already match what's in the API
      const allAlreadyExist = Object.entries(walletAddresses).every(
        ([symbol, address]) => existingAddresses.get(symbol.toUpperCase()) === address
      );

      if (!allAlreadyExist) {
        await saveToPrivateApi({
          tokens: walletAddresses,
          hiveKeys: {
            ownerPublicKey: hivePublicKeys["owner"] ?? "",
            activePublicKey: hivePublicKeys["active"] ?? "",
            postingPublicKey: hivePublicKeys["posting"] ?? "",
            memoPublicKey: hivePublicKeys["memo"] ?? ""
          }
        });
      }
    } catch (err) {
      // Private API save is non-critical — the on-chain data is the source of truth
      console.warn("Failed to save to Ecency API (non-critical):", err);
    }
  }, [allAddresses, hivePublicKeys, saveTokens, saveToPrivateApi]);

  const handleLinkMetaMaskUser = useCallback(async () => {
    // MetaMask users: just save wallet data (keys already in authorities)
    try {
      await saveWalletData();
      setStep("success");
    } catch (err) {
      console.error("Link error:", err);
      error(...formatError(err as Error));
      linkingTriggeredRef.current = false;
      setStep("connect");
    }
  }, [saveWalletData]);

  const handleLinkByKey = useCallback(
    async (currentKey: PrivateKey) => {
      // Non-MetaMask users: add snap keys to authorities, then save wallet data
      setStep("linking");
      setIsLinking(true);
      try {
        // Add snap Hive keys as additional authorities.
        // useAccountUpdateKeyAuths expects PrivateKey objects to derive public keys,
        // but the snap only exposes public keys. So we build the operation directly.
        const queryClient = getQueryClient();
        const accountData = await queryClient.fetchQuery(getAccountFullQueryOptions(username));

        if (!accountData) {
          throw new Error("Account data not found");
        }

        // Build updated authorities with snap public keys added
        const addKeyToAuth = (auth: any, snapPubKey: string | undefined) => {
          if (!snapPubKey) return auth;
          const authCopy = JSON.parse(JSON.stringify(auth));
          const existingKeys = new Map<string, number>(
            authCopy.key_auths.map(([k, w]: [string, number]) => [k.toString(), w])
          );
          if (!existingKeys.has(snapPubKey)) {
            existingKeys.set(snapPubKey, 1);
          }
          authCopy.key_auths = Array.from(existingKeys.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, w]) => [k, w]);
          return authCopy;
        };

        const updatedOwner = addKeyToAuth(accountData.owner, hivePublicKeys["owner"]);
        const updatedActive = addKeyToAuth(accountData.active, hivePublicKeys["active"]);
        const updatedPosting = addKeyToAuth(accountData.posting, hivePublicKeys["posting"]);

        await broadcastOperations(
          [
            [
              "account_update",
              {
                account: username,
                json_metadata: accountData.json_metadata ?? "",
                owner: updatedOwner,
                active: updatedActive,
                posting: updatedPosting,
                memo_key: hivePublicKeys["memo"] ?? accountData.memo_key
              }
            ]
          ],
          currentKey
        );

        // Now save wallet data
        await saveWalletData();

        setStep("success");
      } catch (err) {
        console.error("Link error:", err);
        error(...formatError(err as Error));
        setStep("sign");
      } finally {
        setIsLinking(false);
      }
    },
    [username, hivePublicKeys, saveWalletData]
  );

  // For MetaMask users, auto-trigger linking when step transitions to "linking"
  const linkingTriggeredRef = useRef(false);
  useEffect(() => {
    if (step === "linking" && isMetaMaskUser && !linkingTriggeredRef.current) {
      linkingTriggeredRef.current = true;
      handleLinkMetaMaskUser();
    }
  }, [step, isMetaMaskUser, handleLinkMetaMaskUser]);

  const addressEntries = Object.entries(allAddresses).filter(([, addr]) => Boolean(addr));

  return (
    <div className="w-full col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 lg:gap-10 xl:gap-12 items-start">
      <Stepper steps={isMetaMaskUser ? METAMASK_STEPS_SHORT : METAMASK_STEPS} currentStep={step} />
      <div className="animate-fade-in-up col-span-2 bg-white dark:bg-dark-200 rounded-2xl p-6 flex flex-col items-start justify-between">
        <Button
          size="sm"
          appearance="gray-link"
          icon={<UilArrowLeft />}
          iconPlacement="left"
          noPadding={true}
          onClick={onBack}
        >
          {i18next.t("g.back")}
        </Button>

        {step === "connect" && (
          <div className="w-full flex flex-col items-center gap-4 py-8">
            <div className="font-bold text-xl mb-2">
              {i18next.t("wallet.link-metamask.title", { defaultValue: "Link MetaMask" })}
            </div>
            <div className="opacity-50 text-center max-w-[440px] mb-4">
              {isMetaMaskUser
                ? i18next.t("wallet.link-metamask.description-metamask-user", {
                    defaultValue:
                      "Connect MetaMask to save your wallet addresses (ETH, BNB, SOL) to your Hive profile."
                  })
                : i18next.t("wallet.link-metamask.description-other-user", {
                    defaultValue:
                      "Connect MetaMask to add its Hive keys to your account and save wallet addresses. This enables MetaMask login and links your ETH, BNB, SOL wallets."
                  })}
            </div>
            <Image
              src="/assets/undraw-crypto-wallet.svg"
              alt=""
              width={200}
              height={200}
              className="max-w-[180px] mb-4"
            />
            <Button
              size="lg"
              onClick={connectAndFetch}
              disabled={isConnecting}
              icon={isConnecting ? <Spinner className="size-4" /> : undefined}
            >
              {isConnecting
                ? i18next.t("wallet.link-metamask.connecting", { defaultValue: "Connecting..." })
                : i18next.t("signup-wallets.metamask.connect-button")}
            </Button>
            {isConnecting && (
              <p className="text-sm opacity-50 text-center max-w-[400px]">
                {i18next.t("wallet.link-metamask.connecting-hint", {
                  defaultValue:
                    "Please approve the MetaMask popups to connect your wallet and install the Hive Snap."
                })}
              </p>
            )}
          </div>
        )}

        {step === "sign" && (
          <div className="w-full pt-4 lg:pt-6 flex flex-col items-start gap-4">
            <div className="font-bold text-xl">
              {i18next.t("wallet.link-metamask.sign-title", {
                defaultValue: "Sign with owner key"
              })}
            </div>
            <div className="opacity-50 mb-2">
              {i18next.t("wallet.link-metamask.sign-description", {
                defaultValue:
                  "To add MetaMask's Hive keys to your account authorities, you need to sign with your owner key. This enables MetaMask login for your account."
              })}
            </div>

            {addressEntries.length > 0 && (
              <div className="w-full bg-gray-50 dark:bg-dark-default rounded-xl p-4 mb-2">
                <div className="text-sm font-medium mb-2 opacity-75">
                  {i18next.t("wallet.link-metamask.addresses-found", {
                    defaultValue: "Addresses found:"
                  })}
                </div>
                <div className="space-y-1">
                  {addressEntries.map(([currency, addr]) => (
                    <div key={currency} className="text-sm flex gap-2">
                      <span className="font-medium w-10">{currency}</span>
                      <span className="font-mono text-xs opacity-75 truncate">{addr}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <KeyOrHot inProgress={isLinking} onKey={handleLinkByKey} authority={"owner"} />
          </div>
        )}

        {step === "linking" && (
          <div className="animate-fade-in-up w-full flex items-center flex-col justify-center min-h-[400px]">
            <UilSpinner className="animate-spin duration-500 opacity-50 size-16" />
            <div className="text-xl text-center font-semibold mt-4">
              {i18next.t("profile-wallet.external-wallets-signup.linking")}
            </div>
            <div className="opacity-50 text-center mt-2">
              {i18next.t("profile-wallet.external-wallets-signup.linking-hint")}
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="animate-fade-in-up w-full flex items-center flex-col justify-center min-h-[400px]">
            <UilCheckCircle className="text-green size-16" />
            <div className="text-xl text-center font-semibold mt-4">
              {i18next.t("profile-wallet.external-wallets-signup.linking-success")}
            </div>
            <div className="opacity-50 text-center mt-2 mb-4">
              {i18next.t("profile-wallet.external-wallets-signup.linking-success-hint")}
            </div>
            <Button href="/wallet" icon={<UilArrowUpRight />} size="lg">
              {i18next.t("user-nav.wallet")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SetupExternalMetamask({ onBack }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  if (!username) {
    return (
      <div className="text-center py-8 text-gray-500">
        {i18next.t("wallet.setup-external.login-required", {
          defaultValue: "Please log in to continue"
        })}
      </div>
    );
  }

  return <SetupExternalMetamaskInner username={username} onBack={onBack} />;
}
