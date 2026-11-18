import { useEffect, useMemo, useRef, useState } from "react";
import { error } from "@/features/shared";
import { formatError } from "@/api/format-error";
import { useTransferSharedState } from "./transfer-shared-state";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import {
  getBadActorsQueryOptions,
  getDynamicPropsQueryOptions,
  getVestingDelegationsQueryOptions,
  getAccountFullQueryOptions
} from "@ecency/sdk";
import { useDebounce } from "react-use";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { parseAsset, vestsToHp } from "@/utils";

export function useDebounceTransferAccountData() {
  const { activeUser, account } = useActiveAccount();

  const {
    to,
    mode,
    amount: currentAmount,
    setAmount,
    setTo,
    autoFilledAmount,
    setAutoFilledAmount,
    amountEdited
  } = useTransferSharedState();

  const [toDebounce, setToDebounce] = useState<string>();
  const [vestingDelegationUsername, setVestingDelegationUsername] = useState<string>();
  const [toWarning, setToWarning] = useState<string>();

  const { data: badActors } = useQuery(getBadActorsQueryOptions());
  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());
  const {
    data: toData,
    error: toError,
    isLoading: toLoading
  } = useQuery(getAccountFullQueryOptions(toDebounce));
  const {
    data: vestingDelegationsData,
    error: vestingDelegationsError,
    isLoading: vestingLoading,
    isSuccess: delegationsLoaded
  } = useInfiniteQuery(getVestingDelegationsQueryOptions(vestingDelegationUsername, 1000));

  const vestingDelegations = useMemo(
    () => vestingDelegationsData?.pages?.reduce((acc, page) => [...acc, ...page], []) ?? [],
    [vestingDelegationsData?.pages]
  );

  const [delegatedAmount, amount, delegateAccount] = useMemo(() => {
    const delegateAccount =
      vestingDelegations &&
      vestingDelegations.length > 0 &&
      vestingDelegations!.find(
        (item) => (item as any).delegatee === to && (item as any).delegator === activeUser?.username
      );
    // A plain number rounded to the 3 decimals HP has, never a display string:
    // formattedNumber writes "5,000.000", which Number() reads as NaN (#2120).
    const delegatedAmount = delegateAccount
      ? Number(
          vestsToHp(
            Number(parseAsset(delegateAccount!.vesting_shares).amount),
            (dynamicProps ?? DEFAULT_DYNAMIC_PROPS).hivePerMVests
          ).toFixed(3)
        )
      : 0;

    // Only an existing delegation fills the amount (delegate_vesting_shares sets
    // an absolute value). Nothing else does: the caller's amount and what the
    // user typed before Back stay as they are (#2123).
    return [delegatedAmount, delegatedAmount > 0 ? delegatedAmount.toString() : null, delegateAccount];
  }, [activeUser?.username, dynamicProps, to, vestingDelegations]);

  const externalWallets = useMemo(() => {
    if (!toData?.profile?.tokens || !Array.isArray(toData.profile.tokens)) {
      return [];
    }

    return toData.profile.tokens
      .filter((token) => {
        const hasAddress =
          token.meta?.address &&
          typeof token.meta.address === "string" &&
          token.meta.address.trim().length > 0;
        return hasAddress && token.type === "CHAIN";
      })
      .map((token) => ({
        symbol: token.symbol.toUpperCase(),
        address: (token.meta.address as string).trim()
      }));
  }, [toData]);

  useDebounce(
    () => {
      if (to === "") {
        setToWarning(undefined);
        return;
      }

      setToWarning(badActors?.has(to?.trim().toLowerCase()) ? i18next.t("transfer.to-bad-actor") : "");
      setToDebounce(to);
    },
    500,
    [to, setTo, setToWarning, setToDebounce]
  );

  // Filled once per recipient and delegation, and only over the dialog's
  // untouched default: an amount the user typed (kept through Next and Back)
  // is never replaced (#2123), and clearing the field or typing a 0 later
  // does not bring the delegation back. The live amount is read through a
  // ref, so editing it never re-runs this.
  const currentAmountRef = useRef(currentAmount);
  currentAmountRef.current = currentAmount;
  const amountEditedRef = useRef(!!amountEdited);
  amountEditedRef.current = !!amountEdited;
  const filledFor = useRef<string | null>(null);
  // The value this hook last put in the field (kept in the dialog's shared
  // state, since this step unmounts on Next): while it still shows and the
  // user has not edited the amount, a new recipient's delegation (or the
  // default when it has none) may replace it.
  const autoFilledRef = useRef(autoFilledAmount ?? null);
  if (setAutoFilledAmount) {
    autoFilledRef.current = autoFilledAmount ?? null;
  }
  useEffect(() => {
    const autoFilled = autoFilledRef;
    const remember = (value: string | null) => {
      autoFilled.current = value;
      setAutoFilledAmount?.(value);
    };
    if (mode !== "delegate") {
      return;
    }
    const typed = currentAmountRef.current;
    // Compared as numbers: Next writes "5000" back as "5000.000".
    const isAutoFilled =
      autoFilled.current !== null && !!typed && Number(typed) === Number(autoFilled.current);
    // An amount the user edited is theirs, whatever its value.
    const untouched =
      !amountEditedRef.current && (!typed || ["0", "0.000", "0.001"].includes(typed) || isAutoFilled);
    if (amount === null) {
      // "No delegation" only once the list has loaded: before that (or if it
      // fails) a filled delegation stays, since the amount is absolute.
      if (isAutoFilled && delegationsLoaded && !amountEditedRef.current) {
        remember(null);
        filledFor.current = null;
        setAmount("0.001");
      }
      return;
    }
    const key = `${to}|${amount}`;
    if (filledFor.current === key) {
      return;
    }
    filledFor.current = key;
    if (untouched) {
      remember(amount);
      setAmount(amount);
    }
  }, [amount, delegationsLoaded, mode, setAmount, setAutoFilledAmount, to]);

  useEffect(() => {
    if (activeUser && activeUser.username && mode === "delegate") {
      setVestingDelegationUsername(activeUser.username);
    }
  }, [activeUser, mode, toData]);

  useEffect(() => {
    if (vestingDelegationsError) {
      error(...formatError(vestingDelegationsError));
    }
  }, [vestingDelegationsError]);

  useEffect(() => {
    if (toError) {
      error(...formatError(toError));
    }
  }, [toError]);

  return {
    toWarning,
    delegatedAmount,
    toData: useMemo(() => {
      if (
        [
          "transfer-saving",
          "withdraw-saving",
          "convert",
          "power-up",
          "power-down",
          "claim-interest"
        ].includes(mode)
      ) {
        return account;
      }

      return toData;
    }, [account, mode, toData]),
    toError,
    delegateAccount,
    isLoading: useMemo(() => toLoading || vestingLoading, [toLoading, vestingLoading]),
    externalWallets
  };
}
