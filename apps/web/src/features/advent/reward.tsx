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

/// A prize as the reader sees it: "2,500 Points", "125 HIVE". A Spotlight
/// prize is a promotion of the winner's post, paid in Ecency Points, so it
/// reads "Promotion worth 1,000 Points".
export const prizeText = (kind: RewardKind, amount: number) =>
  kind === "spotlight"
    ? i18next.t("advent.spotlight-amount", { n: amount.toLocaleString("en-US") })
    : `${amount.toLocaleString("en-US")} ${rewardLabel(kind)}`;
