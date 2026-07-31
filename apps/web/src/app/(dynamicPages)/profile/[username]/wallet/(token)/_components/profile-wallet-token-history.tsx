import { GeneralAssetTransaction, PointTransactionType } from "@ecency/sdk";
import { format } from "date-fns";
import { TRANSACTIONS_ICONS, TRANSACTIONS_LABELS } from "../_consts";
import { ProfileWalletTokenHistoryCard } from "./profile-wallet-token-history-card";
import { ReactNode } from "react";
import { Badge } from "@/features/ui";
import { ProfileLink, UserAvatar } from "@/features/shared";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";

interface Props {
  data: GeneralAssetTransaction[];
  action: ReactNode;
}

export function ProfileWalletTokenHistory({ data, action }: Props) {
  return (
    <ProfileWalletTokenHistoryCard action={action}>
      {data.map((transaction) => {
        const { created, type, results, from, to, id } = transaction;
        const labelFactory = TRANSACTIONS_LABELS[type] ?? (() => "");
        const numericType = Number(type);
        // A refunded burn arrives as BURNED with a positive amount, so the sign is what
        // separates "spent" from "refunded" -- there is no counterparty to read.
        const isBurnRefund =
          numericType === PointTransactionType.BURNED &&
          results.some(({ amount }) => Number(amount) > 0);

        const transferLabel =
          numericType === PointTransactionType.TRANSFER_SENT && to
            ? labelFactory(`@${to}`)
            : numericType === PointTransactionType.TRANSFER_INCOMING && from
              ? labelFactory(`@${from}`)
              : numericType === PointTransactionType.BURNED
                ? labelFactory(isBurnRefund ? "refund" : "spend")
                : labelFactory();

        const fromUser = from ? (
          <ProfileLink username={from} className="inline-block max-w-full">
            <Badge className="flex flex-wrap items-center gap-1 pl-0.5 max-w-full break-all text-left">
              <UserAvatar username={from} size="small" />
              {from}
            </Badge>
          </ProfileLink>
        ) : null;

        const toUser = to ? (
          <ProfileLink username={to} className="inline-block max-w-full">
            <Badge className="flex flex-wrap items-center gap-1 pl-0.5 max-w-full break-all text-left">
              <UserAvatar username={to} size="small" />
              {to}
            </Badge>
          </ProfileLink>
        ) : null;

        const label =
          numericType === PointTransactionType.TRANSFER_INCOMING ||
          numericType === PointTransactionType.TRANSFER_SENT ? (
            <div className="flex flex-col gap-2">
              <div className="break-words">{transferLabel}</div>
              {(fromUser || toUser) && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {fromUser}
                  {fromUser && toUser ? (
                    <UilArrowRight className="size-6 text-gray-400 dark:text-gray-600" />
                  ) : null}
                  {toUser}
                </div>
              )}
              {transaction.memo ? (
                <div className="text-sm text-gray-600 dark:text-gray-400 break-words">
                  {transaction.memo}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2 break-words">
              <div>{transferLabel}</div>
              {transaction.memo ? (
                <div className="text-sm text-gray-600 dark:text-gray-400 break-words">
                  {transaction.memo}
                </div>
              ) : null}
            </div>
          );

        return (
          <div
            className="flex flex-col gap-4 px-4 py-3 border-b border-[--border-color] last:border-0 md:flex-row md:items-start md:justify-between md:py-4"
            key={id ?? created.getTime()}
          >
            <div className="flex items-start gap-4 leading-[1]">
              <div className="text-blue-dark-sky bg-blue-duck-egg dark:bg-blue-dark-grey flex items-center justify-center p-2 rounded-lg">
                {TRANSACTIONS_ICONS[type]}
              </div>
              <div className="min-w-0">
                <div>{label}</div>
                <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                  {format(created, "dd.MM.yyyy hh:mm")}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1 text-blue-dark-sky md:items-end md:text-right">
              {results.map(({ amount }, i) => (
                <div key={i}>
                  {isNaN(+amount) ? amount : (+amount).toFixed(3)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </ProfileWalletTokenHistoryCard>
  );
}
