"use client";

import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import { getDynamicPropsQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { WalletOperationsDialog } from "@/features/wallet";
import { Button } from "@/features/ui";
import { AssetOperation } from "@ecency/sdk";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import i18next from "i18next";
import { useMemo } from "react";
import {
  formattedNumber,
  getHbdSavingsInterestState,
  MINIMUM_HBD_SAVINGS_AMOUNT
} from "@/utils";

interface Props {
  username: string;
  className?: string;
}

export function ProfileWalletHbdInterest({ username, className }: Props) {
  const { activeUser } = useActiveAccount();
  const isOwnProfile = activeUser?.username === username;

  const { data: account } = useQuery({
    ...getAccountFullQueryOptions(username),
    enabled: Boolean(username),
  });

  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());

  const { hbdInterestRate } = useMemo(
    () => dynamicProps ?? DEFAULT_DYNAMIC_PROPS,
    [dynamicProps]
  );

  const aprAnnualPercent = useMemo(() => hbdInterestRate / 100, [hbdInterestRate]);

  const {
    savingsBalance,
    pendingInterest,
    hasSavingsBalance,
    hasPendingInterest,
    isEmpty,
    nextClaimDate,
    needsDepositToClaim,
    canClaim
  } = useMemo(
    () =>
      getHbdSavingsInterestState({
        savingsHbdBalance: account?.savings_hbd_balance,
        savingsHbdSeconds: account?.savings_hbd_seconds,
        savingsHbdSecondsLastUpdate: account?.savings_hbd_seconds_last_update,
        savingsHbdLastInterestPayment: account?.savings_hbd_last_interest_payment,
        hbdInterestRate
      }),
    [
      account?.savings_hbd_balance,
      account?.savings_hbd_seconds,
      account?.savings_hbd_seconds_last_update,
      account?.savings_hbd_last_interest_payment,
      hbdInterestRate
    ]
  );

  const pendingInterestDisplay = formattedNumber(pendingInterest);

  const nextClaimDescription = (() => {
    // Interest keeps accruing on the banked balance-seconds even after the
    // savings balance is emptied, but releasing it means transferring 0.001 HBD
    // back out of savings, so it stays stuck until something is deposited.
    if (needsDepositToClaim) {
      return i18next.t("profile-wallet.hbd-interest.deposit-to-claim", {
        amount: MINIMUM_HBD_SAVINGS_AMOUNT.toFixed(3),
      });
    }

    if (!nextClaimDate) {
      return i18next.t("profile-wallet.hbd-interest.next-unknown");
    }

    if (canClaim) {
      return i18next.t("profile-wallet.hbd-interest.next-ready");
    }

    return i18next.t("profile-wallet.hbd-interest.next-in", {
      relative: nextClaimDate.fromNow(),
    });
  })();

  const nextClaimExact = nextClaimDate?.format("LLL");

  const helperText = hasSavingsBalance
    ? i18next.t("profile-wallet.hbd-interest.note", {
        apr: aprAnnualPercent.toFixed(3),
      })
    : i18next.t("profile-wallet.hbd-interest.minimum-balance", {
        amount: MINIMUM_HBD_SAVINGS_AMOUNT.toFixed(3),
      });

  // Nothing saved and nothing accrued: there is no estimate worth a card. A
  // zero savings balance on its own is not enough to hide it, because the
  // interest already earned on it is still owed and still claimable.
  if (isEmpty) {
    return null;
  }

  return (
    <div
      className={clsx(
        "bg-white/80 dark:bg-dark-200/90 glass-box rounded-xl p-3 flex flex-col gap-4",
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {i18next.t("profile-wallet.hbd-interest.title")}
          </div>
          <div className="text-2xl font-semibold">
            {pendingInterestDisplay} HBD
          </div>
        </div>
        {/* Only offered once there is interest to collect: below 0.001 HBD the
            chain has nothing to pay out, so the button would always fail. */}
        {isOwnProfile && hasPendingInterest && (
          <WalletOperationsDialog
            asset="HBD"
            operation={AssetOperation.ClaimInterest}
            to={username}
          >
            <Button
              appearance="primary"
              className="w-full sm:w-auto"
              size="sm"
              disabled={!canClaim}
            >
              {i18next.t("profile-wallet.hbd-interest.claim-button")}
            </Button>
          </WalletOperationsDialog>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            {i18next.t("profile-wallet.hbd-interest.next-label")}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {nextClaimDescription}
          </div>
          {nextClaimExact && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {i18next.t("profile-wallet.hbd-interest.next-date", {
                date: nextClaimExact,
              })}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            {i18next.t("profile-wallet.hbd-interest.balance-label")}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {savingsBalance.toFixed(3)} HBD
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{helperText}</div>
        </div>
      </div>
    </div>
  );
}
