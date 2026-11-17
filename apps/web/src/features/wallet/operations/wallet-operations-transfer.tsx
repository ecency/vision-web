import { Button } from "@/features/ui";
import {
  AssetOperation,
  parseAsset,
  vestsToHp,
  getAccountWalletAssetInfoQueryOptions,
} from "@ecency/sdk";
import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import { getDynamicPropsQueryOptions, getHiveEngineBalancesWithUsdQueryOptions } from "@ecency/sdk";
import { yupResolver } from "@hookform/resolvers/yup";
import { useQuery } from "@tanstack/react-query";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import * as yup from "yup";
import { WalletOperationCard } from "./wallet-opearation-card";
import { WalletOperationAmountForm } from "./wallet-operation-amount-form";
import { formatNumber } from "@/utils";
import { callRPC } from "@ecency/sdk";
import { hpToVests } from "@/features/shared/transfer/hp-to-vests";
import { amountStep, operationAssetPrecision, truncateAmount } from "./operation-amount";
import { isKeyInMemo, prepareOperationMemo } from "./operation-memo";
import { error as showError } from "@/features/shared";
import { formatError } from "@/api/format-error";

interface Props {
  to?: string;
  data?: Record<string, any>;
  asset: string;
  username: string;
  showSubmit: boolean;
  showMemo?: boolean;
  operation: AssetOperation;
  onSubmit: (data: { to: string; amount: string; memo?: string | undefined; from: string }) => void;
}

export function WalletOperationsTransfer({
  data,
  to: toProp,
  asset,
  username,
  operation,
  onSubmit,
  showSubmit,
  showMemo = false
}: Props) {
  const shouldDefaultToSelf = useMemo(
    () =>
      [
        AssetOperation.Stake,
        AssetOperation.Unstake,
        AssetOperation.WithdrawFromSavings,
        AssetOperation.ClaimInterest,
      ].includes(operation),
    [operation]
  );

  const [to, setTo] = useState<string>(
    data?.to ?? toProp ?? (shouldDefaultToSelf ? username : "")
  );

  const { data: accountWallet } = useQuery(
    getAccountWalletAssetInfoQueryOptions(username, asset)
  );

  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());
  const hivePerMVests = useMemo(
    () => (dynamicProps ?? DEFAULT_DYNAMIC_PROPS).hivePerMVests,
    [dynamicProps]
  );

  const sanitizedTo = useMemo(() => to?.replace(/^@/, "") ?? "", [to]);

  useEffect(() => {
    if (data?.to) {
      setTo(data.to);
      return;
    }

    if (toProp) {
      setTo(toProp);
      return;
    }

    if (shouldDefaultToSelf) {
      setTo(username);
    }
  }, [data?.to, operation, shouldDefaultToSelf, toProp, username]);

  const isEngineToken = accountWallet?.layer === "ENGINE";
  // A Hive Engine token has its own precision (up to 8 decimals); everything
  // else here uses 3 (#2127).
  const { data: engineBalances } = useQuery({
    ...getHiveEngineBalancesWithUsdQueryOptions(username, dynamicProps),
    enabled: isEngineToken && !!username
  });
  const knownPrecision = useMemo(
    () => operationAssetPrecision(isEngineToken, engineBalances, asset),
    [asset, engineBalances, isEngineToken]
  );
  // Until an engine token's precision is known, nothing can be submitted.
  const precision = knownPrecision ?? 3;
  const step = amountStep(precision);
  const liquidBalance = useMemo(() => {
    const balance = accountWallet?.parts?.find((part) =>
      ["current", "liquid"].includes(part.name)
    )?.balance;

    if (balance !== undefined && balance !== null) {
      const parsed = Number(balance);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    const fallback = Number(accountWallet?.accountBalance ?? 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }, [accountWallet?.accountBalance, accountWallet?.parts]);
  const stakedBalance = useMemo(
    () =>
      Number(
        accountWallet?.parts?.find((part) => part.name === "staked")?.balance ?? 0
      ),
    [accountWallet?.parts]
  );
  const savingsBalance = useMemo(
    () =>
      Number(
        accountWallet?.parts?.find((part) => part.name === "savings")?.balance ?? 0
      ),
    [accountWallet?.parts]
  );
  const delegatingBalance = useMemo(
    () =>
      Number(
        accountWallet?.parts?.find((part) =>
          ["outgoing_delegations", "delegating"].includes(part.name)
        )?.balance ?? 0
      ),
    [accountWallet?.parts]
  );
  const hpBalance = useMemo(
    () =>
      Number(
        accountWallet?.parts?.find((part) => part.name === "hp_balance")?.balance ??
          accountWallet?.accountBalance ??
          0
      ),
    [accountWallet?.accountBalance, accountWallet?.parts]
  );
  const poweringDownBalance = useMemo(
    () =>
      Number(
        accountWallet?.parts?.find((part) =>
          ["pending_power_down", "powering_down"].includes(part.name)
        )?.balance ?? 0
      ),
    [accountWallet?.parts]
  );

  const shouldFetchExistingDelegation =
    asset === "HP" &&
    operation === AssetOperation.Delegate &&
    Boolean(username) &&
    Boolean(sanitizedTo);

  const { data: existingDelegationHp, isFetched: isExistingDelegationFetched } =
    useQuery({
      queryKey: [
        "wallets",
        "hp",
        "delegation",
        username,
        sanitizedTo,
        hivePerMVests,
      ],
      enabled: shouldFetchExistingDelegation,
      queryFn: async () => {
        try {
          const delegations = (await callRPC(
            "condenser_api.get_vesting_delegations",
            [username, sanitizedTo, 1]
          )) as { delegatee: string; vesting_shares: string }[];

          const matched = delegations.find(
            (delegation) => delegation.delegatee === sanitizedTo
          );

          if (!matched) {
            return undefined;
          }

          return vestsToHp(parseAsset(matched.vesting_shares).amount, hivePerMVests);
        } catch {
          return undefined;
        }
      },
    });

  const { displayBalance, maxAmount } = useMemo(() => {
    if (!accountWallet) {
      return { displayBalance: undefined as number | undefined, maxAmount: 0 };
    }

    if (!isEngineToken) {
      if (asset === "HP") {
        if (operation === AssetOperation.Delegate) {
          const available = Math.max(hpBalance - delegatingBalance, 0);
          const otherDelegations = Math.max(
            delegatingBalance - (existingDelegationHp ?? 0),
            0
          );
          const capacity = Math.max(
            existingDelegationHp ?? 0,
            hpBalance - poweringDownBalance - otherDelegations
          );

          return { displayBalance: available, maxAmount: capacity };
        }

        if (operation === AssetOperation.PowerDown) {
          const available = Math.max(hpBalance - delegatingBalance, 0);

          return { displayBalance: available, maxAmount: available };
        }
      }

      if (
        [
          AssetOperation.Transfer,
          AssetOperation.TransferToSavings,
          AssetOperation.PowerUp,
        ].includes(operation)
      ) {
        return { displayBalance: liquidBalance, maxAmount: liquidBalance };
      }

      if (
        [
          AssetOperation.WithdrawFromSavings,
          AssetOperation.ClaimInterest,
        ].includes(operation)
      ) {
        return { displayBalance: savingsBalance, maxAmount: savingsBalance };
      }

      const total = Number(accountWallet.accountBalance ?? 0);

      return { displayBalance: total, maxAmount: total };
    }

    if (
      [AssetOperation.Transfer, AssetOperation.PowerUp, AssetOperation.Stake].includes(
        operation
      )
    ) {
      return { displayBalance: liquidBalance, maxAmount: liquidBalance };
    }

    if (
      [AssetOperation.Unstake, AssetOperation.Delegate, AssetOperation.Undelegate].includes(
        operation
      )
    ) {
      return { displayBalance: stakedBalance, maxAmount: stakedBalance };
    }

    const total = Number(accountWallet.accountBalance ?? 0);

    return { displayBalance: total, maxAmount: total };
  }, [
    accountWallet,
    asset,
    delegatingBalance,
    existingDelegationHp,
    hpBalance,
    isEngineToken,
    liquidBalance,
    operation,
    poweringDownBalance,
    savingsBalance,
    stakedBalance,
  ]);

  const validationMax = maxAmount || step;

  const minAmount = useMemo(
    () => (asset === "HP" && operation === AssetOperation.Delegate ? 0 : step),
    [asset, operation, step]
  );

  const recipientBalance = useMemo(() => {
    if (!accountWallet || !isEngineToken) {
      return undefined;
    }

    if (sanitizedTo !== username) {
      return undefined;
    }

    if ([AssetOperation.Stake, AssetOperation.Unstake].includes(operation)) {
      return stakedBalance;
    }

    return undefined;
  }, [
    accountWallet,
    isEngineToken,
    operation,
    sanitizedTo,
    stakedBalance,
    username,
  ]);

  const defaultAmount = useMemo(() => {
    const fallbackAmount =
      data?.amount ?? (operation === AssetOperation.ClaimInterest ? 0.001 : 0);

    if (asset === "HP" && operation === AssetOperation.Delegate) {
      const parsed =
        typeof fallbackAmount === "string"
          ? parseFloat(fallbackAmount)
          : Number(fallbackAmount);

      if (Number.isFinite(parsed)) {
        return Number(formatNumber(parsed, 3));
      }

      return 0;
    }

    return fallbackAmount;
  }, [asset, data?.amount, operation]);

  const methods = useForm({
    resolver: yupResolver(
      yup.object({
        amount: yup
          .number()
          .required(i18next.t("validation.required"))
          .min(minAmount)
          .max(validationMax),
        // A private key must never go out as a memo: memos are public on chain.
        memo: yup
          .string()
          .test("not-a-key", i18next.t("transfer.memo-error"), (value) => !isKeyInMemo(value ?? ""))
      })
    ),
    defaultValues: {
      amount: defaultAmount,
      memo: data?.memo ?? ""
    }
  });

  useEffect(() => {
    if (
      asset !== "HP" ||
      operation !== AssetOperation.Delegate ||
      !shouldFetchExistingDelegation ||
      !isExistingDelegationFetched
    ) {
      return;
    }

    if (methods.formState.isDirty) {
      return;
    }

    methods.setValue(
      "amount",
      Number(formatNumber(existingDelegationHp ?? 0, 3)),
      {
        shouldDirty: false,
      }
    );
  }, [
    asset,
    existingDelegationHp,
    isExistingDelegationFetched,
    methods,
    operation,
    shouldFetchExistingDelegation,
  ]);

  const hasValidRecipient = Boolean(sanitizedTo);
  const allowSubmitWithoutBalance =
    asset === "HP" &&
    operation === AssetOperation.Delegate &&
    Boolean(existingDelegationHp && existingDelegationHp > 0);
  const isSubmitDisabled =
    knownPrecision === null ||
    !hasValidRecipient ||
    (maxAmount <= 0 && !allowSubmitWithoutBalance);

  return (
    <div className="grid">
      <div className="grid grid-cols-1 md:grid-cols-2">
        <WalletOperationCard
          label="from"
          asset={asset}
          balance={displayBalance}
          username={username}
          onBalanceClick={() =>
            methods.setValue(
              "amount",
              +truncateAmount(displayBalance ?? 0, precision) || 0
            )
          }
        />
        <WalletOperationCard
          label="to"
          asset={asset}
          balance={recipientBalance}
          username={to ?? ""}
          onUsernameSubmit={(v) => setTo(v ?? "")}
          editable={
            showSubmit &&
            ![AssetOperation.Unstake, AssetOperation.ClaimInterest].includes(operation)
          }
          onBalanceClick={() =>
            methods.setValue(
              "amount",
              +truncateAmount(recipientBalance ?? displayBalance ?? 0, precision) || 0
            )
          }
        />
      </div>

      <FormProvider {...methods}>
        <form
          className="block"
          onSubmit={methods.handleSubmit(async (data) => {
            // A memo starting with # goes out encrypted for the recipient, as
            // in the shared Transfer dialog.
            let memo = data.memo ?? "";
            try {
              // Only operations that carry a memo on chain (showMemo).
              if (showMemo) {
                memo = await prepareOperationMemo(memo, username, sanitizedTo);
              }
            } catch (e) {
              showError(...formatError(e));
              return;
            }
            const amountString =
              asset === "HP" && operation === AssetOperation.Delegate
                ? hpToVests(Number(data.amount), hivePerMVests)
                : `${truncateAmount(Number(data.amount), precision)} ${asset}`;

            onSubmit({
              ...data,
              memo,
              amount: amountString,
              from: username,
              to: sanitizedTo,
            });
          })}
        >
          <div className="border-y border-[--border-color] flex flex-col py-4 gap-4 font-mono">
            <WalletOperationAmountForm readonly={!showSubmit} showMemo={showMemo} step={step} />
          </div>

          <div className="flex justify-between items-center p-4">
            <div className="flex flex-col text-sm">
              <div className="uppercase text-xs font-semibold text-gray-600 dark:text-gray-400">
                {i18next.t("transfer.fee")}
              </div>
              <div className="text-black dark:text-white font-semibold">0.0%</div>
            </div>
            {showSubmit && (
              <Button
                type="submit"
                disabled={isSubmitDisabled}
                icon={<UilArrowRight />}
              >
                {i18next.t("g.continue")}
              </Button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
