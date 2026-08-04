import { t } from "@/core";
import type { RewardType } from "@/core";

/**
 * The author's reward choice for this post, offered only where the instance
 * asked for it (`features.hive.authorRewards`, resolved by `useHiveLayer`).
 *
 * Two things this panel does unconditionally, on every selection including the
 * untouched one: it prints the split about to be broadcast, and it prints that
 * the split cannot be changed afterwards. A reward choice is written into a
 * `comment_options` operation that lives on chain forever and that no edit can
 * reach, so an author has to be able to read what they are about to sign
 * without opening the select.
 *
 * The instance has no say in the value. It only decides whether this component
 * renders at all. There is no configurable split and no configurable
 * beneficiary, because on a community instance the composer is used by other
 * people and an instance-level value would rewrite a stranger's payout terms.
 */

type OptionLabelKey =
  | "reward_split_default"
  | "reward_split_sp"
  | "reward_split_dp";

const OPTION_LABELS: Record<RewardType, OptionLabelKey> = {
  default: "reward_split_default",
  sp: "reward_split_sp",
  dp: "reward_split_dp",
};

const ORDER: RewardType[] = ["default", "sp", "dp"];

interface Props {
  value: RewardType;
  onChange: (value: RewardType) => void;
  disabled?: boolean;
}

export function PublishRewardSelector({ value, onChange, disabled }: Props) {
  const summaryId = "publish-reward-summary";

  return (
    <div className="flex flex-col gap-1 text-right max-w-sm">
      <label
        className="text-xs text-theme-muted"
        htmlFor="publish-reward-select"
      >
        {t("reward_split_label")}
      </label>
      <select
        id="publish-reward-select"
        className="text-sm px-2 py-1 rounded-lg border border-theme bg-transparent"
        value={value}
        disabled={disabled}
        aria-describedby={summaryId}
        onChange={(e) => onChange(e.target.value as RewardType)}
      >
        {ORDER.map((option) => (
          <option key={option} value={option}>
            {t(OPTION_LABELS[option])}
          </option>
        ))}
      </select>
      {/*
        Printed for every selection, never only for the ones that emit an
        operation: an author who never opens the select still gets told what
        their post pays and that it is settled at publish.
      */}
      <p className="text-xs text-theme-muted" id={summaryId}>
        {t("reward_split_broadcast")} {t(OPTION_LABELS[value])}
      </p>
      <p className="text-xs text-theme-muted">{t("reward_split_permanent")}</p>
    </div>
  );
}
