"use client";

import {
  EcencyWalletCurrency,
  useExternalTransfer,
  type TransferableCurrency,
  getEvmExplorerUrl,
  getSolExplorerUrl,
  estimateEvmGas,
  formatWei,
  parseToWei
} from "@ecency/sdk/wallets";
import { UilArrowLeft, UilCheck, UilExclamationTriangle, UilSpinner } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, ModalBody, ModalHeader } from "@/features/ui";
import { CURRENCIES_META_DATA } from "../consts/currencies-meta-data";
import { useQuery } from "@tanstack/react-query";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { useGetExternalWalletBalanceQuery, getTokenPriceQueryOptions } from "@ecency/sdk/wallets";

/** MetaMask RPC error code when user clicks "Reject" in the confirmation popup */
const USER_REJECTED_REQUEST = 4001;

const DECIMALS: Record<string, number> = {
  ETH: 18,
  BNB: 18,
  SOL: 9
};

function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function isValidSolAddress(address: string): boolean {
  // Base58 character class + length check as a sync gate.
  // Full Ed25519 public key validation happens at transfer time via @solana/web3.js PublicKey constructor.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function isValidAddress(address: string, currency: EcencyWalletCurrency): boolean {
  switch (currency) {
    case EcencyWalletCurrency.ETH:
    case EcencyWalletCurrency.BNB:
      return isValidEvmAddress(address);
    case EcencyWalletCurrency.SOL:
      return isValidSolAddress(address);
    default:
      return false;
  }
}

function isValidAmount(value: string, currency: EcencyWalletCurrency): boolean {
  if (!value) return false;
  const maxDecimals = DECIMALS[currency] ?? 18;
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return false;
  const fraction = match[2] ?? "";
  return fraction.length <= maxDecimals && parseFloat(value) > 0;
}

function formatBalance(balanceString: string, currency: EcencyWalletCurrency, maxFractionDigits = 6): string {
  const decimals = DECIMALS[currency] ?? 18;
  if (balanceString === "0") return "0";

  const padded = balanceString.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals) || "0";
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction.slice(0, maxFractionDigits)}` : whole;
}

function fullPrecisionBalance(balanceString: string, currency: EcencyWalletCurrency): string {
  const decimals = DECIMALS[currency] ?? 18;
  return formatBalance(balanceString, currency, decimals);
}

interface Props {
  currency: TransferableCurrency;
  username: string;
  show: boolean;
  onHide: () => void;
}

export function ExternalTransferDialog({ currency, username, show, onHide }: Props) {
  const [step, setStep] = useState<"form" | "confirm" | "signing" | "success" | "error">("form");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const meta = CURRENCIES_META_DATA[currency as keyof typeof CURRENCIES_META_DATA];

  const { data: account } = useQuery({
    ...getAccountFullQueryOptions(username),
    enabled: show
  });

  const externalAddress = useMemo(() => {
    const tokens = account?.profile?.tokens;
    if (!Array.isArray(tokens)) return undefined;
    const matched = tokens.find(
      (t: any) => typeof t.symbol === "string" && t.symbol.toUpperCase() === currency
    );
    if (!matched) return undefined;
    const addr = matched.meta?.address ?? (matched as any).address;
    return typeof addr === "string" ? addr.trim() : undefined;
  }, [account?.profile?.tokens, currency]);

  const isEvm = currency === EcencyWalletCurrency.ETH || currency === EcencyWalletCurrency.BNB;

  const { data: balanceData } = useGetExternalWalletBalanceQuery(currency, externalAddress ?? "");
  const [connectedAddress, setConnectedAddress] = useState<string>();
  // Only compare addresses for EVM — SOL uses a completely different address format
  const addressMismatch = isEvm && !!connectedAddress && !!externalAddress &&
    connectedAddress.toLowerCase() !== externalAddress.toLowerCase();

  const humanBalance = useMemo(
    () => balanceData ? formatBalance(balanceData.balanceString, currency) : undefined,
    [balanceData, currency]
  );

  const fullBalance = useMemo(
    () => balanceData ? fullPrecisionBalance(balanceData.balanceString, currency) : undefined,
    [balanceData, currency]
  );

  const { data: usdPrice } = useQuery({
    ...getTokenPriceQueryOptions(currency),
    enabled: show
  });

  const usdValue = useMemo(() => {
    if (!amount || !usdPrice) return undefined;
    const val = parseFloat(amount) * usdPrice;
    return isNaN(val) ? undefined : `$${val.toFixed(2)}`;
  }, [amount, usdPrice]);

  useEffect(() => {
    if (!isEvm || !show || typeof window === "undefined" || !window.ethereum?.isMetaMask) return;
    let cancelled = false;
    // Silent read for the address-mismatch check: eth_accounts returns only
    // already-connected accounts and never prompts. We must NOT call
    // eth_requestAccounts here, or merely opening the Send dialog pops a MetaMask
    // connect prompt. The actual connect/sign prompt happens at confirm time
    // inside the transfer mutation (see handleConfirm).
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts: any) => {
        if (!cancelled) setConnectedAddress(accounts?.[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEvm, show]);

  // Gas estimation for EVM
  const [gasEstimate, setGasEstimate] = useState<string>();

  useEffect(() => {
    if (!isEvm || !externalAddress || !to || !isValidAmount(amount, currency) || !isValidAddress(to, currency)) {
      setGasEstimate(undefined);
      return;
    }
    const valueHex = parseToWei(amount);
    estimateEvmGas(externalAddress, to, valueHex, currency)
      .then(({ estimatedFeeWei }) => setGasEstimate(formatWei(estimatedFeeWei)))
      .catch(() => setGasEstimate(undefined));
  }, [isEvm, externalAddress, to, amount, currency]);

  const transfer = useExternalTransfer(currency);

  const handleConfirm = useCallback(async () => {
    setStep("signing");
    try {
      // Pass the linked wallet address so the EVM send is blocked at the source if
      // the active MetaMask account does not match it (funds safety). The dialog's
      // open-time read is silent (eth_accounts) and only powers the proactive
      // warning; the hard guarantee lives in sendEvmTransfer, atomic with its
      // account read. externalAddress is the SOL address for SOL (ignored there).
      const result = await transfer.mutateAsync({ to, amount, expectedFrom: externalAddress });
      setTxHash(result.txHash);
      setStep("success");
    } catch (err: unknown) {
      const rpcErr = err as { code?: number; message?: string };
      if (rpcErr?.message === "ACCOUNT_MISMATCH") {
        setErrorMessage(
          i18next.t("external-transfer.account-mismatch", {
            defaultValue:
              "Your connected MetaMask account does not match your linked wallet. Switch to the linked account in MetaMask and try again."
          })
        );
      } else if (rpcErr?.code === USER_REJECTED_REQUEST) {
        setErrorMessage(i18next.t("external-transfer.cancelled", { defaultValue: "Transaction cancelled by user." }));
      } else {
        setErrorMessage(rpcErr?.message || "Transfer failed");
      }
      setStep("error");
    }
  }, [transfer, to, amount, isEvm, externalAddress]);

  const explorerUrl = useMemo(() => {
    if (!txHash) return undefined;
    if (isEvm) return getEvmExplorerUrl(currency, txHash);
    if (currency === EcencyWalletCurrency.SOL) return getSolExplorerUrl(txHash);
    return undefined;
  }, [txHash, currency, isEvm]);

  const addressValid = to.length > 0 && isValidAddress(to, currency);
  const amountValid = isValidAmount(amount, currency);
  const exceedsBalance = amountValid && fullBalance ? parseFloat(amount) > parseFloat(fullBalance) : false;
  const canSubmit = addressValid && amountValid && !exceedsBalance && !addressMismatch && !!externalAddress;

  useEffect(() => {
    if (!show) {
      setStep("form");
      setTo("");
      setAmount("");
      setTxHash("");
      setErrorMessage("");
      setGasEstimate(undefined);
      setConnectedAddress(undefined);
      setIsMaxAmount(false);
    }
  }, [show]);

  const [isMaxAmount, setIsMaxAmount] = useState(false);

  const handleMax = useCallback(() => {
    if (fullBalance) {
      setAmount(fullBalance);
      setIsMaxAmount(true);
    }
  }, [fullBalance]);

  return (
    <Modal centered={true} show={show} onHide={step === "signing" ? () => {} : onHide}>
      <ModalHeader closeButton={step !== "signing"}>
        <div className="flex items-center gap-2">
          {step === "confirm" && (
            <button onClick={() => setStep("form")} className="p-1 hover:bg-gray-100 dark:hover:bg-dark-200 rounded">
              <UilArrowLeft className="size-5" />
            </button>
          )}
          <div className="font-semibold">
            {i18next.t("external-transfer.title", { defaultValue: "Send {{token}}", token: meta?.name ?? currency })}
          </div>
        </div>
      </ModalHeader>
      <ModalBody>
        {step === "form" && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                {i18next.t("external-transfer.recipient-label", { defaultValue: "Recipient address" })}
              </label>
              <input
                type="text"
                className="w-full mt-1 p-3 border border-[--border-color] rounded-lg bg-transparent text-sm font-mono"
                placeholder={isEvm ? "0x..." : "Solana address"}
                value={to}
                onChange={(e) => setTo(e.target.value.trim())}
              />
              {to.length > 0 && !addressValid && (
                <div className="text-xs text-red-500 mt-1">
                  {i18next.t("external-transfer.error-invalid-address", { defaultValue: "Invalid {{chain}} address", chain: meta?.name ?? currency })}
                </div>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  {i18next.t("external-transfer.amount-label", { defaultValue: "Amount" })}
                </label>
                {humanBalance && (
                  <button
                    className="text-xs text-blue-dark-sky hover:underline"
                    onClick={handleMax}
                  >
                    {i18next.t("external-transfer.balance", { defaultValue: "Balance: {{balance}}", balance: humanBalance })}
                  </button>
                )}
              </div>
              <div className="relative mt-1">
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full p-3 pr-16 border border-[--border-color] rounded-lg bg-transparent text-sm"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "");
                    const parts = raw.split(".");
                    const sanitized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : raw;
                    setAmount(sanitized);
                    setIsMaxAmount(false);
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-semibold">
                  {meta?.name ?? currency}
                </span>
              </div>
              {usdValue && (
                <div className="text-xs text-gray-500 mt-1">{usdValue}</div>
              )}
              {exceedsBalance && (
                <div className="text-xs text-red-500 mt-1">
                  {i18next.t("external-transfer.error-exceeds-balance", { defaultValue: "Amount exceeds available balance" })}
                </div>
              )}
            </div>

            {gasEstimate && (
              <div className="text-xs text-gray-500 flex justify-between bg-gray-50 dark:bg-dark-200 p-2 rounded-lg">
                <span>{i18next.t("external-transfer.estimated-fee", { defaultValue: "Estimated network fee" })}</span>
                <span>~{gasEstimate} {meta?.name ?? currency}</span>
              </div>
            )}

            {isEvm && isMaxAmount && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
                {i18next.t("external-transfer.max-evm-hint", {
                  defaultValue: "Network fees are paid from {{token}}. MetaMask may adjust the amount to reserve gas.",
                  token: meta?.name ?? currency
                })}
              </div>
            )}

            {addressMismatch && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                {i18next.t("external-transfer.error-address-mismatch", {
                  defaultValue: "Connected MetaMask account does not match your linked wallet address. Please switch accounts in MetaMask."
                })}
              </div>
            )}

            <Button
              full={true}
              size="lg"
              disabled={!canSubmit}
              onClick={() => setStep("confirm")}
            >
              {i18next.t("external-transfer.review", { defaultValue: "Review transfer" })}
            </Button>
          </div>
        )}

        {step === "confirm" && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 dark:bg-dark-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{i18next.t("external-transfer.sending", { defaultValue: "Sending" })}</span>
                <span className="font-semibold">{amount} {meta?.name ?? currency}</span>
              </div>
              {usdValue && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{i18next.t("external-transfer.value", { defaultValue: "Value" })}</span>
                  <span>{usdValue}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{i18next.t("external-transfer.to-label", { defaultValue: "To" })}</span>
                <span className="font-mono text-xs truncate max-w-[200px]">{to}</span>
              </div>
              {gasEstimate && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{i18next.t("external-transfer.estimated-fee", { defaultValue: "Estimated fee" })}</span>
                  <span>~{gasEstimate} {meta?.name ?? currency}</span>
                </div>
              )}
            </div>

            <Button
              full={true}
              size="lg"
              onClick={handleConfirm}
              icon={
                meta?.icon ? (
                  <Image width={20} height={20} src={meta.icon.src} alt="" className="size-5" />
                ) : undefined
              }
            >
              {i18next.t("external-transfer.confirm-metamask", { defaultValue: "Confirm with MetaMask" })}
            </Button>
          </div>
        )}

        {step === "signing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <UilSpinner className="size-8 animate-spin text-blue-dark-sky" />
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {i18next.t("external-transfer.signing", { defaultValue: "Waiting for MetaMask confirmation..." })}
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="size-12 rounded-full bg-green/10 flex items-center justify-center">
              <UilCheck className="size-6 text-green" />
            </div>
            <div className="font-semibold">
              {i18next.t("external-transfer.success", { defaultValue: "Transfer submitted!" })}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {i18next.t("external-transfer.success-hint", { defaultValue: "Your transaction has been submitted to the network. It may take a few minutes to confirm." })}
            </div>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-dark-sky hover:underline"
              >
                {i18next.t("external-transfer.view-explorer", { defaultValue: "View on explorer" })}
              </a>
            )}
            <Button full={true} appearance="secondary" onClick={onHide}>
              {i18next.t("g.close")}
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="size-12 rounded-full bg-red/10 flex items-center justify-center">
              <UilExclamationTriangle className="size-6 text-red" />
            </div>
            <div className="font-semibold">
              {i18next.t("external-transfer.failed", { defaultValue: "Transfer failed" })}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {errorMessage}
            </div>
            <div className="flex gap-2 w-full">
              <Button full={true} appearance="secondary" onClick={onHide}>
                {i18next.t("g.close")}
              </Button>
              <Button full={true} onClick={() => setStep("form")}>
                {i18next.t("external-transfer.try-again", { defaultValue: "Try again" })}
              </Button>
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
