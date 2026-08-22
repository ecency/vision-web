"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { Account, Entry } from "@/entities";
import { LoginRequired } from "@/features/shared/login-required";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { giftOutlineSvg } from "@ui/svg";
import useMount from "react-use/lib/useMount";
import useUnmount from "react-use/lib/useUnmount";
import { EcencyConfigManager } from "@/config";
import { PostTipsResponse } from "@ecency/sdk";
import { Popover, PopoverContent } from "@/features/ui";
import { formattedNumber } from "@/utils";

// The tip transfer modal is interaction-gated (renders only when the dialog
// opens) and drags the write-flow → @ecency/wallets → bip39 graph. Load it
// lazily so that heavy chunk stays off the eager feed/profile/community read
// path (previously pulled in eagerly via EntryVoteBtn → EntryVoteDialog →
// EntryTipBtn). ssr:false is correct: it never renders during SSR.
const Transfer = dynamic(
  () => import("@/features/shared/transfer").then((m) => ({ default: m.Transfer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-40 opacity-60">
        {i18next.t("g.loading")}
      </div>
    )
  }
);

interface Props {
  entry: Entry;
  account?: Account;
  setTipDialogMounted?: (d: boolean) => void;
  handleClickAway?: () => void;
  postTips?: PostTipsResponse;
  inlineTipButton?: boolean;
  // Feed-provided fallbacks (waves feed) so a card can show the count and an
  // already-tipped state without the per-item /post-tips fetch that detail pages
  // make. When `postTips` (the full breakdown) is present it wins.
  tipCount?: number;
  tippedByViewer?: boolean;
}

export function EntryTipBtn({
  entry,
  setTipDialogMounted,
  handleClickAway,
  account,
  postTips,
  inlineTipButton,
  tipCount: tipCountProp,
  tippedByViewer
}: Props) {
  const { activeUser } = useActiveAccount();

  const [dialog, setDialog] = useState(false);
  const [showPopover, setShowPopover] = useState(false);

  const to = useMemo(() => entry.author, [entry]);
  const memo = useMemo(() => `Tip for @${entry.author}/${entry.permlink}`, [entry]);
  // Only the detail-page caller passes the full `postTips` breakdown; the feed
  // passes just a count. The popover (per-currency totals) is shown only when we
  // have that breakdown — otherwise the button opens the tip dialog directly.
  const hasBreakdown = !!postTips;
  const tipCount = postTips?.meta.count ?? tipCountProp ?? 0;
  // Show the count when positive, or whenever the caller passes an explicit (feed)
  // tipCount — including 0 — so the waves feed shows it like the adjacent
  // vote/comment counts and the mobile app. Non-feed usages (post list, comments)
  // pass no tipCount, so a 0 there stays hidden; detail pages pass postTips only.
  const showTipNumber = tipCount > 0 || tipCountProp != null;
  const tipTotals = Object.entries(postTips?.meta.totals ?? {});
  const tipCountLabel =
    tipCount === 1
      ? i18next.t("entry-tip.count", { count: tipCount })
      : i18next.t("entry-tip.count_plural", { count: tipCount });

  useMount(() => setTipDialogMounted?.(true));
  useUnmount(() => setTipDialogMounted?.(false));

  const openTransferDialog = () => {
    setShowPopover(false);
    setDialog(true);
  };

  const inlineTipBtn = (
    <button
      type="button"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-dark-sky text-white text-sm font-medium hover:opacity-80 transition-opacity cursor-pointer"
      onClick={openTransferDialog}
    >
      <span className="inline-flex shrink-0 size-3.5 [&>svg]:size-full">{giftOutlineSvg}</span>
      {i18next.t("entry-tip.tip")}
    </button>
  );

  const tipButton = (
    <div
      className="entry-tip-btn"
      role="button"
      tabIndex={0}
      aria-label={i18next.t("entry-tip.title")}
      onClick={() => {
        if (hasBreakdown && tipCount > 0) {
          setShowPopover((state) => !state);
        } else {
          openTransferDialog();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (hasBreakdown && tipCount > 0) {
            setShowPopover((state) => !state);
          } else {
            openTransferDialog();
          }
        }
      }}
    >
      <Tooltip
        content={tippedByViewer ? i18next.t("entry-tip.you-tipped") : i18next.t("entry-tip.title")}
      >
        <span className={`inner-btn [&>svg]:size-4${tippedByViewer ? " tipped" : ""}`}>
          {giftOutlineSvg}
          <span className="tip-count">{showTipNumber ? tipCount : ""}</span>
        </span>
      </Tooltip>
    </div>
  );

  return (
    <>
      <LoginRequired promptOnAnon>
        {inlineTipButton ? (
          inlineTipBtn
        ) : hasBreakdown && tipCount > 0 ? (
          <Popover
            directContent={tipButton}
            behavior="click"
            show={showPopover}
            setShow={setShowPopover}
          >
            <PopoverContent>
              <div className="tip-popover">
                <div className="tip-popover-title">
                  {i18next.t("entry-tip.title")}
                  <span className="tip-popover-count">{tipCountLabel}</span>
                </div>
                <div className="tip-popover-grid">
                  {tipTotals.map(([currency, amount]) => (
                    <div className="tip-row" key={currency}>
                      <span className="tip-currency">{currency}</span>
                      <span className="tip-amount">
                        {formattedNumber(amount, { fractionDigits: 3 })}
                      </span>
                    </div>
                  ))}
                </div>
                <button className="tip-action" type="button" onClick={openTransferDialog}>
                  {i18next.t("entry-tip.send-tip")}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          tipButton
        )}
      </LoginRequired>
      {dialog && activeUser && (
        <Modal
          show={true}
          centered={true}
          onHide={() => setDialog(false)}
          className="tipping-dialog"
          size="lg"
        >
          <ModalHeader thin={true} closeButton={true} />
          <ModalBody>
            <Transfer
              asset={EcencyConfigManager.CONFIG.visionFeatures.points.enabled ? "POINT" : "HIVE"}
              mode="transfer"
              amount={
                EcencyConfigManager.CONFIG.visionFeatures.points.enabled ? "100.000" : "1.000"
              }
              to={to}
              memo={memo}
              handleClickAway={handleClickAway}
              account={account}
              onHide={() => setDialog(false)}
            />
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
