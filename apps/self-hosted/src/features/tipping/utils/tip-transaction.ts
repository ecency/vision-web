import { broadcast } from "@/features/auth";
import { getQueryClient } from "@ecency/sdk";
import { getAccountWalletAssetInfoQueryOptions } from "@ecency/sdk/wallets";
import type { Operation } from "@ecency/sdk";
import type { TippingAsset } from "../types";

export interface ExecuteTipParams {
  from: string;
  to: string;
  amount: string;
  asset: TippingAsset;
  memo: string;
}

/**
 * Execute tip: transfer HIVE, HBD, or POINTS.
 * Uses current auth (keychain, hivesigner, hiveauth) to broadcast.
 * `amount` is a USD value that is converted to the asset amount via its USD price.
 */
export async function executeTip(params: ExecuteTipParams): Promise<void> {
  const { from, to, amount, asset, memo } = params;

  const usdAmount = parseFloat(amount);
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    throw new Error("Invalid amount");
  }

  const info = await getQueryClient().ensureQueryData(
    getAccountWalletAssetInfoQueryOptions(to, asset),
  );
  const price = info?.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error(`Missing USD price for ${asset}`);
  }

  // Hive chain requires transfer amounts formatted with exactly 3 decimals.
  const assetAmount = (usdAmount / price).toFixed(3);

  let operations: Operation[];

  if (asset === "HIVE" || asset === "HBD") {
    operations = [
      [
        "transfer",
        {
          from,
          to,
          amount: `${assetAmount} ${asset}`,
          memo,
        },
      ],
    ];
  } else if (asset === "POINTS") {
    operations = [
      [
        "custom_json",
        {
          id: "ecency_point_transfer",
          json: JSON.stringify({
            sender: from,
            receiver: to,
            amount: `${assetAmount} POINT`,
            memo,
          }),
          required_auths: [from],
          required_posting_auths: [],
        },
      ],
    ];
  } else {
    throw new Error(`Unsupported asset: ${asset}`);
  }

  await broadcast(operations, { authorityType: "Active" });
}
