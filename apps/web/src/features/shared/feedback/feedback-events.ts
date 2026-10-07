import { ErrorTypes } from "@/enums";
import { random } from "@/utils";
import i18next from "i18next";
import { sentry } from "@/core/sentry/lazy-sentry";
import { formatError } from "@/api/format-error";
import { ConsoleHistoryEntry, getConsoleHistory } from "@/utils/console-msg";

interface ErrorFeedbackExtras {
  error?: unknown;
  contextTag?: string;
  consoleHistory?: ConsoleHistoryEntry[];
  /** A button on the toast (e.g. Retry). A toast with an action stays until it is used or closed. */
  action?: FeedbackAction;
  /** Called when the toast goes away without its action being used. */
  onDismiss?: () => void;
}

const errorContextMap = new Map<string, ErrorFeedbackExtras>();

export const error = (
  message: string,
  errorType = ErrorTypes.COMMON,
  extras?: ErrorFeedbackExtras
) => {
  const id = random();
  const detail: ErrorFeedbackObject = {
    id,
    type: "error",
    message,
    errorType,
    contextTag: extras?.contextTag,
    action: extras?.action,
    onDismiss: extras?.onDismiss
  };

  const consoleHistory = extras?.consoleHistory ?? getConsoleHistory();
  if (extras || consoleHistory.length) {
    errorContextMap.set(id, {
      ...extras,
      consoleHistory
    });
  }

  if (message.includes("Please wait to transact")) {
    detail.errorType = ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS;
    detail.message = i18next.t("feedback-modal.insufficient-resource-message");
  }

  const ev = new CustomEvent("ecency-feedback", { detail });
  window.dispatchEvent(ev);
  return id;
};

/** Closes a toast from code, e.g. when the operation it offers to retry was cancelled. */
export const dismissFeedback = (id: string) => {
  window.dispatchEvent(new CustomEvent("ecency-feedback-dismiss", { detail: id }));
};

export const success = (message: string) => {
  const detail: FeedbackObject = {
    id: random(),
    type: "success",
    message
  };
  const ev = new CustomEvent("ecency-feedback", { detail });
  window.dispatchEvent(ev);
};

export const info = (message: string, link?: string) => {
  const detail: FeedbackObject = {
    id: random(),
    type: "info",
    message,
    link
  };
  const ev = new CustomEvent("ecency-feedback", { detail });
  window.dispatchEvent(ev);
};

type FeedbackType = "error" | "success" | "info";

export interface FeedbackAction {
  label: string;
  onClick: () => void;
}

export interface FeedbackObject {
  id: string;
  type: FeedbackType;
  message: string;
  /** Optional in-app destination; when set, the toast message is clickable. */
  link?: string;
  /** Optional button; the toast does not auto-close while it is offered. */
  action?: FeedbackAction;
  /** Called when the toast closes without its action being used. */
  onDismiss?: () => void;
}

export interface ErrorFeedbackObject extends FeedbackObject {
  errorType: ErrorTypes;
  contextTag?: string;
}

export const getErrorFeedbackContext = (id: string): ErrorFeedbackExtras | undefined => {
  return errorContextMap.get(id);
};

export const clearErrorFeedbackContext = (id: string) => {
  errorContextMap.delete(id);
};

export const consumeErrorFeedbackContext = (id: string): ErrorFeedbackExtras | undefined => {
  const context = errorContextMap.get(id);
  errorContextMap.delete(id);
  return context;
};

/**
 * Handles known app errors and conditionally reports to sentry.
 * @returns true if error was handled and should NOT be rethrown.
 */
export function handleAndReportError(err: any, contextTag?: string): boolean {
  const [message, type] = formatError(err);

  // Suppress known handled cases
  const suppressedTypes = [
    ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS,
    ErrorTypes.COMMON,
    ErrorTypes.INFO
  ];

  if (suppressedTypes.includes(type)) {
    return true; // ✅ already handled
  }

  // Show modal
  error(message, type, {
    error: err,
    contextTag,
    consoleHistory: getConsoleHistory()
  });

  if (contextTag) {
    sentry.setTag("context", contextTag);
  }

  sentry.withScope((scope) => {
    scope.setExtra("feedbackMessage", message);
    if (contextTag) {
      scope.setExtra("feedbackId", `${contextTag}-${Date.now()}`);
    }
    const history = getConsoleHistory();
    if (history.length) {
      scope.setExtra("consoleHistory", history);
    }
    if (contextTag) {
      scope.setTag("context", contextTag);
    }
    scope.setTag("reported_via", "handleAndReportError");
    sentry.captureException(err);
  });
  return false; // ❌ unexpected, should throw
}

