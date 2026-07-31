import { PointTransactionType } from "@ecency/sdk";
import i18next from "i18next";
import { ReactNode } from "react";

export const TRANSACTIONS_LABELS: Record<string, (...args: string[]) => ReactNode> = {
  [PointTransactionType.CHECKIN]: () => i18next.t("points.checkin-list-desc"),
  [PointTransactionType.CHECKIN_EXTRA]: () => i18next.t("points.checkin-extra-desc"),
  [PointTransactionType.COMMENT]: () => i18next.t("points.comment-list-desc"),
  [PointTransactionType.COMMUNITY]: () => i18next.t("points.community-list-desc"),
  [PointTransactionType.DELEGATION]: () => i18next.t("points.delegation-list-desc"),
  [PointTransactionType.LOGIN]: () => i18next.t("points.login-list-desc"),
  [PointTransactionType.MINTED]: () => "",
  [PointTransactionType.POST]: () => i18next.t("points.post-list-desc"),
  [PointTransactionType.REBLOG]: () => i18next.t("points.reblog-list-desc"),
  [PointTransactionType.REFERRAL]: () => i18next.t("points.referral-list-desc"),
  [PointTransactionType.TRANSFER_INCOMING]: (n: string) =>
    i18next.t("points.transfer-incoming-list-desc", { n }),
  [PointTransactionType.TRANSFER_SENT]: (n: string) =>
    i18next.t("points.transfer-sent-list-desc", { n }),
  [PointTransactionType.VOTE]: () => i18next.t("points.vote-list-desc"),
  // A burn carries no counterparty, and a refunded burn comes back as the same type
  // with a positive amount -- so the caller passes the direction rather than this
  // assuming a burn is always a debit.
  [PointTransactionType.BURNED]: (direction?: string) =>
    direction === "refund"
      ? i18next.t("points.burn-refund-list-desc")
      : i18next.t("points.burned-list-desc")
};
