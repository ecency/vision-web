"use client";

import { Button, Spinner } from "@/features/ui";
import { error, success } from "@/features/shared";
import {
  EcencyWalletCurrency,
  EcencyWalletsPrivateApi,
  getTokenPriceQueryOptions,
  useGetExternalWalletBalanceQuery,
  fetchMultichainAddresses,
  type WalletAddressMap
} from "@ecency/sdk/wallets";
import { UilArrowLeft, UilCheckCircle } from "@tooni/iconscout-unicons-react";
import { useQuery } from "@tanstack/react-query";
import Decimal from "decimal.js";
import i18next from "i18next";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInterval } from "react-use";
import { CURRENCIES_META_DATA } from "../../consts/currencies-meta-data";

/** Chains supported by both MetaMask AND our backend balance API */
const SUPPORTED_CHAINS: {
  currency: EcencyWalletCurrency;
  isEvm: boolean;
  comingSoon?: boolean;
}[] = [
  { currency: EcencyWalletCurrency.ETH, isEvm: true },
  { currency: EcencyWalletCurrency.BNB, isEvm: true },
  { currency: EcencyWalletCurrency.BTC, isEvm: false },
  { currency: EcencyWalletCurrency.SOL, isEvm: false }
];

const DECIMALS_BY_CURRENCY: Partial<Record<EcencyWalletCurrency, number>> = {
  [EcencyWalletCurrency.BTC]: 8,
  [EcencyWalletCurrency.ETH]: 18,
  [EcencyWalletCurrency.BNB]: 18,
  [EcencyWalletCurrency.SOL]: 9
};

const DECIMALS_BY_UNIT: Record<string, number> = {
  satoshi: 8,
  sat: 8,
  wei: 18,
  lamport: 9,
  lamports: 9
};

const MINIMUM_VALIDATION_USD = new Decimal(1);

interface Props {
  username: string;
  onVerified: (
    currency: EcencyWalletCurrency,
    address: string,
    addresses: WalletAddressMap
  ) => void;
  onBack: () => void;
}

export function MetamaskConnect({ username, onVerified, onBack }: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [evmAddress, setEvmAddress] = useState("");
  const [chainAddresses, setChainAddresses] = useState<WalletAddressMap>({});
  const [selectedCurrency, setSelectedCurrency] = useState<EcencyWalletCurrency | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isLoadingChainAddresses, setIsLoadingChainAddresses] = useState(false);
  const [addressAlreadyUsed, setAddressAlreadyUsed] = useState(false);

  const { mutateAsync: checkWalletExistence } =
    EcencyWalletsPrivateApi.useCheckWalletExistence();

  const isEvmChain = selectedCurrency
    ? SUPPORTED_CHAINS.find((c) => c.currency === selectedCurrency)?.isEvm ?? false
    : false;

  // The active address: EVM chains share the same address, non-EVM use fetched multichain address
  const connectedAddress = isEvmChain
    ? evmAddress
    : (selectedCurrency ? chainAddresses[selectedCurrency] ?? "" : "");

  const availableAddresses = useMemo<WalletAddressMap>(() => {
    const evmAddresses = evmAddress
      ? {
          [EcencyWalletCurrency.ETH]: evmAddress,
          [EcencyWalletCurrency.BNB]: evmAddress
        }
      : {};

    return {
      ...evmAddresses,
      ...chainAddresses
    };
  }, [evmAddress, chainAddresses]);

  // Balance query — only enabled when we have both currency and address
  const {
    data: externalWalletBalance,
    refetch: refetchBalance,
    isLoading: isBalanceLoading
  } = useGetExternalWalletBalanceQuery(
    selectedCurrency ?? EcencyWalletCurrency.ETH,
    connectedAddress
  );

  const {
    data: priceUsd,
    isLoading: isPriceLoading,
    isError: isPriceError
  } = useQuery({
    ...getTokenPriceQueryOptions(selectedCurrency ?? EcencyWalletCurrency.ETH),
    enabled: !!selectedCurrency && !!connectedAddress,
    staleTime: 30000
  });

  // Poll balance every 10s when checking
  useInterval(
    () => {
      if (selectedCurrency && connectedAddress) {
        refetchBalance();
      }
    },
    selectedCurrency && connectedAddress ? 10000 : null
  );

  const decimals = useMemo(() => {
    if (selectedCurrency && DECIMALS_BY_CURRENCY[selectedCurrency] !== undefined) {
      return DECIMALS_BY_CURRENCY[selectedCurrency]!;
    }
    if (externalWalletBalance?.unit) {
      return DECIMALS_BY_UNIT[externalWalletBalance.unit.toLowerCase()] ?? 0;
    }
    return 0;
  }, [selectedCurrency, externalWalletBalance?.unit]);

  const tokenAmount = useMemo(() => {
    const balance = externalWalletBalance?.balanceBigInt ?? BigInt(0);
    const divisor = new Decimal(10).pow(decimals);
    return new Decimal(balance.toString()).div(divisor);
  }, [decimals, externalWalletBalance?.balanceBigInt]);

  const hasPrice = typeof priceUsd === "number" && Number.isFinite(priceUsd);
  const usdValue = hasPrice ? tokenAmount.mul(priceUsd) : new Decimal(0);
  const hasValidBalance = hasPrice && usdValue.greaterThanOrEqualTo(MINIMUM_VALIDATION_USD);

  const connectMetaMask = useCallback(async () => {
    if (!window.ethereum?.isMetaMask) {
      error(i18next.t("signup-wallets.metamask.not-found"));
      return;
    }

    setIsConnecting(true);
    try {
      setChainAddresses({});
      setAddressAlreadyUsed(false);

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts"
      })) as string[];
      if (accounts?.[0]) {
        setEvmAddress(accounts[0]);
        // Keep the chain the user picked when this is a reconnect
        setSelectedCurrency((current) => current ?? EcencyWalletCurrency.ETH);

        // Also fetch non-EVM addresses (BTC, SOL) via multichain API
        setIsLoadingChainAddresses(true);
        try {
          const multichain = await fetchMultichainAddresses();
          if (process.env.NODE_ENV === "development") {
            console.log("[MetaMask multichain] fetched addresses:", multichain);
          }
          setChainAddresses(multichain);
        } finally {
          setIsLoadingChainAddresses(false);
        }
      }
    } catch (e: any) {
      setIsLoadingChainAddresses(false);
      // User dismissed the MetaMask connect prompt (EIP-1193 4001): benign cancel,
      // so don't surface it as an error.
      if (e?.code === 4001 || /user rejected|user denied/i.test(e?.message ?? "")) {
        return;
      }
      console.error("[MetaMask connect] failed:", e);
      error(i18next.t("signup-wallets.metamask.connect-error"));
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const selectChain = useCallback((currency: EcencyWalletCurrency) => {
    setSelectedCurrency(currency);
    setAddressAlreadyUsed(false);
  }, []);

  const signAndVerify = useCallback(async () => {
    if (!window.ethereum || !connectedAddress || !selectedCurrency) return;

    setIsSigning(true);
    try {
      // For EVM chains, sign with MetaMask directly
      // For non-EVM chains, we still use MetaMask's personal_sign with the EVM address
      // to prove the user controls this MetaMask wallet
      const signingAddress = evmAddress || connectedAddress;
      const message = `Create Hive account: ${username}`;
      await window.ethereum.request({
        method: "personal_sign",
        params: [message, signingAddress]
      });

      success(i18next.t("signup-wallets.validate-funds.validation-success"));
      onVerified(selectedCurrency, connectedAddress, availableAddresses);
    } catch (e: any) {
      // User dismissed the personal_sign dialog (EIP-1193 4001): benign cancel,
      // so don't surface it as an error (matches connectMetaMask above).
      if (e?.code === 4001 || /user rejected|user denied/i.test(e?.message ?? "")) {
        return;
      }
      error(i18next.t("signup-wallets.metamask.sign-rejected"));
    } finally {
      setIsSigning(false);
    }
  }, [availableAddresses, connectedAddress, evmAddress, selectedCurrency, username, onVerified]);

  // Auto-check balance when address + chain are ready
  useEffect(() => {
    if (connectedAddress && selectedCurrency) {
      refetchBalance();
    }
  }, [connectedAddress, selectedCurrency, refetchBalance]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedCurrency || !connectedAddress) {
      setAddressAlreadyUsed(false);
      return () => {
        cancelled = true;
      };
    }

    setAddressAlreadyUsed(false);

    void (async () => {
      try {
        const isAvailable = await checkWalletExistence({
          address: connectedAddress,
          currency: selectedCurrency
        });

        if (!cancelled && !isAvailable) {
          setAddressAlreadyUsed(true);
        }
      } catch {
        // If check fails, allow continuing — backend will catch duplicates
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkWalletExistence, connectedAddress, selectedCurrency]);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <div className="text-lg font-semibold">
          {i18next.t("signup-wallets.metamask.title")}
        </div>
        <div className="opacity-50">
          {i18next.t("signup-wallets.metamask.description")}
        </div>
      </div>

      {/* Step 1: Connect MetaMask */}
      {!evmAddress && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Image
            src="/assets/undraw-crypto-wallet.svg"
            alt=""
            width={200}
            height={200}
            className="max-w-[180px] mb-4"
          />
          <Button
            size="lg"
            onClick={connectMetaMask}
            disabled={isConnecting}
            icon={isConnecting ? <Spinner className="size-4" /> : undefined}
          >
            {i18next.t("signup-wallets.metamask.connect-button")}
          </Button>
          <p className="text-sm opacity-50 text-center max-w-[400px]">
            {i18next.t("signup-wallets.metamask.connect-hint")}
          </p>
        </div>
      )}

      {/* Step 2: Select chain + verify balance */}
      {evmAddress && (
        <>
          <div className="bg-green-050 dark:bg-green-900/20 rounded-xl p-4 flex items-center gap-3">
            <UilCheckCircle className="text-green size-5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium">
                {i18next.t("signup-wallets.metamask.connected")}
              </div>
              <div className="text-xs opacity-75 font-mono truncate">
                {evmAddress}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SUPPORTED_CHAINS.map(({ currency, comingSoon }) => {
              const meta = CURRENCIES_META_DATA[currency];
              if (!meta) return null;
              const isSelected = selectedCurrency === currency;

              return (
                <button
                  key={currency}
                  onClick={() => !comingSoon && selectChain(currency)}
                  disabled={comingSoon}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all relative ${
                    comingSoon
                      ? "border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed"
                      : isSelected
                        ? "border-blue-dark-sky bg-blue-dark-sky-040 dark:bg-blue-dark-sky/20 cursor-pointer"
                        : "border-gray-200 dark:border-gray-700 hover:border-blue-dark-sky/50 cursor-pointer"
                  }`}
                >
                  <Image
                    src={meta.icon}
                    alt={meta.title}
                    width={32}
                    height={32}
                    className="size-8"
                  />
                  <div className="text-left">
                    <div className="font-semibold text-sm">{meta.title}</div>
                    <div className="text-xs opacity-60">{meta.name}</div>
                  </div>
                  {comingSoon && (
                    <span className="absolute top-1 right-1 text-[10px] font-bold uppercase bg-gray-200 dark:bg-gray-700 rounded px-1.5 py-0.5">
                      {i18next.t("g.soon", { defaultValue: "Soon" })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Non-EVM chain address from MetaMask */}
          {selectedCurrency && !isEvmChain && connectedAddress && (
            <div className="bg-gray-50 dark:bg-dark-default rounded-xl p-3 text-sm">
              <span className="opacity-60">
                {i18next.t("signup-wallets.metamask.address-label", { chain: CURRENCIES_META_DATA[selectedCurrency]?.title, defaultValue: "{{chain}} address:" })}{" "}
              </span>
              <span className="font-mono break-all">{connectedAddress}</span>
            </div>
          )}
          {selectedCurrency && !isEvmChain && isLoadingChainAddresses && (
            <div className="bg-gray-50 dark:bg-dark-default rounded-xl p-3 text-sm flex items-center gap-2">
              <Spinner className="size-4" />
              <span className="opacity-75">{i18next.t("signup-wallets.metamask.checking-multichain", { defaultValue: "Checking MetaMask multichain addresses..." })}</span>
            </div>
          )}
          {selectedCurrency && !isEvmChain && !connectedAddress && !isLoadingChainAddresses && (
            <div className="flex flex-col items-start gap-2">
              <div className="text-sm text-orange-500">
                {i18next.t("signup-wallets.metamask.chain-not-available", {
                  chain: CURRENCIES_META_DATA[selectedCurrency]?.title ?? "",
                  defaultValue: "{{chain}} address not found in your MetaMask wallet. Please enable this chain in MetaMask and reconnect."
                })}
              </div>
              <Button
                size="sm"
                appearance="secondary"
                onClick={connectMetaMask}
                disabled={isConnecting}
                icon={isConnecting ? <Spinner className="size-4" /> : undefined}
              >
                {i18next.t("signup-wallets.metamask.reconnect", { defaultValue: "Reconnect MetaMask" })}
              </Button>
            </div>
          )}

          {/* Balance info */}
          {selectedCurrency && connectedAddress && !addressAlreadyUsed && (
            <div className="bg-gray-50 dark:bg-dark-default rounded-xl p-4 space-y-2">
              {(isBalanceLoading || isPriceLoading) && (
                <div className="flex items-center gap-2 text-sm opacity-75">
                  <Spinner className="size-4" />
                  {i18next.t("signup-wallets.validate-funds.checking-balance")}
                </div>
              )}

              {!isBalanceLoading && tokenAmount.greaterThan(0) && (
                <div className="text-sm">
                  <span className="opacity-75">{i18next.t("signup-wallets.balance.label", { defaultValue: "Balance:" })} </span>
                  <span className="font-semibold">
                    {tokenAmount.toFixed(4)} {CURRENCIES_META_DATA[selectedCurrency]?.name}
                  </span>
                </div>
              )}

              {hasPrice && (
                <div className="text-sm">
                  <span className="opacity-75">
                    {i18next.t("signup-wallets.validate-funds.estimated-value", {
                      value: usdValue.toFixed(2)
                    })}
                  </span>
                </div>
              )}

              {!isBalanceLoading && !isPriceLoading && !hasValidBalance && (
                <div className="text-sm text-orange-500">
                  {i18next.t("signup-wallets.validate-funds.minimum-required", {
                    minimum: "$1.00"
                  })}
                </div>
              )}

              {isPriceError && (
                <div className="text-sm text-orange-500">
                  {i18next.t("signup-wallets.validate-funds.price-unavailable")}
                </div>
              )}

              {hasValidBalance && (
                <div className="flex items-center gap-2 text-green text-sm font-medium">
                  <UilCheckCircle className="size-4" />
                  {i18next.t("signup-wallets.validate-funds.validation-success")}
                </div>
              )}
            </div>
          )}

          {addressAlreadyUsed && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-sm text-red">
              {i18next.t("signup-wallets.metamask.address-in-use")}
            </div>
          )}

          {/* Sign & Continue */}
          <div className="flex items-center justify-between">
            <Button appearance="gray" onClick={onBack} icon={<UilArrowLeft />} iconPlacement="left">
              {i18next.t("g.back")}
            </Button>
            <Button
              onClick={signAndVerify}
              disabled={!hasValidBalance || addressAlreadyUsed || isSigning}
              icon={isSigning ? <Spinner className="size-4" /> : undefined}
            >
              {i18next.t("signup-wallets.metamask.sign-and-continue")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
