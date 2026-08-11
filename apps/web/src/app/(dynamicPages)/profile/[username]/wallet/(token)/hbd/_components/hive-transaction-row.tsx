import { cashCoinSvg, ticketSvg, reOrderHorizontalSvg, exchangeSvg } from "@/assets/img/svg";
import { Transaction } from "@/entities";
import { Tsx } from "@/features/i18n/helper";
import { EntryLink, ProfileLink, UserAvatar } from "@/features/shared";
import { formattedNumber, parseAsset } from "@/utils";
import { UilArrowRight, UilRefresh } from "@tooni/iconscout-unicons-react";
import { ProfileWalletTokenHistoryHiveItem } from "../../_components";
import { Badge } from "@/features/ui";
import { MemoDisplay } from "@/features/shared/memo-display";

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

  if (tr.type === "author_reward" || tr.type === "comment_benefactor_reward") {
    icon = cashCoinSvg;
    const hbd_payout = parseAsset(tr.hbd_payout);
    numbers = hbd_payout.amount > 0 && (
      <span className="number">{formattedNumber(hbd_payout.amount, { suffix: "HBD" })}</span>
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
  } else if (tr.type === "claim_reward_balance") {
    const reward_hbd = parseAsset(tr.reward_hbd);

    numbers = reward_hbd.amount > 0 && (
      <span className="number">{formattedNumber(reward_hbd.amount, { suffix: "HBD" })}</span>
    );
  } else if (
    tr.type === "transfer" ||
    tr.type === "transfer_to_vesting" ||
    tr.type === "transfer_to_savings"
  ) {
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
  } else if (tr.type === "proposal_pay") {
    icon = ticketSvg;
    const payment = parseAsset(tr.payment);
    numbers = <span className="number">{formattedNumber(payment.amount, { suffix: payment.symbol })}</span>;
    details = (
      <div className="space-y-1">
        <div className="text-sm">
          <span className="text-gray-600 dark:text-gray-400">Receiver: </span>
          <ProfileLink username={tr.receiver}>
            <Badge className="inline-flex items-center gap-1 text-sm">
              <UserAvatar username={tr.receiver} size="small" />
              <span>{tr.receiver}</span>
            </Badge>
          </ProfileLink>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Proposal #{tr.proposal_id}
        </div>
      </div>
    );
  } else if (
    tr.type === "transfer_from_savings" ||
    tr.type === "fill_transfer_from_savings"
  ) {
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
  } else if (tr.type === "cancel_transfer_from_savings") {
    icon = ticketSvg;
    details = (
      <Tsx k="transactions.type-cancel_transfer_from_savings-detail" args={{ from: tr.from, request: tr.request_id }}>
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
    details = (
      <span>
        <strong>Order ID: {tr.orderid}</strong>
      </span>
    );
  } else if (tr.type === "fill_convert_request") {
    icon = exchangeSvg;
    numbers = (
      <span className="number">
        {tr.amount_in} = {tr.amount_out}
      </span>
    );
  } else if (tr.type === "fill_collateralized_convert_request") {
    icon = exchangeSvg;
    details = (
      <Tsx
        k="transactions.type-fill_collateralized_convert-detail"
        args={{ request: tr.requestid, returned: tr.excess_collateral }}
      >
        <span />
      </Tsx>
    );
  } else if (tr.type === "interest") {
    icon = cashCoinSvg;
    numbers = <span className="number">{tr.interest}</span>;
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
