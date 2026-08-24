import React, { useMemo } from "react";
import type { TransferAsset } from "./index";
import { getTokenLogo } from "@/features/wallet";
import Image from "next/image";
import { proxifyImageSrc } from "@ecency/render-helper";
import clsx from "clsx";

interface AssetSwitchProps {
  options: TransferAsset[];
  selected: TransferAsset;
  onChange: (i: TransferAsset) => void;
  tokenIcons?: Record<string, string | undefined>;
}
export function TransferAssetSwitch({
  options,
  selected,
  onChange,
  tokenIcons
}: AssetSwitchProps) {
  const engineTokenLogo = useMemo(() => {
    if (!tokenIcons || !(selected in tokenIcons)) {
      return null;
    }

    const icon = tokenIcons[selected];

    if (icon) {
      return (
        <span
          className={clsx(
            "rounded-lg border border-[--border-color] bg-white dark:bg-gray-950 p-0.5",
            "inline-flex items-center justify-center min-w-[20px] max-w-[20px] h-5"
          )}
        >
          <Image
            alt=""
            src={proxifyImageSrc(icon, 40, 40, "match")}
            width={20}
            height={20}
            className="size-4 object-contain"
          />
        </span>
      );
    }

    return (
      <span
        className={clsx(
          "rounded-lg border border-[--border-color] bg-white dark:bg-gray-950",
          "inline-flex items-center justify-center min-w-[20px] max-w-[20px] h-5",
          "text-[10px] font-semibold uppercase text-gray-600 dark:text-gray-200"
        )}
      >
        HE
      </span>
    );
  }, [selected, tokenIcons]);

  return (
    <div className="asset-switch">
      <div className="relative">
        <select
          className="asset inline-flex items-center gap-2 pr-10"
          value={selected}
          onChange={(e) => onChange(e.target.value as TransferAsset)}
        >
          {options.map((opt) => (
            <option value={opt} key={opt}>
              {opt}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
          {engineTokenLogo ?? getTokenLogo(selected, 20)}
        </span>
      </div>
    </div>
  );
}
