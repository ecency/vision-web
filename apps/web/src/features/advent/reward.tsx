import i18next from "i18next";
import { UilArrowRight, UilArrowUp, UilBolt, UilCoins, UilStar } from "@tooni/iconscout-unicons-react";
import type { RewardKind } from "./types";

export const rewardIcon = (kind: RewardKind | undefined) => {
  switch (kind) {
    case "points":
      return <UilCoins className="size-3.5" aria-hidden />;
    case "hive":
      return <UilBolt className="size-3.5" aria-hidden />;
    case "hp":
      return <UilArrowUp className="size-3.5" aria-hidden />;
    case "delegation":
      return <UilArrowRight className="size-3.5" aria-hidden />;
    case "spotlight":
      return <UilStar className="size-3.5" aria-hidden />;
    default:
      return null;
  }
};
export const rewardLabel = (kind: RewardKind) => i18next.t(`advent.reward-${kind}`);

/// Prize amounts as the reader sees them, in their own number format:
/// "2,500 Points", "125 HIVE", or for a door's places "2,500 / 1,500 / 1,000
/// Points". A Spotlight prize is a promotion of the winner's post, paid in
/// Ecency Points, so it reads "Promotion worth 1,000 Points".
export const prizesText = (kind: RewardKind, amounts: number[]) => {
  const n = amounts.map((a) => a.toLocaleString()).join(" / ");
  return kind === "spotlight" ? i18next.t("advent.spotlight-amount", { n }) : `${n} ${rewardLabel(kind)}`;
};
export const prizeText = (kind: RewardKind, amount: number) => prizesText(kind, [amount]);
