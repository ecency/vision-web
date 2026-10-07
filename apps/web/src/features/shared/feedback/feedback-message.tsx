"use client";

import { ErrorTypes } from "@/enums";
import {
  clearErrorFeedbackContext,
  consumeErrorFeedbackContext,
  ErrorFeedbackObject,
  FeedbackObject
} from "./feedback-events";
import { FeedbackModal } from "./feedback-modal";
import { UilCheckCircle, UilExclamationCircle, UilMultiply } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import clsx from "clsx";
import i18next from "i18next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useMount, useUnmount } from "react-use";
import { sentry } from "@/core/sentry/lazy-sentry";
import { getConsoleHistory } from "@/utils/console-msg";
import { useGlobalStore } from "@/core/global-store";

interface Props {
  feedback: FeedbackObject;
  onClose: () => void;
}

export function FeedbackMessage({ feedback, onClose }: Props) {
  const timeoutRef = useRef<any>(null);
  // Use global store directly instead of useActiveAccount() to avoid QueryClient dependency
  // We only need the username for the purchase link, not the full account data
  const activeUser = useGlobalStore((s) => s.activeUser);
  const router = useRouter();

  const [showDialog, setShowDialog] = useState(false);
  const errorType = (feedback as ErrorFeedbackObject).errorType;
  const link = feedback.link;

  const action = feedback.action;
  // the toast's own outcome is settled once: either its action ran or it was dismissed
  const settledRef = useRef(false);

  const handleClose = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    clearErrorFeedbackContext(feedback.id);
    if (!settledRef.current) {
      settledRef.current = true;
      feedback.onDismiss?.();
    }
    onClose();
  }, [feedback, onClose]);

  const handleAction = useCallback(() => {
    if (!action || settledRef.current) {
      return;
    }
    settledRef.current = true;
    action.onClick();
    handleClose();
  }, [action, handleClose]);

  const initTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // a toast that offers an action waits for the user; errors get longer to read than notices
    if (action) {
      return;
    }
    timeoutRef.current = setTimeout(handleClose, feedback.type === "error" ? 10000 : 5000);
  }, [action, feedback.type, handleClose]);

  useMount(() => initTimeout());
  useUnmount(() => {
    clearErrorFeedbackContext(feedback.id);
    // closed from outside (dismissFeedback) never passes through handleClose
    if (!settledRef.current) {
      settledRef.current = true;
      feedback.onDismiss?.();
    }
  });

  return (
    <div
      className={clsx("bg-white border border-[--border-color] pt-2 pb-3 text-sm rounded-xl")}
      role="alert"
      onMouseEnter={() => clearTimeout(timeoutRef.current)}
      onMouseLeave={() => initTimeout()}
    >
      <div className="flex items-start gap-2 px-2">
        {feedback.type === "error" && <UilExclamationCircle className="size-6 text-red" />}
        {feedback.type === "success" && <UilCheckCircle className="size-6 text-green" />}
        <div className="w-full">
          <div className="flex justify-between items-center">
            <div
              className={clsx(
                "font-semibold",
                feedback.type === "success" && "text-green",
                feedback.type === "error" && "text-red",
                feedback.type === "info" && "text-blue-dark-sky"
              )}
            >
              {feedback.type === "success" && "Success"}
              {feedback.type === "error" &&
                (errorType === ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS
                  ? i18next.t("feedback-modal.insufficient-resource-title")
                  : "Error")}
              {feedback.type === "info" && "Information"}
            </div>
            <Button
              className="!size-6"
              icon={<UilMultiply className="!size-3" />}
              appearance="gray"
              onClick={handleClose}
              aria-label={i18next.t("g.close", { defaultValue: "Close" })}
            />
          </div>
          {link ? (
            <button
              type="button"
              className="block w-full text-left text-gray-600 dark:text-gray-400 hover:underline cursor-pointer"
              onFocus={() => clearTimeout(timeoutRef.current)}
              onBlur={() => initTimeout()}
              onClick={() => {
                handleClose();
                router.push(link);
              }}
            >
              {feedback.message}
            </button>
          ) : (
            <div className="text-gray-600 dark:text-gray-400">{feedback.message}</div>
          )}
          {errorType === ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS && (
            <div className="mt-2 flex flex-col gap-2">
              <Link
                href={`https://ecency.com/purchase?username=${activeUser?.username}&type=boost&product_id=999points`}
                target="_external"
              >
                <Button size="xs" appearance="gray">
                  {i18next.t("feedback-modal.insufficient-resource-buy")}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {action && !errorType && (
        <div className="flex justify-end px-3 border-t border-[--border-color] pt-2 items-center gap-2 mt-2">
          <Button size="xs" onClick={handleAction}>
            {action.label}
          </Button>
        </div>
      )}

      {errorType && (
        <div className="flex justify-end px-3 border-t border-[--border-color] pt-2 items-center gap-2 mt-2">
          {action && (
            <Button size="xs" onClick={handleAction}>
              {action.label}
            </Button>
          )}
          {errorType !== ErrorTypes.COMMON && errorType !== ErrorTypes.INFO && (
            <Button size="xs" appearance="gray-link" onClick={() => setShowDialog(true)}>
              {i18next.t("feedback-modal.question")}
            </Button>
          )}

          {errorType !== ErrorTypes.INFO &&
            errorType !== ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS && (
            <Button
              size="xs"
              appearance="gray"
              onClick={() => {
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                }

                const context = consumeErrorFeedbackContext(feedback.id);

                sentry.withScope((scope) => {
                  scope.setExtra("feedbackId", feedback.id);
                  scope.setExtra("feedbackMessage", feedback.message);

                  if (context?.consoleHistory?.length) {
                    scope.setExtra("consoleHistory", context.consoleHistory);
                  } else {
                    const history = getConsoleHistory();
                    if (history.length) {
                      scope.setExtra("consoleHistory", history);
                    }
                  }

                  if (context?.contextTag) {
                    scope.setTag("context", context.contextTag);
                  }

                  scope.setTag("reported_via", "feedback-toast-report");

                  const errorPayload = context?.error ?? new Error(feedback.message);
                  sentry.captureException(errorPayload);
                });

                handleClose();
              }}
            >
              {i18next.t("feedback-modal.report")}
            </Button>
          )}
        </div>
      )}

      <FeedbackModal
        instance={feedback as ErrorFeedbackObject}
        show={showDialog}
        setShow={(v) => setShowDialog(v)}
      />
    </div>
  );
}
