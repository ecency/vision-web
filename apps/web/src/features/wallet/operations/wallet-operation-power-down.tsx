import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import { availableForPowerDown as availablePowerDown, powerDownAvailableFromVests } from "./operation-amount";
import { getDynamicPropsQueryOptions, getAccountWalletAssetInfoQueryOptions } from "@ecency/sdk";
import { Button } from "@/features/ui";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { hpToVests } from "@/features/shared/transfer/hp-to-vests";
import { dateToFullRelative, formatNumber } from "@/utils";
import { yupResolver } from "@hookform/resolvers/yup";
import { useQuery } from "@tanstack/react-query";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FormProvider, Resolver, useForm } from "react-hook-form";
import * as yup from "yup";
import { WalletOperationCard } from "./wallet-opearation-card";
import { WalletOperationAmountForm } from "./wallet-operation-amount-form";
import { getPowerDownSchedule } from "./get-power-down-schedule";

interface Props {
  asset: string;
  username: string;
  showSubmit: boolean;
  onSubmit: (data: { amount: string; from: string; hpAmount: string }) => void;
}

export function WalletOperationPowerDown({ username, asset, onSubmit, showSubmit }: Props) {
  const { data: accountWallet } = useQuery(
    getAccountWalletAssetInfoQueryOptions(username, asset)
  );
  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());
  const { data: account } = useQuery(getAccountFullQueryOptions(username));

  const hivePerMVests = (dynamicProps ?? DEFAULT_DYNAMIC_PROPS).hivePerMVests;

  const powerDownSchedule = useMemo(
    () => getPowerDownSchedule(account ?? undefined, hivePerMVests),
    [account, hivePerMVests]
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

  const outgoingDelegations = useMemo(
    () =>
      Number(
        accountWallet?.parts?.find((part) => part.name === "outgoing_delegations")
          ?.balance ?? 0
      ),
    [accountWallet?.parts]
  );

  const pendingPowerDown = useMemo(
    () =>
      Number(
        accountWallet?.parts?.find((part) => part.name === "pending_power_down")
          ?.balance ?? 0
      ),
    [accountWallet?.parts]
  );

  const availableForPowerDown = useMemo(
    () =>
      // The account's VESTS are exact; the wallet parts are only a stand-in
      // until the account loads.
      account && dynamicProps
        ? powerDownAvailableFromVests(account, hivePerMVests)
        : availablePowerDown(hpBalance, outgoingDelegations, pendingPowerDown),
    [account, dynamicProps, hivePerMVests, hpBalance, outgoingDelegations, pendingPowerDown]
  );

  const maxAccountBalanceRef = useRef(availableForPowerDown);

  useEffect(() => {
    maxAccountBalanceRef.current = availableForPowerDown;
  }, [availableForPowerDown]);

  const resolver = useCallback<Resolver<{ amount: number }, unknown, { amount: number }>>(
    (...args) =>
      yupResolver(
        yup.object({
          amount: yup
            .number()
            .required(i18next.t("validation.required"))
            .min(maxAccountBalanceRef.current > 0 ? 0.001 : 0)
            .max(Math.max(maxAccountBalanceRef.current, 0)),
        })
      )(...args),
    []
  );

  const methods = useForm({
    resolver,
    defaultValues: {
      amount: availableForPowerDown,
    },
  });

  useEffect(() => {
    methods.setValue("amount", availableForPowerDown);
  }, [availableForPowerDown, methods]);

  const amountValue = methods.watch("amount");

  return (
    <div className="grid">
      <div className="grid grid-cols-1 md:grid-cols-2">
        <WalletOperationCard
          label="from"
          asset={asset}
          username={username}
          onBalanceClick={() => methods.setValue("amount", availableForPowerDown)}
        />
      </div>

      <FormProvider {...methods}>
        <form
          className="block"
          onSubmit={methods.handleSubmit(({ amount }) => {
            onSubmit({
              amount: hpToVests(Number(amount), hivePerMVests),
              from: username,
              hpAmount: `${formatNumber(amount, 3)} HP`,
            });
          })}
        >
          {powerDownSchedule && (
            <div className="border border-[--border-color] rounded-lg bg-gray-100 dark:bg-gray-900 p-4 flex flex-col gap-2 text-sm mb-4">
              <div className="font-semibold text-red-600 dark:text-red-400">
                {i18next.t("transfer.powering-down")}
              </div>
              <div>
                {i18next.t("wallet.next-power-down", {
                  time: dateToFullRelative(powerDownSchedule.nextWithdrawal),
                  amount: `${formatNumber(powerDownSchedule.weeklyHp, 3)} HP`,
                  weeks: powerDownSchedule.weeks,
                })}
              </div>
              <div>
                {i18next.t("wallet.power-down-total", {
                  amount: `${formatNumber(powerDownSchedule.totalHp, 3)} HP`,
                })}
              </div>

              <div>
                <Button
                  type="button"
                  appearance="danger"
                  outline={true}
                  size="sm"
                  onClick={() =>
                    onSubmit({
                      amount: hpToVests(0, hivePerMVests),
                      from: username,
                      hpAmount: "0 HP",
                    })
                  }
                >
                  {i18next.t("transfer.stop-power-down")}
                </Button>
              </div>
            </div>
          )}

          <div className="border-y border-[--border-color] flex flex-col py-4 gap-4 font-mono">
            <WalletOperationAmountForm readonly={!showSubmit} showMemo={false} />
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
                icon={<UilArrowRight />}
                disabled={!amountValue || Number(amountValue) <= 0}
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
