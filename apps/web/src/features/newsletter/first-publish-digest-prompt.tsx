"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { UilEnvelope } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import i18next from "i18next";
import { useEffect, useState } from "react";
import { DigestSubscribeDialog } from "./digest-subscribe-dialog";
import { useDigestSubscriptions, useNewsletterEnabled } from "./hooks";

/**
 * The opt-in surface for the own-notification digest, offered ONCE, right after
 * a person's first publish (vision-web#1511). Decided deliberately: after the
 * first publish rather than at signup, because that is when they have context
 * and intent, and because consent must be an explicit affirmative action; there
 * is no pre-selection anywhere in this flow.
 *
 * Shown only when all of these hold: the feature is on, the account has at most
 * one post (the one just published; the count is read from the account before
 * the query refreshes, so 0 or 1), the account holds no digest subscription
 * yet, and the person has not already answered on this device. Accepting or
 * dismissing records the answer, so it never re-prompts.
 */
const STORAGE_PREFIX = "ecency:digest-prompt:";

export function digestPromptAnswered(username: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_PREFIX + username) !== null;
  } catch {
    return true; // storage unavailable: better never to prompt than to prompt every time
  }
}

export function recordDigestPromptAnswer(username: string, answer: "accepted" | "dismissed"): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + username, `${answer}:${new Date().toISOString()}`);
  } catch {
    // nothing to do; the in-memory state still hides it for this session
  }
}

export function FirstPublishDigestPrompt() {
  const enabled = useNewsletterEnabled();
  const { activeUser, account } = useActiveAccount();
  const username = activeUser?.username;
  const { data: subscriptions, isLoading } = useDigestSubscriptions();
  const [answered, setAnswered] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (username) setAnswered(digestPromptAnswered(username));
  }, [username]);

  if (!enabled || !username || answered || isLoading) return null;
  const postCount = account?.post_count ?? Number.POSITIVE_INFINITY;
  if (postCount > 1) return null;
  if ((subscriptions ?? []).length > 0) return null;

  const dismiss = () => {
    recordDigestPromptAnswer(username, "dismissed");
    setAnswered(true);
  };

  return (
    <div className="mt-6 max-w-md mx-auto rounded-xl border border-[--border-color] bg-white dark:bg-dark-200 p-4 text-left">
      <div className="flex items-start gap-3">
        <UilEnvelope className="size-5 text-blue-dark-sky shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <div className="font-semibold">{i18next.t("newsletter.prompt-title")}</div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{i18next.t("newsletter.prompt-body")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              {i18next.t("newsletter.prompt-accept")}
            </Button>
            <Button size="sm" appearance="gray-link" onClick={dismiss}>
              {i18next.t("newsletter.prompt-dismiss")}
            </Button>
          </div>
        </div>
      </div>
      {open && (
        <DigestSubscribeDialog
          type="own"
          target={username}
          targetLabel={username}
          source="publish-prompt"
          show={open}
          onHide={() => {
            // Whatever they did in the dialog, they have been asked.
            recordDigestPromptAnswer(username, "accepted");
            setAnswered(true);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
