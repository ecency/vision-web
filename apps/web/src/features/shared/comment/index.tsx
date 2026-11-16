"use client";

import defaults from "@/defaults";
import { Entry } from "@/entities";
import { AvailableCredits, handleAndReportError, LoginRequired } from "@/features/shared";
import { CommentPreview } from "@/features/shared/comment/comment-preview";
import { EditorToolbar, toolbarEventListener } from "@/features/shared/editor-toolbar";
import { handleEditorShortcut } from "@/features/shared/editor-toolbar/shortcuts";
import { TextareaAutocomplete } from "@/features/shared/textarea-autocomplete";
import * as ls from "@/utils/local-storage";
import { PREFIX } from "@/utils/local-storage";
import { failedDeclineKey, failedTextKey } from "./failed-decline";
import { createReplyPermlink, isBlankBody, makeJsonMetaDataReply } from "@/utils";
import appPackage from "../../../../package.json";
import { setProxyBase } from "@ecency/render-helper";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input/form-controls";
import i18next from "i18next";
import React, {
  Ref,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useDebounce, useMount } from "react-use";
import useLocalStorage from "react-use/lib/useLocalStorage";
import useUnmount from "react-use/lib/useUnmount";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useIsMobile } from "@/features/ui/util/use-is-mobile";
import { useQuery } from "@tanstack/react-query";
import {
  getCommunityContextQueryOptions,
  getCommunityPermissions,
  getCommunityType,
  QUEST_MIN_CONTENT_LENGTH
} from "@ecency/sdk";
import { isCommunity } from "@/utils";
import { shouldShowShortContentHint } from "@/utils/short-content-hint";
import { EntryPageContext } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/context";
import type { RcPrecheckPayload } from "@ecency/sdk";
import { RcPrecheckBanner } from "@/features/shared/rc-precheck";

setProxyBase(defaults.imageServer);

export interface CommentSubmitOptions {
  declinePayout: boolean;
}

/**
 * A reply whose broadcast failed, handed back to the form: its text and the payout
 * choice it was sent with. A new object per failure, so the same reply failing
 * twice is restored twice.
 */
export interface FailedReply extends CommentSubmitOptions {
  text: string;
  /** The account that sent it: only that account's form takes it back. */
  username: string;
}

interface Props {
  submitText: string;
  entry: Entry;
  inProgress?: boolean;
  isCommented?: boolean;
  cancellable?: boolean;
  autoFocus?: boolean;
  /** `declinePayout` is always false for an edit: comment_options is create-only. */
  onSubmit: (text: string, options: CommentSubmitOptions) => Promise<any>;
  onCancel?: () => void;
  inputRef?: Ref<HTMLTextAreaElement>;
  clearOnSubmit?: boolean;
  isEdit?: boolean;
  failedReply?: FailedReply | null;
}

// One composer per post: its draft, stored decline and restore bookkeeping all
// belong to the post it replies to, so a form reused for another post starts over
// instead of judging that post's stored decline against the previous post's text.
export function Comment(props: Props) {
  return <CommentForm key={`${props.entry.author}/${props.entry.permlink}`} {...props} />;
}

function CommentForm({
  entry,
  onSubmit,
  onCancel,
  cancellable,
  submitText,
  inputRef,
  inProgress,
  autoFocus,
  isEdit,
  clearOnSubmit = true,
  failedReply = null
}: Props) {
  const commentBodyRef = useRef<HTMLDivElement>(null);
  const { activeUser } = useActiveAccount();
  const { selection, setSelection } = useContext(EntryPageContext);

  const [text, setText] = useLocalStorage(
    // The edit form keeps its own text: on mount it loads the post body, which
    // used to land on the reply key and wipe an unsent reply to that post.
    PREFIX + `_${isEdit ? "edit" : "reply"}_text_${entry.author}_${entry.permlink}`,
    // A held failure seeds the form only for the account that sent it.
    (failedReply && failedReply.username === activeUser?.username ? failedReply.text : undefined) ?? ""
  );
  // Not stored while composing: it belongs to this form and this account. A reply
  // whose broadcast fails comes back through `failedReply` with the choice it was
  // sent with. A failed DECLINED reply is the one thing stored, until it is posted:
  // its exact text, under this account and parent, so closing the form or reloading
  // brings the draft back declined. It applies only while the draft is that text,
  // and follows the writer's own edits of it (below). The edit form has no
  // decline (comment_options cannot be set again), so it never touches one.
  const [declinePayout, setDeclinePayout] = useState(false);
  const pendingDeclineKey = !isEdit && activeUser?.username
    ? failedDeclineKey(activeUser.username, entry.author, entry.permlink)
    : null;
  const forgetPendingDecline = useCallback(() => {
    if (pendingDeclineKey) ls.remove(pendingDeclineKey);
  }, [pendingDeclineKey]);
  // The stored decline, or null. A blank one is dropped, never applied: every new
  // reply form starts blank, so it would pre-check an unrelated reply.
  const readPendingDecline = (key: string): string | null => {
    const value = ls.get(key);
    if (value === null) return null;
    if (typeof value !== "string" || isBlankBody(value)) {
      ls.remove(key);
      return null;
    }
    return value;
  };
  const isMobile = useIsMobile();
  const boxRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState(0);
  const [preview, setPreview] = useState("");
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");

  const { data: userContext } = useQuery({
    ...getCommunityContextQueryOptions(activeUser?.username, entry.category),
    enabled: !!activeUser?.username && isCommunity(entry.category),
    select: ({ subscribed, role }) =>
      getCommunityPermissions({
        communityType: getCommunityType(entry.category ?? "", -1),
        subscribed,
        userRole: role
      })
  });

  const rows = useMemo(() => text!.split(/\r\n|\r|\n|<br>/).length, [text]);

  // The reply as it will be broadcast. The permlink and metadata are built the
  // same way submitReply builds them, because both feed the RC cost: the
  // permlink through comment_permlink_char_size and the metadata through
  // transaction size. A `re-${parent permlink}` stand-in is a different length
  // entirely, so it would skew the estimate for no reason.
  const rcPayload = useMemo<RcPrecheckPayload | undefined>(
    () =>
      activeUser?.username
        ? {
            kind: "comment",
            op: {
              author: activeUser.username,
              permlink: createReplyPermlink(entry.author),
              parent_author: entry.author,
              parent_permlink: entry.permlink,
              title: "",
              body: text ?? "",
              json_metadata: JSON.stringify(
                makeJsonMetaDataReply(entry.json_metadata?.tags || ["ecency"], appPackage.version)
              )
            }
          }
        : undefined,
    [activeUser?.username, entry.author, entry.permlink, entry.json_metadata?.tags, text]
  );

  useEffect(() => {
    if (selection) {
      // From the current text, not a functional update: react-use's setter sees
      // the state from when its key was set, so `prev` dropped what was typed since.
      setText(`${selection}${text ?? ""}`);
      const el = (inputRef as any)?.current as HTMLTextAreaElement | null;

      // Enhanced validation to ensure element is fully initialized
      if (el && el.scrollHeight !== undefined && typeof el.scrollHeight === 'number') {
        try {
          // Safely access DOM properties with additional validation
          let scHeight = el.scrollHeight;
          const reduceScHeight = scHeight - 20 || scHeight - 24;
          if (reduceScHeight) {
            scHeight = reduceScHeight;
          }
          setInputHeight(scHeight);
          const caret = selection.length;

          // Re-validate element existence and method availability in requestAnimationFrame
          requestAnimationFrame(() => {
            const currentEl = (inputRef as any)?.current as HTMLTextAreaElement | null;
            if (currentEl &&
                typeof currentEl.setSelectionRange === 'function' &&
                currentEl.isConnected) {
              currentEl.setSelectionRange(caret, caret);
            }
          });
        } catch (error) {
          // Gracefully handle any DOM access errors during hydration
          console.debug('Error accessing textarea during hydration:', error);
        }
      }
      setSelection("");
    }
  }, [selection, setSelection, setText, inputRef]);

  useDebounce(
    () => {
      setPreview(text!);
    },
    50,
    [text]
  );

  // Keep the action row above the on-screen keyboard on mobile by tracking the
  // visual viewport and exposing the keyboard height as a CSS variable.
  useEffect(() => {
    if (!isMobile || typeof window === "undefined" || !window.visualViewport) {
      return;
    }
    const vv = window.visualViewport;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      boxRef.current?.style.setProperty("--comment-kb-inset", `${inset}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [isMobile]);

  // Restore a reply whose blockchain submission failed, with its payout choice,
  // once, into the account that sent it: a failure that lands while another account
  // is active waits for its sender to come back, and one already restored is never
  // replayed over what the writer did with it since.
  const restoredFailedReply = useRef<FailedReply | null>(null);
  const restoredThisCommit = useRef(false);
  useEffect(() => {
    if (!failedReply || failedReply.username !== activeUser?.username) return;
    if (restoredFailedReply.current === failedReply) return;
    restoredFailedReply.current = failedReply;
    restoredThisCommit.current = true;
    if (failedReply.text !== text) {
      setText(failedReply.text);
    }
    setDeclinePayout(failedReply.declinePayout);
    if (failedReply.declinePayout && pendingDeclineKey) {
      ls.set(pendingDeclineKey, failedReply.text);
    } else {
      forgetPendingDecline();
    }
  }, [failedReply, activeUser?.username]);

  // A form opened without a failure in hand: re-apply a pending decline when the
  // restored draft is still the failed reply's text, and drop it otherwise.
  // A switch of account with the form open resets the choice first: it was the
  // previous account's. A failure restored by the switch itself (above) keeps its
  // own choice. Otherwise a held failed reply of the now-active account wins over
  // the reset only while its stored decline still exists AND is still the draft's
  // text: unchecking or editing forgets it, another account may have replaced the
  // shared draft meanwhile, and a declined payout cannot be undone on chain.
  const lastPendingDeclineKey = useRef(pendingDeclineKey);
  useEffect(() => {
    // A reply that failed while this account was not the one signed in was kept
    // for it alone (failed-decline.ts). It comes back into a blank form now, as
    // the form opens or this account becomes active; a newer draft wins over it.
    // A held failure of this account comes first: it carries its own choice, and
    // its restore (above) has just run. A kept copy of the same reply goes; a kept
    // different reply waits, and never lands under the held reply's decline.
    let current = text;
    const user = activeUser?.username;
    if (pendingDeclineKey && user) {
      const keptKey = failedTextKey(user, entry.author, entry.permlink);
      const kept = ls.get(keptKey);
      const heldOwn = !!failedReply && failedReply.username === user;
      if (kept !== null && heldOwn) {
        if (kept === failedReply!.text) ls.remove(keptKey);
      } else if (kept !== null) {
        if (typeof kept === "string" && !isBlankBody(kept) && (isBlankBody(text) || text === kept)) {
          // Left in storage until the text has landed in the form (the effect
          // below removes it), so a second run of this effect (StrictMode) sees
          // the same restore and no state outlives it. Already there: nothing has
          // to land, so it goes now.
          if (text === kept) {
            ls.remove(keptKey);
          } else {
            setText(kept);
          }
          current = kept;
        } else {
          ls.remove(keptKey);
          if (ls.get(pendingDeclineKey) === kept) forgetPendingDecline();
        }
      }
    }
    if (lastPendingDeclineKey.current !== pendingDeclineKey) {
      lastPendingDeclineKey.current = pendingDeclineKey;
      if (!restoredThisCommit.current) {
        const ownFailure =
          !!failedReply && failedReply.username === activeUser?.username && !!pendingDeclineKey;
        const pending = ownFailure ? readPendingDecline(pendingDeclineKey!) : null;
        setDeclinePayout(ownFailure && failedReply!.declinePayout && pending !== null && pending === current);
        if (pending !== null && pending !== current) forgetPendingDecline();
      }
    }
    // Only this account's own held failure decides the box (its restore did); a
    // held failure of another account is not in this form and changes nothing.
    if ((failedReply && failedReply.username === activeUser?.username) || isEdit || !pendingDeclineKey) return;
    const pending = readPendingDecline(pendingDeclineKey);
    if (pending === null) return;
    if (pending === current) {
      setDeclinePayout(true);
    } else {
      forgetPendingDecline();
    }
  }, [pendingDeclineKey]);
  // A pending decline follows the writer's edits of the failed reply (#2103):
  // whenever the draft changes from the text the decline was stored for, the
  // decline moves to the new text. Only from that exact text, so a decline stored
  // for some other text is never adopted (the checks above drop that one), and
  // whatever changed the draft (typing, the toolbar, a quote) is covered alike.
  const lastText = useRef(text);
  useEffect(() => {
    const previous = lastText.current;
    lastText.current = text;
    // A kept failure restored into the form is done once its text has landed.
    if (activeUser?.username && !isBlankBody(text)) {
      const keptKey = failedTextKey(activeUser.username, entry.author, entry.permlink);
      if (ls.get(keptKey) === text) ls.remove(keptKey);
    }
    if (previous === text || !pendingDeclineKey) return;
    if (ls.get(pendingDeclineKey) !== previous) return;
    // Cleared to blank: the failed reply is gone, and so is its decline.
    if (isBlankBody(text)) {
      forgetPendingDecline();
    } else {
      ls.set(pendingDeclineKey, text);
    }
  }, [text]);

  // Runs last in every commit: the restore flag above only spans the commit it ran in.
  useEffect(() => {
    restoredThisCommit.current = false;
  });

  useMount(() => {
    if (isEdit) {
      setText(entry.body);
    }

    commentBodyRef.current?.addEventListener("paste", handlePaste);
    commentBodyRef.current?.addEventListener("dragover", handleDragover);
    commentBodyRef.current?.addEventListener("drop", handleDrop);
  });

  useUnmount(() => {
    commentBodyRef.current?.removeEventListener("paste", handlePaste);
    commentBodyRef.current?.removeEventListener("dragover", handleDragover);
    commentBodyRef.current?.removeEventListener("drop", handleDrop);
  });

    const textChanged = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const { value: text } = e.target;
      let scHeight: number = e.target.scrollHeight;
      let reduceScHeight: number = scHeight - 20 || scHeight - 24;
      if (reduceScHeight) {
        scHeight = reduceScHeight;
      }
      setText(text);
      setInputHeight(scHeight);
    }, [setText]);

    // Nothing to broadcast without a body: the chain op requires one, and the
    // SDK builder throws `[SDK][buildCommentOp] Missing required parameters`
    // straight into a toast if we let an empty composer through. `isBlankBody`
    // is the shared rule, so this gate and the guards behind it agree on what
    // counts as blank (whitespace and zero-width characters included).
    const canSubmit = !isBlankBody(text);

    const submit = useCallback(async () => {
      if (isBlankBody(text)) {
        return;
      }

      try {
        await onSubmit(text!, { declinePayout: !isEdit && declinePayout });
        forgetPendingDecline();
        if (clearOnSubmit) {
          setText("");
          setDeclinePayout(false);
        }
      } catch (err: any) {
        const handled = handleAndReportError(err, "comment");
        if (!handled) {
          throw err; // ❌ only throw unexpected errors
        }
      }
    }, [
      onSubmit,
      text,
      clearOnSubmit,
      setText,
      isEdit,
      declinePayout,
      forgetPendingDecline
    ]);

  const cancel = useCallback(() => {
    if (onCancel) onCancel();
  }, [onCancel]);

  const handlePaste = (event: Event): void => toolbarEventListener(event, "paste");

  const handleDragover = (event: Event): void => toolbarEventListener(event, "dragover");

  const handleDrop = (event: Event): void => toolbarEventListener(event, "drop");
  const handleShortcuts = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      // Submit on Cmd/Ctrl+Enter — unless the mention autocomplete dropdown is
      // open (Enter picks a suggestion) or there is nothing to submit yet.
      const autocompleteOpen = !!commentBodyRef.current?.querySelector(".rta__autocomplete");
      if (!autocompleteOpen && !inProgress && !isBlankBody(text)) {
        e.preventDefault();
        submit();
      }
      return;
    }
    handleEditorShortcut(e);
  };
  const isCommunityPost = isCommunity(entry.category);
  const canComment = isCommunityPost
      ? userContext?.canComment
      : !!activeUser?.username;

  if (!canComment) {
    return <></>;
  }

  const showEditor = !isMobile || mobileView === "write";
  const showPreview = !isMobile || mobileView === "preview";

  // The backend drops a reply this short without telling anyone, so the user posts,
  // watches the quest counter stay put and reports it as a bug. An edit never earns
  // either (the original already claimed the reward), so there is nothing to say there.
  const showShortReplyHint = shouldShowShortContentHint({
    username: activeUser?.username,
    isEditing: isEdit,
    text
  });

  return (
    <>
      <div className="comment-box" role="presentation" ref={boxRef}>
        {isMobile && (
          <div className="comment-view-toggle" role="tablist">
            <Button
              size="sm"
              outline={mobileView !== "write"}
              onClick={() => setMobileView("write")}
              role="tab"
              aria-selected={mobileView === "write"}
            >
              {i18next.t("comment.write")}
            </Button>
            <Button
              size="sm"
              outline={mobileView !== "preview"}
              disabled={!text?.trim()}
              onClick={() => setMobileView("preview")}
              role="tab"
              aria-selected={mobileView === "preview"}
            >
              {i18next.t("comment.preview")}
            </Button>
          </div>
        )}
        {/* Hide (don't unmount) the editor pane so the paste/drag/drop listeners
            attached to `commentBodyRef` survive a Write/Preview toggle. */}
        <div className={showEditor ? undefined : "hidden"}>
          <EditorToolbar comment={true} sm={true} />
          <div
            className="comment-body"
            role="presentation"
            onKeyDown={handleShortcuts}
            ref={commentBodyRef}
          >
            <TextareaAutocomplete
              className={`the-editor accepts-emoji ${text!.length > 20 ? "expanded" : ""}`}
              as="textarea"
              placeholder={i18next.t("comment.body-placeholder")}
              containerStyle={{ height: !text ? "80px" : inputHeight }}
              value={text}
              onChange={textChanged}
              disabled={inProgress}
              autoFocus={autoFocus}
              minrows={3}
              rows={rows}
              maxrows={100}
              ref={inputRef}
              acceptCharset="UTF-8"
              id="the-editor"
              spellCheck={true}
              isComment={true}
            />
            <div className="editor-toolbar bottom">
              {activeUser ? (
                <AvailableCredits
                  className="p-2 w-full"
                  operation="comment_operation"
                  username={activeUser.username}
                  payload={rcPayload}
                />
              ) : (
                <></>
              )}
            </div>
          </div>
        </div>
        <RcPrecheckBanner operation="comment_operation" payload={rcPayload} className="mt-2" />
        {showShortReplyHint && (
          <div className="comment-short-reply-hint mt-2 text-xs opacity-60" role="status">
            {i18next.t("comment.short-reply-hint", { n: QUEST_MIN_CONTENT_LENGTH })}
          </div>
        )}
        <div className="comment-buttons flex items-center mt-3">
          <div className="mr-auto flex items-center gap-3">
            {!isMobile && (
              <span className="comment-submit-hint text-xs opacity-60">
                {i18next.t("comment.submit-shortcut")}
              </span>
            )}
            {/* comment_options is create-only, so an edit cannot change the payout. */}
            {!isEdit && (
              <div className="comment-decline-payout text-sm">
                <FormControl
                  type="checkbox"
                  label={i18next.t("comment.decline-payout")}
                  checked={declinePayout}
                  onChange={(checked: boolean) => {
                    setDeclinePayout(checked);
                    if (!checked) forgetPendingDecline();
                  }}
                />
              </div>
            )}
          </div>
          {cancellable && (
            <Button
              className="mr-2"
              size="sm"
              outline={true}
              disabled={inProgress}
              onClick={cancel}
            >
              {i18next.t("g.cancel")}
            </Button>
          )}
          <LoginRequired promptOnAnon>
            <Button
              size="sm"
              onClick={submit}
              disabled={!canSubmit}
              isLoading={inProgress}
              iconPlacement="left"
            >
              {submitText}
            </Button>
          </LoginRequired>
        </div>
        {showPreview && <CommentPreview text={preview} />}
      </div>
    </>
  );
}
