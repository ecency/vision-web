"use client";

import React, { useMemo, useRef, useState } from "react";
import { Entry } from "@/entities";
import { PopoverConfirm } from "@/features/ui";
import i18next from "i18next";
import { LoginRequired } from "@/features/shared";
import { Tooltip } from "@ui/tooltip";
import { repeatSvg } from "@ui/svg";
import { useEntryReblog } from "@/api/mutations";
import { getReblogsQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useActiveAccount } from "@/core/hooks/use-active-account";

interface Props {
  entry: Entry;
}

export function EntryReblogBtn({ entry }: Props) {
  const { data } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(entry));
  const { activeUser } = useActiveAccount();

    const { data: reblogs } = useQuery(getReblogsQueryOptions(activeUser?.username, activeUser?.username));
    const { mutateAsync: reblog, isPending } = useEntryReblog(entry);

    const reblogged = useMemo(
        () =>
            !!activeUser &&
            reblogs?.some((x) => x.author === data?.author && x.permlink === data.permlink),
        [activeUser, data, reblogs]
    );

    // Transient success cue: set only after a reblog broadcast succeeds and
    // cleared on animationend, so the spin never fires on initial render.
    const [reblogDone, setReblogDone] = useState(false);

    const reblogsCount = data?.reblogs && data.reblogs > 0 ? data.reblogs : 0;
    // Ref guard for the count tick: remember the first-seen count (per entry,
    // since a button instance can be reused for another post) and only animate
    // when the displayed number changes after mount — never on first paint.
    const entryKey = `${entry.author}/${entry.permlink}`;
    const firstSeenCount = useRef({ entryKey, count: reblogsCount });
    if (firstSeenCount.current.entryKey !== entryKey) {
        firstSeenCount.current = { entryKey, count: reblogsCount };
    }
    const countChanged = reblogsCount !== firstSeenCount.current.count;

    const reblogLabel = reblogged
        ? i18next.t("entry-reblog.delete-reblog")
        : i18next.t("entry-reblog.reblog");

    const content = (
        <div
            className={`entry-reblog-btn ${reblogged ? "reblogged" : ""} ${
                isPending ? "in-progress" : ""
            } ${reblogDone ? "reblog-done" : ""}`}
            onAnimationEnd={(e) => {
                // The count tick's animationend bubbles here too — clearing on it
                // would cut the icon spin short, so match the spin by name.
                if (e.animationName === "anim-rotate-once") setReblogDone(false);
            }}
            role="button"
            tabIndex={0}
            aria-label={reblogLabel}
            aria-pressed={reblogged}
            aria-disabled={isPending}
            onKeyDown={(e) => {
                // While a reblog is in flight the SCSS sets pointer-events:none to
                // block a double-submit via mouse; mirror that for the keyboard
                // path (which pointer-events can't reach) so Enter/Space can't
                // reopen the confirm popover and fire a second request.
                if (isPending) return;
                if (e.key === "Enter" || e.key === " ") {
                    // Activation lives on the click handler injected by the
                    // wrapping LoginRequired / PopoverConfirm, so bridge the
                    // keyboard event to it. Makes the control reachable and
                    // operable without a mouse (matches EntryVoteBtn/EntryTipBtn).
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).click();
                }
            }}
        >
            <Tooltip content={reblogLabel}>
                <a className="inner-btn [&>svg]:size-4" aria-hidden={true}>
                    {repeatSvg}
                    {/* key-remount so the tick replays on every count change */}
                    <span key={reblogsCount} className={countChanged ? "animate-tick" : undefined}>
                        {reblogsCount > 0 ? reblogsCount : ""}
                    </span>
                </a>
            </Tooltip>
        </div>
    );

    if (!activeUser) {
        return <LoginRequired promptOnAnon>{content}</LoginRequired>;
    }

    return (
    <PopoverConfirm
        onConfirm={() => {
            const isDelete = !!reblogged;
            return reblog({ isDelete }).then(() => {
                // Celebratory spin only for a fresh reblog, not for removing one.
                if (!isDelete) setReblogDone(true);
            });
        }}
        okVariant={reblogged ? "danger" : "primary"}
        titleText={
            reblogged
                ? i18next.t("entry-reblog.delete-confirm-title")
                : i18next.t("entry-reblog.confirm-title", { n: activeUser.username })
        }
        okText={
            reblogged
                ? i18next.t("entry-reblog.delete-confirm-ok")
                : i18next.t("entry-reblog.confirm-ok")
        }
    >
      {content}
    </PopoverConfirm>
    );
}
