import { TransferFormHeader } from "@/features/shared/transfer/transfer-form-header";
import i18next from "i18next";
import { Button } from "@ui/button";
import type { TransferAsset } from "./index";
import { Form } from "@ui/form";
import { FormControl, InputGroup, InputGroupCopyClipboard } from "@ui/input";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { UilAngleDown, UilAngleUp } from "@tooni/iconscout-unicons-react";
import {
  dateToFullRelative,
  formatNumber,
  formattedNumber,
  HiveWallet,
  parseAsset,
  vestsToHp
} from "@/utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import { withFeatureFlag } from "@/core/react-query";
import { getDynamicPropsQueryOptions, getPointsQueryOptions } from "@ecency/sdk";
import { getHiveEngineBalancesWithUsdQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { TransferFormText } from "@/features/shared/transfer/transfer-form-text";
import { TransferAssetSwitch } from "@/features/shared/transfer/transfer-assets-switch";
import { EXCHANGE_ACCOUNTS } from "@/consts";
import { useTransferSharedState } from "./transfer-shared-state";
import { useDebounceTransferAccountData } from "./use-debounce-transfer-account-data";
import { amountFormatCheck } from "@/utils/amount-format-check";
import { isWif } from "@ecency/sdk";
import { EcencyConfigManager } from "@/config";
import { TransferStep1To } from "@/features/shared/transfer/transfer-step-1-to";

interface Props {
  titleLngKey: string;
}

export function TransferStep1({ titleLngKey }: Props) {
  const { activeUser, account, refetch: refetchAccount, isPending: isAccountPending } =
    useActiveAccount();

  const {
    asset,
    memo,
    setMemo,
    step,
    to,
    mode,
    setExchangeWarning,
    setStep,
    setAmount,
    amount,
    amountError,
    setAmountError,
    memoError,
    setMemoError,
    exchangeWarning,
    setAsset
  } = useTransferSharedState();

  const { data: activeUserPoints } = useQuery(
    withFeatureFlag(
      ({ visionFeatures }) => visionFeatures.points.enabled,
      getPointsQueryOptions(activeUser?.username)
    )
  );
  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());
  // Prices are resolved per held symbol inside the query – passing an unfiltered token
  // list here only fed it a page capped at 1000 rows (and a 1000-entry query key).
  const { data: engineBalances } = useQuery(
    getHiveEngineBalancesWithUsdQueryOptions(activeUser?.username ?? "", dynamicProps)
  );
  const { toWarning, toData, delegatedAmount, toError, delegateAccount, externalWallets } =
    useDebounceTransferAccountData();

  const [isExternalWalletsExpanded, setIsExternalWalletsExpanded] = useState(false);

  const hiveAccount = useMemo(() => account, [account]);

  const w = useMemo(
    () => (hiveAccount ? new HiveWallet(hiveAccount, dynamicProps ?? DEFAULT_DYNAMIC_PROPS) : null),
    [hiveAccount, dynamicProps]
  );
  const subTitleLngKey = useMemo(() => `${mode}-sub-title`, [mode]);

  const engineAssets = useMemo(
    () => (engineBalances ?? []).map((token) => token.symbol as TransferAsset),
    [engineBalances]
  );

  const sortedEngineAssets = useMemo(
    () => [...engineAssets].sort((a, b) => a.localeCompare(b)),
    [engineAssets]
  );

  const engineTokenIcons = useMemo(
    () =>
      Object.fromEntries(
        (engineBalances ?? []).map((token) => [token.symbol as TransferAsset, token.icon])
      ),
    [engineBalances]
  );

  const showTo = useMemo(
    () => ["transfer", "transfer-saving", "withdraw-saving", "power-up", "delegate"].includes(mode),
    [mode]
  );
  const canSubmit = useMemo(
    () =>
      toData &&
      !toError &&
      (!showTo || to) &&
      !amountError &&
      !memoError &&
      !exchangeWarning &&
      parseFloat(amount) > 0,
    [amount, amountError, exchangeWarning, memoError, showTo, to, toData, toError]
  );
  const assets = useMemo(() => {
    let assets: TransferAsset[] = [];
    switch (mode) {
      case "transfer": {
        const baseAssets: TransferAsset[] = ["HBD", "HIVE"];

        assets = [
          ...(EcencyConfigManager.CONFIG.visionFeatures.points.enabled ? ["POINT"] : []),
          ...baseAssets,
          ...sortedEngineAssets
        ];
        break;
      }
      case "transfer-saving":
      case "withdraw-saving":
        assets = ["HIVE", "HBD"];
        break;
      case "claim-interest":
        assets = ["HBD"];
        break;
      case "convert":
        assets = ["HBD"];
        break;
      case "power-up":
        assets = ["HIVE"];
        break;
      case "power-down":
      case "delegate":
        assets = ["HP"];
        break;
    }

    return Array.from(new Set(assets));
  }, [mode, sortedEngineAssets]);
  const showMemo = useMemo(
    () => ["transfer", "transfer-saving", "withdraw-saving"].includes(mode),
    [mode]
  );

  const getBalance = useCallback((): number => {
    if (!hiveAccount || !w) {
      return 0;
    }
    if (asset === "POINT") {
      return parseAsset(activeUserPoints?.points ?? "0.0").amount;
    }
    const engineToken = engineBalances?.find((t) => t.symbol === asset);
    if (engineToken) {
      return engineToken.balance;
    }

    if (mode === "withdraw-saving" || mode === "claim-interest") {
      return asset === "HIVE" ? w.savingBalance : w.savingBalanceHbd;
    }

    if (asset === "HIVE") {
      return w.balance;
    }

    if (asset === "HBD") {
      return w.hbdBalance;
    }

    if (asset === "HP") {
      const { hivePerMVests } = dynamicProps ?? DEFAULT_DYNAMIC_PROPS;
      const vestingShares = w.vestingSharesAvailable;
      return vestsToHp(vestingShares, hivePerMVests);
    }

    return 0;
  }, [
    activeUserPoints?.points,
    asset,
    dynamicProps,
    engineBalances,
    hiveAccount,
    mode,
    w
  ]);

  const assetPrecision = useMemo(() => {
    const engineToken = engineBalances?.find((t) => t.symbol === asset);
    if (engineToken?.precision !== undefined) {
      return engineToken.precision;
    }

    return 3;
  }, [asset, engineBalances]);

  useEffect(() => {
    if ((asset === "HIVE" || asset === "HBD" || asset === "HP") && !isAccountPending) {
      refetchAccount();
    }
  }, [asset, isAccountPending, refetchAccount]);

  useEffect(() => {
    if (amount === "") {
      setAmountError("");
      return;
    }

    if (!amountFormatCheck(amount)) {
      setAmountError(i18next.t("transfer.wrong-amount"));
      return;
    }

    const dotParts = amount.split(".");
    if (dotParts.length > 1) {
      const precision = dotParts[1];
      if (precision.length > assetPrecision) {
        setAmountError(i18next.t("transfer.amount-precision-error"));
        return;
      }
    }

    let balance = Number(formatNumber(getBalance(), assetPrecision));

    if (parseFloat(amount) > balance + delegatedAmount) {
      setAmountError(i18next.t("trx-common.insufficient-funds"));
      return;
    }

    setAmountError("");
  }, [amount, assetPrecision, delegatedAmount, getBalance, setAmountError]);

  const balance = useMemo(() => {
    let balance: string | number = formatNumber(getBalance(), assetPrecision);
    if (delegatedAmount) {
      balance = Number(balance) + delegatedAmount;
      balance = Number(balance).toFixed(assetPrecision);
    }

    return balance;
  }, [assetPrecision, delegatedAmount, getBalance]);

  useEffect(() => {
    if (EXCHANGE_ACCOUNTS.includes(to)) {
      if ((asset === "HIVE" || asset === "HBD") && !memo) {
        setExchangeWarning(i18next.t("transfer.memo-required"));
      } else {
        setExchangeWarning("");
      }
    }
  }, [to, memo, asset, setExchangeWarning]);

  const nextPowerDown = useCallback(() => {
    setStep(2);
    setAmount("0.000");
  }, [setAmount, setStep]);

  const next = useCallback(() => {
    const fixedAmount = formatNumber(amount, assetPrecision);
    setAmount(fixedAmount);
    setStep(2);
  }, [amount, assetPrecision, setAmount, setStep]);

  const memoChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const { value: memo } = e.target;
      const mError = isWif(memo.trim());
      if (mError) setMemoError(i18next.t("transfer.memo-error").toUpperCase());
      setMemo(memo);
    },
    [setMemo, setMemoError]
  );

  return (
    <>
      {step === 1 && mode === "power-down" && w && w.isPoweringDown && (
        <div className="transfer-dialog-content">
          <div className="transaction-form">
            <TransferFormHeader title={titleLngKey} step={step} subtitle={subTitleLngKey} />
            <div className="transaction-form-body powering-down">
              <p>{i18next.t("transfer.powering-down")}</p>
              <p>
                {i18next.t("wallet.next-power-down", {
                  time: dateToFullRelative(w.nextVestingWithdrawalDate.toString()),
                  amount: `${formatNumber(w.nextVestingSharesWithdrawalHive, 3)} HIVE`,
                  weeks: w.weeksLeft
                })}
              </p>
              <Button
                onClick={nextPowerDown}
                appearance="danger"
                className="mt-4"
                size="lg"
                outline={true}
              >
                {i18next.t("transfer.stop-power-down")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {step === 1 && (mode !== "power-down" || !w?.isPoweringDown) && (
        <div className="transaction-form">
          <TransferFormHeader title={titleLngKey} step={step} subtitle={subTitleLngKey} />
          <Form className="transaction-form-body">
            <div className="grid items-center grid-cols-12 mb-4">
              <div className="col-span-12 sm:col-span-2">
                <label>{i18next.t("transfer.from")}</label>
              </div>
              <div className="col-span-12 sm:col-span-10">
                <InputGroup prepend="@">
                  <FormControl type="text" value={activeUser!.username} readOnly={true} />
                </InputGroup>
              </div>
            </div>

            {showTo && <TransferStep1To toError={toError} toWarning={toWarning} />}

            {showTo && externalWallets.length > 0 && (
              <div className="grid items-center grid-cols-12 mb-4">
                <div className="col-span-12 sm:col-span-10 sm:col-start-3">
                  <div className="border-t border-[--border-color] pt-3">
                    <div
                      className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity mb-2"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExternalWalletsExpanded}
                      onClick={() => setIsExternalWalletsExpanded(!isExternalWalletsExpanded)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setIsExternalWalletsExpanded(!isExternalWalletsExpanded);
                        }
                      }}
                    >
                      <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                        {i18next.t("transfer.external-wallets-label")}
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {isExternalWalletsExpanded ? (
                          <UilAngleUp className="size-4" />
                        ) : (
                          <UilAngleDown className="size-4" />
                        )}
                      </div>
                    </div>
                    {isExternalWalletsExpanded && (
                      <div className="flex flex-col gap-2">
                        {externalWallets.map(({ symbol, address }) => (
                          <div key={`${symbol}-${address}`} className="flex flex-col gap-1">
                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                              {symbol}
                            </div>
                            <InputGroupCopyClipboard value={address} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid items-center grid-cols-12">
              <div className="col-span-12 sm:col-span-2">
                <label>{i18next.t("transfer.amount")}</label>
              </div>
              <div className="col-span-12 sm:col-span-10 flex items-center">
                <InputGroup prepend="#">
                  <FormControl
                    type="text"
                    placeholder={i18next.t("transfer.amount-placeholder")}
                    value={amount}
                    onChange={(e) => {
                      const { value: amount } = e.target;
                      setAmount(amount);
                    }}
                    className={amount > balance && amountError ? "is-invalid" : ""}
                    autoFocus={mode !== "transfer"}
                  />
                </InputGroup>
                {assets.length > 1 && (
                  <TransferAssetSwitch
                    options={assets}
                    selected={asset}
                    tokenIcons={engineTokenIcons}
                    onChange={(e) => setAsset(e)}
                  />
                )}
              </div>
            </div>

            {amountError && amount > balance && (
              <TransferFormText msg={amountError} type="danger" />
            )}

            <div className="grid items-center grid-cols-12">
              <div className="col-span-12 lg:col-span-10 lg:col-start-3">
                <div className="balance">
                  <span className="balance-label">
                    {i18next.t("transfer.balance")}
                    {": "}
                  </span>
                  <span
                    className="balance-num"
                    role="button"
                    tabIndex={0}
                    onClick={() => setAmount(formatNumber(getBalance(), 3))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setAmount(formatNumber(getBalance(), 3));
                      }
                    }}
                  >
                    {balance} {asset}
                  </span>
                  {asset === "HP" && (
                    <div className="balance-hp-hint">{i18next.t("transfer.available-hp-hint")}</div>
                  )}
                </div>
                {to!.length > 0 &&
                  Number(amount) > 0 &&
                  toData &&
                  mode === "delegate" && (
                    <div className="text-gray-600 mt-1 override-warning">
                      {i18next.t("transfer.override-warning-1")}
                      {delegateAccount && (
                        <>
                          <br />
                          {i18next.t("transfer.override-warning-2", {
                            account: to,
                            previousAmount: formattedNumber(delegatedAmount)
                          })}
                        </>
                      )}
                    </div>
                  )}
              </div>
            </div>

            {showMemo && (
              <>
                <div className="grid items-center grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-2">
                    <label>{i18next.t("transfer.memo")}</label>
                  </div>
                  <div className="col-span-12 sm:col-span-10">
                    <FormControl
                      type="text"
                      placeholder={i18next.t("transfer.memo-placeholder")}
                      value={memo}
                      onChange={memoChanged}
                    />
                    <TransferFormText
                      msg={
                        memo.startsWith("#")
                          ? `🔒 ${i18next.t("transfer.memo-encrypted")}`
                          : i18next.t("transfer.memo-help")
                      }
                      type="muted"
                    />
                    {memoError && <TransferFormText msg={memoError} type="danger" />}
                  </div>
                </div>
              </>
            )}

            <div className="grid items-center grid-cols-12 mb-4">
              <div className="col-span-12 sm:col-span-10 sm:col-start-3">
                <Button onClick={next} disabled={!canSubmit}>
                  {i18next.t("g.next")}
                </Button>
              </div>
            </div>
          </Form>
        </div>
      )}
    </>
  );
}
