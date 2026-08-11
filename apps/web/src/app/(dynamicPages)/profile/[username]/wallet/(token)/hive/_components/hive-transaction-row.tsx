import { cashCoinSvg, cashMultiple, exchangeSvg, reOrderHorizontalSvg, ticketSvg } from "@/assets/img/svg";
import { Transaction } from "@/entities";
import { Tsx } from "@/features/i18n/helper";
import { EntryLink, ProfileLink, UserAvatar } from "@/features/shared";
import { TwoUserAvatar } from "@/features/shared/two-user-avatar";
import { formattedNumber, parseAsset } from "@/utils";
import { UilArrowRight, UilRefresh } from "@tooni/iconscout-unicons-react";
import { ProfileWalletTokenHistoryHiveItem } from "../../_components";
import { Badge } from "@/features/ui";
import { MemoDisplay } from "@/features/shared/memo-display";
import { closeSvg } from "@ui/svg";

import { VoteChevron } from "@/features/shared/vote-chevron";
import { SliderChevron } from "@/features/shared/slider-chevron";
interface Props {
  transaction: Transaction;
  entry?: Transaction;
  onMounted?: () => void;
}

function ParticipantBadge({ username }: { username: string }) {
  return (
    <ProfileLink username={username} className="max-w-full">
      <Badge className="flex max-w-full items-center gap-1 pl-0.5 pr-1 text-left text-sm leading-tight break-all">
        <UserAvatar username={username} size="small" />
        <span className="break-all">{username}</span>
      </Badge>
    </ProfileLink>
  );
}

function TransferParticipants({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ParticipantBadge username={from} />
      <UilArrowRight className="size-6 shrink-0 text-gray-400 dark:text-gray-600" />
      <ParticipantBadge username={to} />
    </div>
  );
}

export function HiveTransactionRow({ entry, transaction: tr }: Props) {
  let flag = true;
  let icon = ticketSvg;
  let numbers = null;
  let details = null;

  if (tr.type === "claim_reward_balance") {
    const reward_hive = parseAsset(tr.reward_hive);

    numbers = (
      <>
        {reward_hive.amount > 0 && (
          <span className="number">{formattedNumber(reward_hive.amount, { suffix: "HIVE" })}</span>
        )}
      </>
    );
  } else if (tr.type === "author_reward" || tr.type === "comment_benefactor_reward") {
    icon = cashCoinSvg;
    const hive_payout = parseAsset(tr.hive_payout);
    numbers = (
      <>
        {hive_payout.amount > 0 && (
          <span className="number">{formattedNumber(hive_payout.amount, { suffix: "HIVE" })}</span>
        )}
      </>
    );

    details = (
      <EntryLink
        entry={{
          category: "history",
          author: tr.author,
          permlink: tr.permlink
        }}
      >
        <span>
          {"@"}
          {tr.author}/{tr.permlink}
        </span>
      </EntryLink>
    );
  } else if (tr.type === "curation_reward") {
    icon = cashCoinSvg;
    const reward = parseAsset(tr.reward);
    numbers = (
      <>
        {reward.amount > 0 && (
          <span className="number">{formattedNumber(reward.amount, { suffix: reward.symbol })}</span>
        )}
      </>
    );

    // Depending on the history source the curated post is reported either as
    // comment_author/comment_permlink or as author/permlink.
    const curatedAuthor = tr.comment_author ?? tr.author;
    const curatedPermlink = tr.comment_permlink ?? tr.permlink;

    details =
      curatedAuthor && curatedPermlink ? (
        <EntryLink
          entry={{
            category: "history",
            author: curatedAuthor,
            permlink: curatedPermlink
          }}
        >
          <span>
            {"@"}
            {curatedAuthor}/{curatedPermlink}
          </span>
        </EntryLink>
      ) : null;
  } else if (
    tr.type === "transfer" ||
    tr.type === "transfer_to_vesting" ||
    tr.type === "transfer_to_savings" ||
    tr.type === "transfer_from_savings" ||
    tr.type === "fill_transfer_from_savings"
  ) {
    flag = true;
    icon = <UilArrowRight className="size-4" />;

    details = (
      <div className="space-y-2">
        <TransferParticipants from={tr.from} to={tr.to} />
        {tr.memo ? (
          tr.memo.startsWith("#") ? (
            <MemoDisplay memo={tr.memo} />
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400 break-words">{tr.memo}</div>
          )
        ) : null}
      </div>
    );

    numbers = <span className="number">{tr.amount}</span>;
  } else if (tr.type === "recurrent_transfer" || tr.type === "fill_recurrent_transfer") {
    flag = true;
    icon = <UilRefresh className="size-4" />;

    const recurrentDescription =
      tr.type === "recurrent_transfer" ? (
        <Tsx
          k="transactions.type-recurrent_transfer-detail"
          args={{ executions: tr.executions, recurrence: tr.recurrence }}
        >
          <span className="block" />
        </Tsx>
      ) : (
        <Tsx
          k="transactions.type-fill_recurrent_transfer-detail"
          args={{ remaining_executions: tr.remaining_executions }}
        >
          <span className="block" />
        </Tsx>
      );

    details = (
      <div className="space-y-2">
        {tr.memo ? (
          tr.memo.startsWith("#") ? (
            <MemoDisplay memo={tr.memo} />
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400 break-words">{tr.memo}</div>
          )
        ) : null}
        <div className="text-sm text-gray-600 dark:text-gray-400">{recurrentDescription}</div>
        <TransferParticipants from={tr.from} to={tr.to} />
      </div>
    );
    let aam = tr.amount as any;
    if (tr.type === "fill_recurrent_transfer") {
      const t = parseAsset(tr.amount);
      aam = `${t.amount} ${t.symbol}`;
    }
    numbers = <span className="number">{aam}</span>;
  } else if (tr.type === "cancel_transfer_from_savings") {
    icon = closeSvg;

    details = (
      <Tsx
        k="transactions.type-cancel_transfer_from_savings-detail"
        args={{ from: tr.from, request: tr.request_id }}
      >
        <span />
      </Tsx>
    );
  } else if (tr.type === "fill_order") {
    icon = reOrderHorizontalSvg;

    numbers = (
      <span className="number">
        {tr.current_pays} = {tr.open_pays}
      </span>
    );
  } else if (tr.type === "limit_order_create" || tr.type === "limit_order_create2") {
    icon = reOrderHorizontalSvg;

    numbers = (
      <span className="number">
        {tr.amount_to_sell} = {tr.min_to_receive}
      </span>
    );
  } else if (tr.type === "limit_order_cancel") {
    icon = reOrderHorizontalSvg;

    numbers = <span className="number">{tr.num}</span>;
    details = tr.owner ? (
      <span>
        <strong>Order ID: {tr.orderid}</strong>
      </span>
    ) : null;
  } else if (tr.type === "interest") {
    icon = cashMultiple;

    numbers = <span className="number">{tr.interest}</span>;
  } else if (tr.type === "fill_convert_request") {
    icon = reOrderHorizontalSvg;

    numbers = (
      <span className="number">
        {tr.amount_in} = {tr.amount_out}
      </span>
    );
  } else if (tr.type === "fill_collateralized_convert_request") {
    icon = reOrderHorizontalSvg;

    numbers = (
      <span className="number">
        {tr.amount_in} = {tr.amount_out}
      </span>
    );
    details = (
      <Tsx
        k="transactions.type-fill_collateralized_convert-detail"
        args={{ request: tr.requestid, returned: tr.excess_collateral }}
      >
        <span />
      </Tsx>
    );
  } else if (tr.type === "proposal_pay") {
    icon = ticketSvg;

    numbers = <span className="number">{tr.payment}</span>;
  } else if (tr.type === "update_proposal_votes") {
    icon = tr.approve ? <VoteChevron /> : <SliderChevron direction="down" />;

    details = (
      <Tsx k="transactions.type-update_proposal_vote-detail" args={{ pid: tr.proposal_ids }}>
        <span />
      </Tsx>
    );
  } else if (tr.type === "collateralized_convert") {
    icon = exchangeSvg;
    const amount = parseAsset(tr.amount);

    numbers = (
      <>
        {amount.amount > 0 && (
          <span className="number">{formattedNumber(amount.amount, { suffix: "HIVE" })}</span>
        )}
      </>
    );

    details = (
      <Tsx k="transactions.type-collateralized_convert-detail" args={{ request: tr.requestid }}>
        <span />
      </Tsx>
    );
  } else if (tr.type === "account_witness_proxy") {
    icon = tr.proxy ? (
      <TwoUserAvatar from={tr.account} to={tr.proxy} size="small" />
    ) : (
      <UserAvatar username={tr.account} size="small" />
    );

    details = (
      <span>
        <strong>@{tr.account}</strong> -&gt; <strong>{tr.proxy ? `@${tr.proxy}` : ""}</strong>
      </span>
    );
  } else {
    flag = false;
  }

  if (flag) {
    return (
      <ProfileWalletTokenHistoryHiveItem
        icon={icon}
        type={tr.type}
        timestamp={tr.timestamp}
        numbers={numbers}
        rawDetails={tr}
      >
        {details}
      </ProfileWalletTokenHistoryHiveItem>
    );
  }

  return (
    <ProfileWalletTokenHistoryHiveItem
      icon={icon}
      type={tr.type}
      timestamp={tr.timestamp}
      numbers={numbers}
      rawDetails={tr}
    >
      <code>{JSON.stringify(tr)}</code>
    </ProfileWalletTokenHistoryHiveItem>
  );
}
