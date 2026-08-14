"use client";

import {
  calculateRCMana,
  estimateRcPrecheck,
  getRcResourceParamsQueryOptions,
  powerRechargeTime,
  rcPower,
  type RcPrecheckPayload
} from "@ecency/sdk";
import { RcOperation } from "@/entities";
import { rcFormatter } from "@/utils";
import { useMounted } from "@/utils/use-mounted";
import { getAccountRcQueryOptions, getRcStatsQueryOptions } from "@ecency/sdk";
import { flip, shift, useFloating } from "@floating-ui/react-dom";
import { safeAutoUpdate } from "@ui/util";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/button";
import i18next from "i18next";
import dayjs, { Dayjs } from "@/utils/dayjs";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PurchaseQrDialog } from "../purchase-qr";
import "./index.scss";

interface Props {
  username: string;
  operation: RcOperation;
  /**
   * What the user is about to broadcast, when the surface knows. Supplying it
   * makes the "posts possible" count describe THIS post instead of an average
   * one, and keeps it consistent with the pre-check warning beside it.
   */
  payload?: RcPrecheckPayload;
  className?: string;
}

export const AvailableCredits = ({ username, payload, className }: Props) => {
  const [rcpFixed, setRcpFixed] = useState(0);
  const [rcp, setRcp] = useState(0);
  const [rcpRechargeDate, setRcpRechargeDate] = useState<Dayjs>(dayjs());
  const [delegated, setDelegated] = useState("0");
  const [receivedDelegation, setReceivedDelegation] = useState("0");
  const [commentAmount, setCommentAmount] = useState(0);
  const [voteAmount, setVoteAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [countsReady, setCountsReady] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);

  const [isShow, setIsShow] = useState(false);

  const { data: rcValues } = useQuery(getAccountRcQueryOptions(username));
  const { data: rcStats } = useQuery(getRcStatsQueryOptions());
  const { data: rcParams } = useQuery(getRcResourceParamsQueryOptions());

  const { refs, floatingStyles, update } = useFloating({
    whileElementsMounted: safeAutoUpdate,
    middleware: [flip(), shift()],
    placement: "top",
    transform: true
  });

  const isMounted = useMounted();

  useEffect(() => {
    if (!rcValues || !rcStats) {
      return;
    }

    const account = rcValues[0];

    setRcp(calculateRCMana(account).current_mana);
    setRcpFixed(Math.floor(+rcPower(account)));
    setRcpRechargeDate(dayjs().add(powerRechargeTime(rcPower(account)), "second"));

    const outGoing = rcValues.map((a: any) => a.delegated_rc);
    const delegated = outGoing[0];
    const formatOutGoing: any = rcFormatter(delegated);
    setDelegated(formatOutGoing);

    const inComing: any = rcValues.map((a: any) => Number(a.received_delegated_rc));
    const formatIncoming = rcFormatter(inComing);
    setReceivedDelegation(formatIncoming);

    // Same estimator the pre-check warning uses, so the two cannot contradict
    // each other. With a payload the post count describes THIS post; without
    // one it falls back to the network average, which is the honest answer to
    // "how many posts can I afford" when no post is in hand.
    const counts = (["comment_operation", "vote_operation", "transfer_operation"] as const).map(
      (op) =>
        estimateRcPrecheck({
          rcAccount: account,
          rcStats,
          rcParams,
          operation: op,
          payload: op === "comment_operation" ? payload : undefined,
          fallback: "average"
        })
    );
    const [comment, vote, transfer] = counts;
    setCountsReady(comment.ready);
    setCommentAmount(comment.ready ? comment.remaining : 0);
    setVoteAmount(vote.ready ? vote.remaining : 0);
    setTransferAmount(transfer.ready ? transfer.remaining : 0);
  }, [rcStats, rcValues, rcParams, payload]);

  const show = () => setIsShow(true);
  const hide = () => setIsShow(false);

  const portalContainer =
    typeof document !== "undefined"
      ? document.getElementById("popper-container") || document.body
      : null;

  return isMounted ? (
    <>
      <div className="available-credits flex items-center justify-between w-full pr-3">
        <div
          ref={refs.setReference}
          className={
            "available-credits-bar w-full " +
            className +
            (rcpFixed <= 10 ? " danger" : rcpFixed <= 25 ? " warning" : "")
          }
          role="progressbar"
          tabIndex={0}
          aria-label={i18next.t("rc-info.resource-credits", { defaultValue: "Resource credits" })}
          onMouseOver={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
        >
          <div className="available-credits-progress">
            <div
              className={
                "available-credits-indicator " +
                (rcpFixed <= 10 ? "danger" : rcpFixed <= 25 ? "warning" : "")
              }
              style={{ width: `${rcpFixed}%` }}
            />
          </div>
        </div>
        {/* Only once the estimate is in: a count of 0 while the curve
            parameters load is not a reason to tell someone to buy RC. */}
        {countsReady && commentAmount <= 5 ? (
          <Button
            noPadding={true}
            appearance="link"
            className="!overflow-visible"
            onClick={() => setShowPurchaseDialog(true)}
          >
            {i18next.t("rc-info.boost")}
          </Button>
        ) : (
          <></>
        )}
      </div>
      {portalContainer &&
        createPortal(
          <div
            ref={refs.setFloating}
            className={"available-credits-bar-popper " + (isShow ? "show" : "")}
            style={floatingStyles}
          >
            <div>
              <div className="p-3">
                <span className="opacity-75">{i18next.t("rc-info.resource-credits")}</span>
                <div>
                  {rcFormatter(rcp)}({rcpFixed}%)
                </div>
                <div>
                  {rcpFixed !== 100 && (
                    <small>
                      {i18next.t("profile-info.recharge-time", { n: rcpRechargeDate.fromNow() })}
                    </small>
                  )}
                </div>
              </div>
              <div className="delegations flex flex-col p-3">
                <span className="incoming mb-2">
                  <div className="opacity-75">{i18next.t("rc-info.received-delegations")}</div>
                  {receivedDelegation}
                </span>
                <span className="outgoing">
                  <div className="opacity-75">{i18next.t("rc-info.delegated")}</div>
                  {delegated}
                </span>
              </div>
            </div>

            <div className="extra-details p-2">
              <span className="block mb-3 opacity-50">
                {i18next.t("rc-info.extra-details-heading")}
              </span>
              <div className="extras">
                <div className="mb-2">
                  <div className="opacity-75">{i18next.t("rc-info.extra-details-post")}</div>
                  {commentAmount}
                </div>
                <div className="two-col">
                  <div className="mb-2">
                    <div className="opacity-75">{i18next.t("rc-info.extra-details-upvote")}</div>
                    {voteAmount}
                  </div>
                  <div>
                    <div className="opacity-75">{i18next.t("rc-info.extra-details-transfer")}</div>
                    {transferAmount}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          portalContainer
        )}
      <PurchaseQrDialog show={showPurchaseDialog} setShow={(v) => setShowPurchaseDialog(v)} />
    </>
  ) : (
    <></>
  );
};
