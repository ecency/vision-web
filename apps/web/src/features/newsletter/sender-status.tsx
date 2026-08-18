"use client";

import { useQuery } from "@tanstack/react-query";
import { QueryIdentifiers } from "@/core/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ensureValidToken } from "@/utils";
import i18next from "i18next";
import { useNewsletterEnabled } from "./runtime";
import type { DigestType } from "./types";

/**
 * The sender's own view of policing (vision-web#1513): a creator on their own
 * profile, a community's team on the community page. Renders NOTHING unless
 * the digest is suspended; the numbers stay in the API for the operator and
 * for a fuller surface later. Only the sender is ever asked for it (the route
 * refuses everyone else), and only when the feature is on.
 */
export interface SenderStanding {
  type: DigestType;
  target: string;
  status: "active" | "suspended";
  reason: string | null;
  since: string | null;
  stats: {
    delivered: number;
    bounced: number;
    rejected: number;
    complaints: number;
    unsubscribed: number;
    complaintRate: number;
    bounceRate: number;
  };
}

export const senderStandingKey = (type: DigestType, target: string) =>
  [QueryIdentifiers.NEWSLETTER_SENDER_STANDING, type, target] as const;

export function useSenderStanding(type: "creator" | "community", target: string, isSender: boolean) {
  const enabled = useNewsletterEnabled();
  const { activeUser } = useActiveAccount();
  return useQuery({
    queryKey: senderStandingKey(type, target),
    enabled: enabled && isSender && !!activeUser?.username && !!target,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SenderStanding> => {
      const token = activeUser?.username ? await ensureValidToken(activeUser.username) : null;
      const res = await fetch(`/api/newsletter/sender?type=${type}&target=${encodeURIComponent(target)}`, {
        headers: token ? { "X-HS-Token": token } : {}
      });
      if (!res.ok) throw new Error(`sender standing: ${res.status}`);
      return (await res.json()) as SenderStanding;
    }
  });
}

const REASONS: Record<string, string> = {
  complaint_rate: "newsletter.suspended-reason-complaints",
  bounce_rate: "newsletter.suspended-reason-bounces",
  manual: "newsletter.suspended-reason-manual"
};

export function SenderStatusNotice({
  type,
  target,
  isSender,
  className
}: {
  type: "creator" | "community";
  target: string;
  isSender: boolean;
  className?: string;
}) {
  const { data } = useSenderStanding(type, target, isSender);
  if (!data || data.status !== "suspended") return null;
  const since = data.since ? new Date(data.since).toLocaleDateString() : "";
  const reason = i18next.t(REASONS[data.reason ?? ""] ?? "newsletter.suspended-reason-manual");
  return (
    <div
      role="status"
      className={`rounded-xl border border-red bg-red/10 px-4 py-3 text-sm text-red ${className ?? ""}`}
      data-testid="newsletter-sender-suspended"
    >
      <div className="font-semibold">
        {i18next.t(type === "creator" ? "newsletter.suspended-title-creator" : "newsletter.suspended-title-community", { since })}
      </div>
      <div className="mt-1 opacity-90">{reason}</div>
      <div className="mt-1 opacity-75">{i18next.t("newsletter.suspended-help")}</div>
    </div>
  );
}
