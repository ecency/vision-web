"use client";

import { useQuery } from "@tanstack/react-query";
import { getCommunityQueryOptions } from "@ecency/sdk";
import type { Entry } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import * as ls from "@/utils/local-storage";
import { Button } from "@ui/button";
import { UilEnvelope } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { type ReactElement, useEffect, useState } from "react";
import { DigestSubscribeDialog } from "./digest-subscribe-dialog";
import { useDigestSubscription } from "./hooks";
import { useNewsletterEnabled } from "./runtime";
import type { DigestType } from "./types";

/**
 * At the end of a post (vision-web#1537): a reader not yet subscribed is offered the
 * author's digest (every creator has one since 2026-08-19), or the community's digest
 * when the post was made in one. Dismissible per list; the dismissal is remembered on
 * this device. Never shown to the author for their own list, never twice for the same
 * list, never while a subscription exists.
 *
 * Anonymous readers see it too (vision-web#1568). They are the larger half of a post's
 * audience and the one with no other way to hear about the next post, and the subscribe
 * path already serves them: double opt-in, plus a Turnstile check on the relay. What
 * changes for them is only what we can KNOW -- there is no subscription list to consult,
 * so the card is offered on the assumption they are not subscribed, and a dismissal is
 * the only memory we have.
 */
const dismissKey = (viewer: string, type: DigestType, target: string) => `ecency:digest-post-prompt:${viewer}:${type}:${target}`;

/**
 * The dismissal namespace for a signed-out reader. Deliberately its own segment rather
 * than an empty one, which would produce `...prompt::creator:bob` and collide with a
 * malformed signed-in key.
 */
const ANON_VIEWER = "anon";

export function PostSubscribePrompt({ entry, communityTitle, className }: { entry: Entry; communityTitle?: string | null; className?: string }): ReactElement | null {
  const enabled = useNewsletterEnabled();
  const { activeUser } = useActiveAccount();
  const me = activeUser?.username?.toLowerCase();
  const isTopLevel = !entry.parent_author && (entry.depth ?? 0) === 0;
  const inCommunity = /^hive-\d+$/.test(entry.category);
  // Which list to offer: the author's digest is open to every creator
  // (2026-08-19), so it is offered first; the community's digest when the
  // reader IS the author (their own list is not offered to them) and the post
  // was made in a community.
  // An anonymous reader is never the author, so they always land on the creator branch;
  // the community branch stays reachable only for a signed-in author reading their own
  // post, which is what it was for.
  const list: { type: "creator" | "community"; target: string } | null =
    !enabled || !isTopLevel
      ? null
      : !me || me !== entry.author
        ? { type: "creator", target: entry.author }
        : inCommunity
          ? { type: "community", target: entry.category }
          : null;
  // The community's title, unless the page passed it; same cache entry the community pages use.
  const { data: community } = useQuery({
    ...getCommunityQueryOptions(entry.category),
    enabled: !!list && list.type === "community" && !communityTitle
  });
  const label = !list ? "" : list.type === "creator" ? `@${list.target}` : communityTitle || community?.title || list.target;

  // Stays disabled for anonymous readers, on purpose: newsletterApi.list needs a
  // username and requireUsername throws, the endpoint needs the account's token, and one
  // shared cache key would collapse every anonymous visitor onto one entry. The anon path
  // SKIPS the query rather than enabling it, and `known` below is what stands in for it.
  const { subscription, isSuccess } = useDigestSubscription(list?.type ?? "creator", list?.target ?? "");
  const [dismissed, setDismissed] = useState(true);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!list) return;
    // activeUser is null during SSR AND on the first client render for a signed-in
    // reader, because the store is populated in a post-mount effect. Rendering the
    // anonymous card on that first paint would flash it at subscribers and, worse, write
    // an "anon" dismissal for someone who is actually signed in. Reading the same
    // localStorage key the store reads tells the two apart: a stored user with no `me`
    // yet means "not hydrated", not "anonymous".
    let stored: string | null = null;
    try {
      stored = ls.get("active_user") ?? null;
    } catch {
      stored = null;
    }
    if (stored && !me) return;

    const viewer = me ?? ANON_VIEWER;
    try {
      setDismissed(window.localStorage.getItem(dismissKey(viewer, list.type, list.target)) === "1");
    } catch {
      setDismissed(false);
    }
    setReady(true);
  }, [list?.type, list?.target, me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!list || !ready) return null;
  // For a signed-in reader we can prove they hold no subscription, so we wait for the
  // query. For an anonymous one there is nothing to consult and nothing to wait for.
  const known = me ? isSuccess && !subscription : true;
  // The card goes once dismissed or once a subscription exists; the dialog,
  // if open, stays: a pending-confirmation outcome ("check your inbox") is
  // shown by the dialog after the refetch, and unmounting it would lose it.
  const showCard = !dismissed && known;
  if (!showCard && !open) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(me ?? ANON_VIEWER, list.type, list.target), "1");
    } catch {
      /* private mode: dismissed for this page only */
    }
  };

  return (
    <>
      {showCard && (
        <div className={`rounded-xl border border-[--border-color] bg-light-200 dark:bg-dark-200 p-3 md:p-4 flex flex-wrap items-center gap-3 ${className ?? ""}`} role="region" aria-label={i18next.t("newsletter.post-prompt-title", { list: label })}>
          <UilEnvelope className="size-5 opacity-70" aria-hidden="true" />
          <div className="flex-1 min-w-[12rem]">
            <div className="font-semibold text-sm">{i18next.t("newsletter.post-prompt-title", { list: label })}</div>
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
        </div>
      )}
      {open && <DigestSubscribeDialog type={list.type} target={list.target} targetLabel={label} source="post-page" show={open} onHide={() => setOpen(false)} />}
    </>
  );
}
