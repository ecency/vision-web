"use client";

import { useQuery } from "@tanstack/react-query";
import { getProMembersQueryOptions } from "@ecency/sdk";
import type { Entry } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { isProMember } from "@/features/pro/pro-config";
import { Button } from "@ui/button";
import { UilEnvelope } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { type ReactElement, useEffect, useState } from "react";
import { DigestSubscribeDialog } from "./digest-subscribe-dialog";
import { useDigestSubscription } from "./hooks";
import { useNewsletterEnabled } from "./runtime";
import type { DigestType } from "./types";

/**
 * At the end of a post (vision-web#1537): a reader who is signed in and not yet
 * subscribed is offered the author's digest (when the author is Pro), or the
 * community's digest when the post was made in one. Dismissible per list; the
 * dismissal is remembered on this device. Never shown to the author for their
 * own list, never twice for the same list, never while a subscription exists.
 */
const dismissKey = (viewer: string, type: DigestType, target: string) => `ecency:digest-post-prompt:${viewer}:${type}:${target}`;

export function PostSubscribePrompt({ entry, communityTitle, className }: { entry: Entry; communityTitle?: string | null; className?: string }): ReactElement | null {
  const enabled = useNewsletterEnabled();
  const { activeUser } = useActiveAccount();
  const me = activeUser?.username?.toLowerCase();
  const isTopLevel = !entry.parent_author && (entry.depth ?? 0) === 0;
  const inCommunity = /^hive-\d+$/.test(entry.category);
  const { data: pro } = useQuery({ ...getProMembersQueryOptions(), enabled: enabled && !!me && isTopLevel });

  // Which list to offer: the author's own when they are Pro, else the community's.
  const authorIsPro = isProMember(pro?.members, entry.author);
  const list: { type: "creator" | "community"; target: string; label: string } | null =
    !enabled || !me || !isTopLevel
      ? null
      : authorIsPro && me !== entry.author
        ? { type: "creator", target: entry.author, label: `@${entry.author}` }
        : inCommunity
          ? { type: "community", target: entry.category, label: communityTitle || entry.category }
          : null;

  const { subscription, isSuccess } = useDigestSubscription(list?.type ?? "creator", list?.target ?? "");
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!list || !me) return;
    try {
      setDismissed(window.localStorage.getItem(dismissKey(me, list.type, list.target)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [list?.type, list?.target, me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!list || !me || dismissed || !isSuccess || subscription) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(me, list.type, list.target), "1");
    } catch {
      /* private mode: dismissed for this page only */
    }
  };

  return (
    <div className={`rounded-xl border border-[--border-color] bg-light-200 dark:bg-dark-200 p-3 md:p-4 flex flex-wrap items-center gap-3 ${className ?? ""}`} role="region" aria-label={i18next.t("newsletter.post-prompt-title", { list: list.label })}>
      <UilEnvelope className="size-5 opacity-70" aria-hidden="true" />
      <div className="flex-1 min-w-[12rem]">
        <div className="font-semibold text-sm">{i18next.t("newsletter.post-prompt-title", { list: list.label })}</div>
        <div className="text-xs opacity-70">
          {i18next.t(list.type === "creator" ? "newsletter.post-prompt-body-creator" : "newsletter.post-prompt-body-community")}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" appearance="gray-link" onClick={dismiss}>
          {i18next.t("newsletter.post-prompt-dismiss")}
        </Button>
        <Button size="sm" onClick={() => setOpen(true)}>
          {i18next.t("newsletter.post-prompt-subscribe")}
        </Button>
      </div>
      {open && <DigestSubscribeDialog type={list.type} target={list.target} targetLabel={list.label} source="post-page" show={open} onHide={() => setOpen(false)} />}
    </div>
  );
}
