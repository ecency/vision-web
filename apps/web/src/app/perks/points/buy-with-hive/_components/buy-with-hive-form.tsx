import { HiveMarketAsset, MarketAsset } from "@/features/market/market-swap-form/market-pair";
import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import { useQuery } from "@tanstack/react-query";
import { getDynamicPropsQueryOptions } from "@ecency/sdk";
import { SwapAmountControl } from "@/features/market/market-swap-form/swap-amount-control";
import { Button } from "@/features/ui";
import { HiveWallet } from "@/utils";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";

interface Props {
  onSubmit: (amount: string, asset: string, pointsAmount: string) => void;
  isPending?: boolean;
}

export function BuyWithHiveForm({ onSubmit, isPending }: Props) {
  const { account } = useActiveAccount();
  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());

  const [amount, setAmount] = useState("0");
  const [asset, setAsset] = useState<MarketAsset>(HiveMarketAsset.HIVE);

  const w = useMemo(
    () =>
      account
        ? new HiveWallet(account, dynamicProps ?? DEFAULT_DYNAMIC_PROPS)
        : ({ balance: 0 } as HiveWallet),
    [account, dynamicProps]
  );
  const usdRate = useMemo(() => {
    if (asset === HiveMarketAsset.HIVE) {
      return dynamicProps ? dynamicProps.base / dynamicProps.quote : 0;
    } else if (asset === HiveMarketAsset.HBD) {
      return 1;
    }

    return 0;
  }, [asset, w, dynamicProps]);
  const balanceAmount = useMemo(() => {
    if (asset === HiveMarketAsset.HIVE) {
      return w.balance ?? 0;
    } else if (asset === HiveMarketAsset.HBD) {
      return w.hbdBalance ?? 0;
    }

    return 0;
  }, [w, asset]);
  const balance = useMemo(() => {
    if (asset === HiveMarketAsset.HIVE) {
      return balanceAmount.toFixed(2) + " HIVE";
    } else if (asset === HiveMarketAsset.HBD) {
      return balanceAmount.toFixed(2) + " HBD";
    }

    return "0";
  }, [balanceAmount, asset]);
  // The amount control formats its value as x,xxx.xxx, so the separators have to go
  // before the value is used for arithmetic or handed over to be broadcasted.
  const numericAmount = useMemo(() => +amount.replace(/,/g, ""), [amount]);
  const isAmountMoreThanBalance = useMemo(
    () => numericAmount > balanceAmount,
    [numericAmount, balanceAmount]
  );
  const pointsAmount = useMemo(
    () => ((numericAmount * usdRate) / 0.002).toFixed(2),
    [numericAmount, usdRate]
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_min-content_1fr] items-center gap-4 mt-4 md:mt-6 lg:mt-8">
        <SwapAmountControl
          value={amount}
          setValue={(e) => setAmount(e)}
          labelKey={"market.from"}
          asset={asset}
          availableAssets={[HiveMarketAsset.HBD, HiveMarketAsset.HIVE]}
          setAsset={setAsset}
          usdRate={usdRate}
          disabled={false}
          balance={balance}
          showBalance={true}
        />
        <div className="flex justify-center items-center">
          <div className=" text-blue-dark-sky p-2">
            <UilArrowRight className="size-6" />
          </div>
        </div>
        <SwapAmountControl
          value={pointsAmount}
          setValue={(e) => {}}
          labelKey={"market.to"}
          asset="POINTS"
          availableAssets={["POINTS"]}
          setAsset={() => {}}
          usdRate={0.002}
          disabled={true}
        />
      </div>
      <div>
        {isAmountMoreThanBalance && (
          <small className="usd-balance bold block text-red mt-3">
            {i18next.t("market.more-than-balance")}
          </small>
        )}
      </div>

      <div className="flex justify-end mt-4 md:mt-6 lg:mt-8">
        <Button
          icon={<UilArrowRight />}
          disabled={!numericAmount || isAmountMoreThanBalance || isPending}
          onClick={() => onSubmit(amount.replace(/,/g, ""), asset, pointsAmount)}
        >
          {i18next.t("g.continue")}
        </Button>
      </div>
    </>
  );
}
