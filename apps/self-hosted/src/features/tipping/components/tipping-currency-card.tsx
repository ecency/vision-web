import { useInstanceConfig } from "@/features/blog/hooks/use-instance-config";
import { getAccountWalletAssetInfoQueryOptions } from "@ecency/sdk/wallets";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

interface Props {
  asset: string;
  selectedAsset: string | undefined;
  onAssetSelect: (value: string) => void;
}

export function TippingCurrencyCard({
  asset,
  selectedAsset,
  onAssetSelect,
}: Props) {
  const { username } = useInstanceConfig();
  const { data } = useQuery(
    getAccountWalletAssetInfoQueryOptions(username, asset),
  );
  return (
    <button
      key={asset}
      type="button"
      className={clsx(
        "flex items-center gap-2 px-3 py-2 rounded-md border text-sm",
        selectedAsset === asset
          ? "border-theme-accent bg-theme-tertiary text-theme-primary"
          : "border-theme bg-theme-primary text-theme-primary hover:bg-theme-tertiary",
      )}
      onClick={() => onAssetSelect(asset)}
    >
      {data?.title}
    </button>
  );
}
