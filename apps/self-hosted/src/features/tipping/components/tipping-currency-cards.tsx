"use client";

import { useInstanceConfig } from "@/features/blog/hooks/use-instance-config";
import { getAccountWalletListQueryOptions } from "@ecency/sdk/wallets";
import { useQuery } from "@tanstack/react-query";
import { TippingCurrencyCard } from "./tipping-currency-card";
import { isExternalWalletAsset } from "../types";

interface TippingCurrencyCardsProps {
  selectedAsset: string | undefined;
  onAssetSelect: (asset: string) => void;
}

export function TippingCurrencyCards({
  selectedAsset,
  onAssetSelect,
}: TippingCurrencyCardsProps) {
  const { username } = useInstanceConfig();
  const { data: walletList } = useQuery({
    ...getAccountWalletListQueryOptions(username, "usd"),
    select: (data) =>
      data.filter(
        (asset) =>
          ["HIVE", "HP", "HBD", "POINTS"].includes(asset) ||
          isExternalWalletAsset(asset),
      ),
  });

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {walletList?.map((asset) => (
        <TippingCurrencyCard
          key={asset}
          asset={asset}
          selectedAsset={selectedAsset}
          onAssetSelect={() => onAssetSelect(asset)}
        />
      ))}
    </div>
  );
}
