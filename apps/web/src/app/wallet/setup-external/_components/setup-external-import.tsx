"use client";

import { formatError } from "@/api/format-error";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error, success, Stepper } from "@/features/shared";
import { Button } from "@/features/ui";
import {
  EcencyWalletCurrency,
  EcencyWalletsPrivateApi,
  useSaveWalletInformationToMetadata
} from "@ecency/sdk/wallets";
import {
  UilArrowLeft,
  UilArrowUpRight,
  UilCheckCircle,
  UilEye,
  UilSpinner,
  UilTransaction
} from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { getAccessToken, getSdkAuthContext } from "@/utils";
import { getUser } from "@/utils/user-token";
import { useCallback, useMemo, useState } from "react";
import { CURRENCIES_META_DATA } from "@/features/wallet/consts/currencies-meta-data";

interface Props {
  onBack: () => void;
}

const WATCH_CHAINS = [
  EcencyWalletCurrency.BTC,
  EcencyWalletCurrency.ETH,
  EcencyWalletCurrency.BNB,
  EcencyWalletCurrency.SOL
];

type Step = "addresses" | "saving" | "success";

const steps = [
  {
    step: "addresses",
    title: i18next.t("wallet.watch-wallet.step-addresses", { defaultValue: "Addresses" }),
    icon: <UilEye className="size-6" />,
    description: i18next.t("wallet.watch-wallet.step-addresses-desc", {
      defaultValue: "Enter wallet addresses to watch"
    })
  },
  {
    step: "saving",
    title: i18next.t("wallet.watch-wallet.step-save", { defaultValue: "Save" }),
    icon: <UilTransaction className="size-6" />,
    description: i18next.t("wallet.watch-wallet.step-save-desc", {
      defaultValue: "Save addresses to your profile"
    })
  }
];

function SetupExternalImportInner({ username, onBack }: Props & { username: string }) {
  const [step, setStep] = useState<Step>("addresses");
  const [addresses, setAddresses] = useState<Partial<Record<EcencyWalletCurrency, string>>>({});

  const authContext = useMemo(() => getSdkAuthContext(getUser(username)), [username]);

  const { mutateAsync: saveTokens } = useSaveWalletInformationToMetadata(username, authContext, {
    onError: (err) => {
      error(...formatError(err));
      setStep("addresses");
    }
  });

  const { mutateAsync: saveToPrivateApi } = EcencyWalletsPrivateApi.useUpdateAccountWithWallets(
    username,
    getAccessToken(username)
  );

  const hasAnyAddress = useMemo(
    () => Object.values(addresses).some((addr) => addr?.trim()),
    [addresses]
  );

  const handleSave = useCallback(async () => {
    const validEntries = Object.entries(addresses).filter(([, addr]) => addr?.trim());
    if (validEntries.length === 0) return;

    setStep("saving");
    try {
      const tokenEntries = validEntries.map(([currency, address]) => ({
        currency,
        type: "CHAIN" as const,
        address: address!.trim(),
        show: true,
        watchOnly: true
      }));

      await saveTokens(tokenEntries);

      const walletAddresses = Object.fromEntries(
        validEntries.map(([currency, address]) => [currency, address!.trim()])
      ) as Record<string, string>;

      await saveToPrivateApi({
        tokens: walletAddresses,
        hiveKeys: {
          ownerPublicKey: "",
          activePublicKey: "",
          postingPublicKey: "",
          memoPublicKey: ""
        }
      });

      setStep("success");
      success(i18next.t("wallet.watch-wallet.save-success", { defaultValue: "Wallet addresses saved" }));
    } catch (err) {
      console.error("Save error:", err);
      error(...formatError(err as Error));
      setStep("addresses");
    }
  }, [addresses, saveTokens, saveToPrivateApi]);

  return (
    <div className="w-full col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 lg:gap-10 xl:gap-12 items-start">
      <Stepper steps={steps} currentStep={step} />
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

        {step === "addresses" && (
          <div className="w-full">
            <div className="font-bold text-xl mt-2 md:mt-4 lg:mt-6">
              {i18next.t("wallet.watch-wallet.title", { defaultValue: "Watch Wallet" })}
            </div>
            <div className="opacity-50 mb-6">
              {i18next.t("wallet.watch-wallet.description", {
                defaultValue:
                  "Enter wallet addresses to monitor balances on your Ecency wallet page. This is view-only — no transactions will be possible."
              })}
            </div>

            <div className="space-y-4">
              {WATCH_CHAINS.map((currency) => {
                const meta = CURRENCIES_META_DATA[currency];
                if (!meta) return null;

                return (
                  <div key={currency} className="flex items-center gap-3">
                    <Image
                      src={meta.icon}
                      alt={meta.title}
                      width={32}
                      height={32}
                      className="size-8 flex-shrink-0"
                    />
                    <div className="flex-1">
                      <label className="text-sm font-medium mb-1 block">{meta.title}</label>
                      <input
                        type="text"
                        className="w-full border-2 border-[--border-color] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 dark:bg-dark-200"
                        placeholder={i18next.t("wallet.watch-wallet.address-placeholder", {
                          chain: meta.name,
                          defaultValue: `${meta.name} address`
                        })}
                        value={addresses[currency] ?? ""}
                        onChange={(e) =>
                          setAddresses((prev) => ({ ...prev, [currency]: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-6">
              <Button
                appearance="gray"
                onClick={onBack}
                icon={<UilArrowLeft />}
                iconPlacement="left"
              >
                {i18next.t("g.back")}
              </Button>
              <Button onClick={handleSave} disabled={!hasAnyAddress}>
                {i18next.t("wallet.watch-wallet.save-button", { defaultValue: "Save addresses" })}
              </Button>
            </div>
          </div>
        )}

        {step === "saving" && (
          <div className="animate-fade-in-up w-full flex items-center flex-col justify-center min-h-[400px]">
            <UilSpinner className="animate-spin duration-500 opacity-50 size-16" />
            <div className="text-xl text-center font-semibold mt-4">
              {i18next.t("wallet.watch-wallet.saving", { defaultValue: "Saving addresses..." })}
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="animate-fade-in-up w-full flex items-center flex-col justify-center min-h-[400px]">
            <UilCheckCircle className="text-green size-16" />
            <div className="text-xl text-center font-semibold mt-4">
              {i18next.t("wallet.watch-wallet.success-title", {
                defaultValue: "Addresses saved successfully"
              })}
            </div>
            <div className="opacity-50 text-center mt-2 mb-4">
              {i18next.t("wallet.watch-wallet.success-description", {
                defaultValue: "You can now view your wallet balances on the wallet page."
              })}
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

export function SetupExternalImport({ onBack }: Props) {
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

  return <SetupExternalImportInner username={username} onBack={onBack} />;
}
