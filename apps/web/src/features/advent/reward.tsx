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
