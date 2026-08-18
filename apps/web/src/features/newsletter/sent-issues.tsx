"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { QueryIdentifiers } from "@/core/react-query";
import i18next from "i18next";
import Link from "next/link";
import { authorSendApi, type SentIssue } from "./author-send-api";
import { useNewsletterEnabled } from "./runtime";

/**
 * The sender's own history (vision-web#1532): the list's last issues, digest or
 * author-sent, with what became of them. Sender-only, like the standing notice:
 * asked for only when the viewer is the sender, and rendered from nothing else.
 */
export const sentIssuesKey = (type: "creator" | "community", target: string, viewer: string | null | undefined) =>
  [QueryIdentifiers.NEWSLETTER_SENT_ISSUES, type, target, viewer ?? "anon"] as const;

export function SentIssues({ type, target, isSender, limit = 5, className }: { type: "creator" | "community"; target: string; isSender: boolean; limit?: number; className?: string }) {
  const enabled = useNewsletterEnabled();
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const { data } = useQuery({
    queryKey: sentIssuesKey(type, target, username),
    enabled: enabled && isSender && !!username,
    staleTime: 60_000,
    queryFn: () => authorSendApi.issues(type, target, username!)
  });
  if (!isSender || !data || data.length === 0) return null;
  const items = data.slice(0, limit);
  return (
    <div className={`text-sm ${className ?? ""}`} data-testid="newsletter-sent-issues">
      <div className="font-semibold mb-1">{i18next.t("newsletter.sent-issues")}</div>
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {items.map((i: SentIssue) => (
          <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 opacity-90">
            <span className="text-xs opacity-70 tabular-nums">{i.period_start}</span>
            {i.post_author && i.post_permlink ? (
              <Link href={`/@${i.post_author}/${i.post_permlink}`} className="truncate max-w-[16rem]">
                {i.subject}
              </Link>
            ) : (
              <span className="truncate max-w-[16rem]">{i.subject}</span>
            )}
            <span className="text-xs opacity-70">
              {i18next.t("newsletter.sent-issue-stats", { delivered: i.delivered, bounced: i.bounced + i.rejected })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
