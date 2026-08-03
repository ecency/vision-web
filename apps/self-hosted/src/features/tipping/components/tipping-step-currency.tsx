import { t } from "@/core";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { isExternalWalletAsset } from "../types";
import { TippingCurrencyCards } from "./tipping-currency-cards";
import { TippingWalletQr } from "./tipping-wallet-qr";
import { getTipSubmitLabelKey } from "../utils/tip-submit-label";
import { useAuth } from "@/features/auth";

interface TippingStepCurrencyProps {
  to: string;
  amount: string;
  onAmountChange: (value: string) => void;
  selectedAsset: string | undefined;
  onAssetSelect: (asset: string) => void;
  error: string | undefined;
  canSubmit: boolean;
  loading: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

const inputClassName =
  "w-full mb-3 px-3 py-2 rounded-md border border-theme bg-theme-primary text-theme-primary text-sm";

function useRecipientWalletAddress(to: string, asset: string | undefined) {
  const enabled = !!to && !!asset && isExternalWalletAsset(asset);
  const { data: account } = useQuery({
    ...getAccountFullQueryOptions(to),
    enabled,
  });
  if (!enabled || !account?.profile?.tokens) return undefined;
  const token = account.profile.tokens.find(
    (token) => token.symbol?.toUpperCase() === asset?.toUpperCase(),
  );
  const address = token?.meta?.address;
  return typeof address === "string" && address.trim() ? address : undefined;
}

export function TippingStepCurrency({
  to,
  amount,
  onAmountChange,
  selectedAsset,
  onAssetSelect,
  error,
  canSubmit,
  loading,
  onCancel,
  onSubmit,
}: TippingStepCurrencyProps) {
  const { user } = useAuth();

  const isExternal =
    selectedAsset !== undefined && isExternalWalletAsset(selectedAsset);
  const recipientAddress = useRecipientWalletAddress(to, selectedAsset);

  return (
    <>
      <div className="text-sm font-medium mb-2 text-theme-muted">
        {t("tip_amount")}
      </div>
      <input
        type="number"
        min="0"
        step="0.001"
        placeholder="0"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        className={inputClassName}
      />
      <div className="text-sm font-medium mb-2 text-theme-muted">
        {t("tip_currency")}
      </div>
      <TippingCurrencyCards
        selectedAsset={selectedAsset}
        onAssetSelect={onAssetSelect}
      />
      {isExternal && (
        <>
          <div className="text-sm font-medium mb-2 text-theme-muted">
            {t("tip_wallet_address")}
          </div>
          {recipientAddress ? (
            <div className="mb-3 flex flex-col items-center gap-2">
              <TippingWalletQr address={recipientAddress} size={180} />
              <span className="break-all font-mono text-xs text-theme-muted">
                {recipientAddress}
              </span>
            </div>
          ) : (
            <div className="mb-3 rounded border border-theme bg-theme-tertiary px-3 py-2 text-sm text-theme-muted">
              {t("tip_no_wallet_address")}
            </div>
          )}
        </>
      )}
      {error && (
        <div className="mb-3 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="px-3 py-2 rounded-md text-sm"
          onClick={onCancel}
        >
          {t("cancel")}
        </button>
        {!isExternal && (
          <button
            type="button"
            disabled={!canSubmit}
            className="px-3 py-2 rounded-md border border-theme text-theme-primary text-sm hover:bg-theme-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSubmit}
          >
            {t(getTipSubmitLabelKey(user?.username, loading))}
          </button>
        )}
      </div>
    </>
  );
}
