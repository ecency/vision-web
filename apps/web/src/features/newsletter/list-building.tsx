"use client";

import { Button } from "@ui/button";
import { UilLink } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { type ReactElement, useState } from "react";
import { success } from "@/features/shared/feedback";
import { useSenderStanding } from "./sender-status";

/**
 * List building for senders (vision-web#1537): how many readers there are and
 * a link that opens the subscribe dialog on the list's own page, to share
 * anywhere. Sender-only, like everything on the sender's card.
 */
export const SUBSCRIBE_PARAM = "subscribe";
export const SUBSCRIBE_PARAM_VALUE = "digest";

/** The page that carries the list's subscribe button, with the parameter that opens the dialog. */
export function subscribeLinkFor(type: "creator" | "community", target: string, base = ""): string {
  const path = type === "creator" ? `/@${target}` : `/created/${target}`;
  return `${base}${path}?${SUBSCRIBE_PARAM}=${SUBSCRIBE_PARAM_VALUE}`;
}

export function SubscriberCount({
  type,
  target,
  isSender,
  className
}: {
  type: "creator" | "community";
  target: string;
  isSender: boolean;
  className?: string;
}): ReactElement | null {
  const { data } = useSenderStanding(type, target, isSender);
  const [copied, setCopied] = useState(false);
  if (!isSender || !data?.subscribers) return null;
  const { weekly, monthly } = data.subscribers;
  const total = weekly + monthly;
  const copy = async () => {
    const url = subscribeLinkFor(type, target, typeof window !== "undefined" ? window.location.origin : "");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      success(i18next.t("newsletter.subscribe-link-copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permissions, insecure context): the link is still shown as text below.
      setCopied(false);
    }
  };
  return (
    <div className={`text-sm ${className ?? ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">{i18next.t("newsletter.subscriber-count", { count: total })}</span>
        {total > 0 ? (
          <span className="text-xs opacity-70">{i18next.t("newsletter.subscriber-count-split", { weekly, monthly })}</span>
        ) : (
          <span className="text-xs opacity-70">{i18next.t("newsletter.subscriber-count-none")}</span>
        )}
      </div>
      <Button size="sm" appearance="gray-link" icon={<UilLink />} iconPlacement="left" onClick={copy} className="mt-1 -ml-2">
        {copied ? i18next.t("newsletter.subscribe-link-copied") : i18next.t("newsletter.copy-subscribe-link")}
      </Button>
    </div>
  );
}
