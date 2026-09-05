"use client";

import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { UilAward, UilSpinner } from "@tooni/iconscout-unicons-react";
import { CURATION_REASONS, type CurationReason } from "@ecency/sdk";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle } from "@ui/modal";
import { LoginRequired } from "@/features/shared/login-required";
import { error as errorToast, success } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { useRecommendFlow } from "./curation-recommend-flow";
import type { RecommendState } from "./types";

interface ReasonPickerProps {
  show: boolean;
  onHide: () => void;
  onPick: (reason: CurationReason) => void | Promise<void>;
  busy?: boolean;
}

/** Reason picker: quality, underrated, newcomer, other. Defaults to quality. */
export function CurationReasonPicker({ show, onHide, onPick, busy }: ReasonPickerProps) {
  const [reason, setReason] = useState<CurationReason>("quality");
  return (
    <Modal show={show} onHide={onHide} centered size="sm">
      <ModalHeader closeButton>
        <ModalTitle>{i18next.t("curation-desk.recommend.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{i18next.t("curation-desk.recommend.intro")}</p>
        <div role="radiogroup" aria-label={i18next.t("curation-desk.recommend.reason-label")} className="flex flex-col gap-2">
          {CURATION_REASONS.map((value) => (
            <label
              key={value}
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer",
                reason === value
                  ? "border-blue-dark-sky bg-blue-duck-egg/40 dark:bg-blue-dark-grey"
                  : "border-[--border-color]"
              )}
            >
              <input
                type="radio"
                name="curation-recommend-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
              />
              <span className="text-sm">{i18next.t(`curation-desk.reasons.${value}`)}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">{i18next.t("curation-desk.recommend.cost")}</p>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button appearance="gray-link" onClick={onHide} aria-label={i18next.t("g.cancel")}>
          {i18next.t("g.cancel")}
        </Button>
        <Button
          onClick={() => void onPick(reason)}
          disabled={busy}
          isLoading={busy}
          aria-label={i18next.t("curation-desk.recommend.confirm")}
        >
          {i18next.t("curation-desk.recommend.confirm")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function recommendLabel(state: RecommendState, isSelf: boolean): string {
  if (state.phase === "pending") {
    return i18next.t(state.withdraw ? "curation-desk.recommend.withdrawing" : "curation-desk.recommend.sending");
  }
  if (state.phase === "recommended") return i18next.t("curation-desk.recommend.recommended");
  if (state.phase === "confirming") return i18next.t("curation-desk.recommend.confirming");
  if (isSelf) return i18next.t("curation-desk.recommend.recommended");
  return i18next.t("curation-desk.recommend.action");
}

interface Props {
  author: string;
  permlink: string;
  /** Route 5 already told us the viewer recommended this post (or the is_self row). */
  alreadyRecommended?: boolean;
  /** Hidden on the viewer's own posts unless an is_self row exists. */
  hidden?: boolean;
  compact?: boolean;
  className?: string;
}

export interface CurationRecommendHandle {
  /** The keyboard `x` binding: recommend (reason picker) or withdraw when already recommended. */
  trigger: () => void;
}

/**
 * Recommend to curators / Withdraw. On-chain custom_json with posting
 * authority; optimistic state, poll and meta ping in curation-recommend-flow.
 */
export const CurationRecommendBtn = forwardRef<CurationRecommendHandle, Props>(function CurationRecommendBtn(
  { author, permlink, alreadyRecommended, hidden, compact, className },
  ref
) {
  const { state, recommend, withdraw, isPending } = useRecommendFlow(author, permlink);
  const [picker, setPicker] = useState(false);

  const showsWithdraw =
    state.phase === "recommended" ||
    state.phase === "confirming" ||
    (state.phase === "idle" && !!alreadyRecommended);

  const onWithdraw = useCallback(async () => {
    try {
      await withdraw();
      success(i18next.t("curation-desk.recommend.withdrawn-toast"));
    } catch (e) {
      errorToast(...formatError(e));
    }
  }, [withdraw]);

  const onPick = useCallback(
    async (reason: CurationReason) => {
      setPicker(false);
      try {
        await recommend(reason);
        success(i18next.t("curation-desk.recommend.sent-toast"));
      } catch (e) {
        const message = String((e as Error)?.message ?? "");
        if (/RC|resource credit|mana/i.test(message)) {
          errorToast(i18next.t("curation-desk.recommend.rc-error"));
        } else {
          errorToast(...formatError(e));
        }
      }
    },
    [recommend]
  );

  useImperativeHandle(
    ref,
    () => ({
      trigger: () => {
        if (hidden) return;
        if (showsWithdraw) void onWithdraw();
        else setPicker(true);
      },
    }),
    [hidden, showsWithdraw, onWithdraw]
  );

  if (hidden) return null;

  const busy = isPending || state.phase === "pending";
  const label = recommendLabel(state, !!alreadyRecommended);

  return (
    <>
      <LoginRequired promptOnAnon>
        <Button
          size={compact ? "xs" : "sm"}
          appearance={showsWithdraw ? "pressed" : "gray-link"}
          className={clsx("!rounded-lg", className)}
          disabled={busy}
          aria-label={showsWithdraw ? i18next.t("curation-desk.recommend.withdraw-aria") : i18next.t("curation-desk.recommend.aria")}
          title={showsWithdraw ? i18next.t("curation-desk.recommend.withdraw") : i18next.t("curation-desk.recommend.action")}
          onClick={() => (showsWithdraw ? void onWithdraw() : setPicker(true))}
          icon={busy ? <UilSpinner className="animate-spin" /> : <UilAward />}
        >
          <span className={compact ? "sr-only md:not-sr-only" : undefined}>
            {label}
            {showsWithdraw ? ` · ${i18next.t("curation-desk.recommend.withdraw")}` : ""}
          </span>
        </Button>
      </LoginRequired>
      {picker && <CurationReasonPicker show={picker} onHide={() => setPicker(false)} onPick={onPick} busy={busy} />}
    </>
  );
});

interface DialogProps {
  author: string;
  permlink: string;
  onHide: () => void;
}

/** Entry menu entry point: the same reason picker over the same flow. */
export function CurationRecommendDialog({ author, permlink, onHide }: DialogProps) {
  const { recommend, isPending } = useRecommendFlow(author, permlink);
  const onPick = useCallback(
    async (reason: CurationReason) => {
      try {
        await recommend(reason);
        success(i18next.t("curation-desk.recommend.sent-toast"));
      } catch (e) {
        errorToast(...formatError(e));
      } finally {
        onHide();
      }
    },
    [recommend, onHide]
  );
  return <CurationReasonPicker show onHide={onHide} onPick={onPick} busy={isPending} />;
}
