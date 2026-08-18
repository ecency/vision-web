"use client";

import { Button } from "@ui/button";
import { UilLink } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { type ReactElement, useEffect, useRef, useState } from "react";
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
export function subscribeLinkFor(type: "creator" | "community", target: string, base: string = ""): string {
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
  // When the clipboard is unavailable (denied, insecure context, no API), the
  // link is shown as selectable text instead, so the click never does nothing.
  const [shown, setShown] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (!isSender || !data?.subscribers) return null;
  const { weekly, monthly } = data.subscribers;
  const total = weekly + monthly;
  const copy = async () => {
    const url = subscribeLinkFor(type, target, typeof window !== "undefined" ? window.location.origin : "");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setShown(null);
      success(i18next.t("newsletter.subscribe-link-copied"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setShown(url);
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
      {shown ? (
        <input
          readOnly
          value={shown}
          aria-label={i18next.t("newsletter.subscribe-link")}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 w-full text-xs px-2 py-1 rounded border border-[--border-color] bg-transparent"
        />
      ) : null}
    </div>
  );
}
