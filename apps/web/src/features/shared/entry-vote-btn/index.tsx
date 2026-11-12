"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ss from "@/utils/session-storage";
import { LoginRequired } from "@/features/shared";
import useClickAway from "react-use/lib/useClickAway";

import dynamic from "next/dynamic";
import { useEntryVote } from "@/api/mutations";
import { Account, Entry } from "@/entities";
import { getEntryVoteQueryOptions } from "@ecency/sdk";
import { useViewerVote } from "@/core/hooks/use-viewer-vote";
import { voteValueKey } from "@/features/shared/entry-vote-btn/utils";
import { classNameObject } from "@ui/util";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { error } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import i18next from "i18next";

import { VoteChevron } from "@/features/shared/vote-chevron";
// The vote slider dialog only mounts on interaction (dialog && entry &&
// activeUser, below) — never SSR-meaningful. Lazy-load it so it doesn't ship
// in the post page's first client chunk. Mirrors entry-votes/index.tsx.
const EntryVoteDialog = dynamic(
  () =>
    import("@/features/shared/entry-vote-btn/entry-vote-dialog").then((m) => ({
      default: m.EntryVoteDialog
    })),
  { ssr: false }
);

interface Props {
  entry: Entry;
  account?: Account;
  isPostSlider: boolean;
}

export function EntryVoteBtn({ entry: originalEntry, isPostSlider, account }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();

  const { data: entry, dataUpdatedAt: entryUpdatedAt } =
    useQuery(EcencyEntriesCacheManagement.getEntryQuery(originalEntry));

  const [dialog, setDialog] = useState(false);
  const [tipDialog, setTipDialog] = useState(false);
  const [previousVotedValue, setPreviousVotedValue] = useState<number>();
  // Transient success cue: set only after a vote broadcast succeeds and cleared
  // on animationend, so the pulse never fires for already-voted posts on load.
  const [voteDone, setVoteDone] = useState(false);

  const { mutateAsync: voteInAPI, isPending: isVotingLoading } = useEntryVote(entry);

  // The user's OWN vote: from the entry only when it was read for this user,
  // otherwise looked up (see useViewerVote). Never the SSR observer's vote.
  const viewerVote = useViewerVote(entry, entryUpdatedAt);
  // Logged in and the user's own vote is still being looked up.
  const votePending = !!activeUser && !viewerVote.known;
  const isVoted = useMemo(
    () => ({ upVoted: viewerVote.upVoted, downVoted: viewerVote.downVoted }),
    [viewerVote.upVoted, viewerVote.downVoted]
  );

  useClickAway(rootRef, (e) => {
    if (!dialog) {
      return;
    }
    // Element, not HTMLElement: an icon glyph target is an SVGElement, which
    // extends Element but NOT HTMLElement, so an HTMLElement check swallowed
    // every mousedown that landed on an <svg> — on every surface, not just
    // the ones below.
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }

    // Which portal subtree a node sits in. Every dialog in the app portals
    // into the ONE #modal-dialog-container, so "is this click inside that
    // container" cannot tell a tipping modal that opened ON TOP of the slider
    // apart from an ordinary click in a drawer that HOSTS the slider. The
    // curation desk hosts this button inside a ModalSidebar, where the old
    // test matched every click in the drawer and the slider could not be
    // dismissed at all: not by clicking away, and not by the trigger either,
    // since the panel paints over it.
    const container = document.getElementById("modal-dialog-container");
    const subtreeOf = (node: Element | null) => {
      let cursor = node;
      while (cursor && cursor.parentElement !== container) {
        cursor = cursor.parentElement;
      }
      return cursor;
    };
    // A DIFFERENT subtree is a dialog above us — the transfer dialog this
    // slider itself opens on a paid-out post, which unmounts together with
    // the slider and so must survive its own clicks. Outside any portal both
    // sides are null and every outside click closes, as on the post page.
    const theirs = subtreeOf(target);
    if (theirs && theirs !== subtreeOf(rootRef.current)) {
      return;
    }

    setDialog(false);
  });

  const vote = useCallback(
    async (percent: number, estimated: number) => {
      const weight = Math.ceil(percent * 100);

      try {
        await voteInAPI({ weight, estimated });
        // Close only on success — on failure keep the slider open so the user
        // can adjust and retry in place (matches the pre-existing behavior).
        setDialog(false);
        setVoteDone(true);
      } catch (e) {
        // The broadcast was rejected (commonly the account is out of Resource
        // Credits, or an identical/duplicate vote). Surface the friendly,
        // classified toast via the standard error()/formatError path instead of
        // letting the rejection escape as an unhandled promise — which Sentry's
        // global handler would otherwise capture as a fresh client crash.
        error(...formatError(e));
      }
    },
    [voteInAPI]
  );
  const getPreviousVote = useCallback(async () => {
    const { upVoted, downVoted } = isVoted;
    let previousVote;
    if (!activeUser || !entry) {
      return null;
    }

    if (upVoted || downVoted) {
      let username = voteValueKey(activeUser.username, entry);
      let type = upVoted ? "up" : "down";
      let sessValue = ss.get(`vote-value-${type}-${username}`, null);

      if (sessValue !== null) {
        return sessValue;
      }

      // A v2 entry read for this user already says the weight.
      if (viewerVote.vote?.percent != null) {
        return viewerVote.vote.percent / 100;
      }

      try {
        // One vote lookup, not the whole voter list.
        previousVote = await queryClient.fetchQuery(
          getEntryVoteQueryOptions(entry.author, entry.permlink, activeUser.username)
        );
        return previousVote?.percent == null ? null : previousVote.percent / 100;
      } catch (e) {
        console.error("entry-vote-btn failed to load previous vote", e);
        return null;
      }
    } else {
      return null;
    }
  }, [activeUser, entry, isVoted, queryClient, viewerVote.vote]);
  // The panel can open inside a scroller that does not show it: the curation
  // drawer's post column is its own scroll box and the action row is its last
  // element, so a panel below that row starts off screen. "nearest" is a no-op
  // wherever the panel is already fully visible, which is every other surface.
  useEffect(() => {
    // Optional call: jsdom does not implement scrollIntoView.
    if (dialog) panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [dialog]);

  // A click while the vote is unknown waits for it: the slider must open
  // knowing whether the user voted (it seeds and labels from that).
  const [openWhenKnown, setOpenWhenKnown] = useState(false);
  const toggleDialog = useCallback(() => {
    if (votePending) {
      setOpenWhenKnown(true);
      return;
    }
    setDialog((d) => !d);
  }, [votePending]);
  useEffect(() => {
    if (openWhenKnown && !votePending) {
      setOpenWhenKnown(false);
      setDialog(true);
    }
  }, [openWhenKnown, votePending]);

  // Resolve the user's previous vote WHILE the slider is open rather than before
  // opening it, so the open paints immediately instead of blocking on
  // getPreviousVote()'s network fetch (the prior-vote lookup on an already-voted
  // post with a cold session cache). That await used to gate the open and inflate
  // INP on this interaction. The cleanup drops a stale resolution if the slider
  // closes, or the entry/account changes (getPreviousVote identity changes),
  // before the fetch returns — so a late result can never prefill another post's
  // (or user's) vote weight.
  useEffect(() => {
    if (!dialog) {
      return;
    }
    let active = true;
    getPreviousVote()
      .then((preVote) => {
        if (active) {
          setPreviousVotedValue(preVote ?? undefined);
        }
      })
      .catch((e) => {
        console.error("entry-vote-btn failed to load previous vote", e);
        if (active) {
          setPreviousVotedValue(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [dialog, getPreviousVote]);

  // Reset the cached previous vote when this button is reused for a different
  // post or the active user changes. previousVotedValue is component state that
  // persists across prop changes, and the dialog captures it at mount, so
  // without this a reopened slider could seed from a prior entry's (or user's)
  // vote weight before the new lookup resolves.
  useEffect(() => {
    setPreviousVotedValue(undefined);
  }, [originalEntry.author, originalEntry.permlink, activeUser?.username]);

  return (
    <LoginRequired promptOnAnon>
      <div ref={rootRef}>
        <div
          className={`entry-vote-btn${votePending ? " vote-pending" : ""}`}
          role="button"
          tabIndex={0}
          aria-label={
            isVoted.upVoted
              ? i18next.t("entry-vote-btn.upvoted", { defaultValue: "Upvoted, edit vote" })
              : isVoted.downVoted
                ? i18next.t("entry-vote-btn.downvoted", { defaultValue: "Downvoted, edit vote" })
                : i18next.t("entry-vote-btn.vote", { defaultValue: "Vote" })
          }
          // Unknown (the user's vote is still being looked up): neither
          // pressed nor not-pressed, and announced as busy.
          aria-pressed={votePending ? undefined : isVoted.upVoted || isVoted.downVoted}
          aria-busy={votePending ? true : undefined}
          aria-expanded={dialog}
          aria-haspopup="dialog"
          onClick={toggleDialog}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleDialog();
            }
          }}
        >
          <div
            className={classNameObject({
              "btn-vote btn-up-vote": true,
              "btn-vote voted": isVoted.downVoted || isVoted.upVoted,
              "btn-up-vote primary-btn-done": isVoted.upVoted,
              "btn-down-vote secondary-btn-done": isVoted.downVoted,
              "primary-btn secondary-btn": !isVoted.upVoted || !isVoted.downVoted
            })}
          >
            <div className="tooltip-vote">
              <span
                className={`btn-inner ${
                  dialog
                    ? isVoted.upVoted
                      ? "primary-btn-done"
                      : isVoted.downVoted
                        ? "secondary-btn-done"
                        : "primary-btn"
                    : ""
                } ${voteDone ? "animate-success-pulse" : ""}`}
                onAnimationEnd={() => setVoteDone(false)}
              >
                <VoteChevron />
              </span>
              {dialog && entry && activeUser && (
                <div
                  ref={panelRef}
                  className="tooltiptext animate-scale-in origin-top-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  <EntryVoteDialog
                    account={account}
                    isPostSlider={isPostSlider}
                    upVoted={isVoted.upVoted}
                    downVoted={isVoted.downVoted}
                    previousVotedValue={previousVotedValue}
                    entry={entry}
                    setTipDialogMounted={(d) => setTipDialog(d)}
                    onClick={vote}
                    handleClickAway={() => setDialog(false)}
                    isVoted={isVoted}
                    isVotingLoading={isVotingLoading}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </LoginRequired>
  );
}
