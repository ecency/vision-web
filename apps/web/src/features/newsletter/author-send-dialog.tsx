"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { QueryIdentifiers } from "@/core/react-query";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import Link from "next/link";
import { type ReactElement, useMemo, useState } from "react";
import { authorSendApi, type SendPreview, type SendRequest, type SendResult, SendRefusedError } from "./author-send-api";
import type { SendTarget } from "./author-send-eligibility";

/**
 * "Send to email subscribers" (vision-web#1532). Shows the reader's view of the
 * post as an issue, how many readers get it and as which period's issue, the
 * one-issue-per-period reminder, then sends. Every refusal the service can give
 * is shown for what it is: this period already has an issue (409, with what
 * took it), the list is suspended (403), the post is not sendable (422).
 */
interface Props {
  target: SendTarget;
  author: string;
  permlink: string;
  show: boolean;
  onHide: () => void;
}

/**
 * A stable identity for what is being sent: the post, or the composition's
 * posts, subject and intro. JSON, not a delimiter join: subject and intro are
 * the sender's text, and two different compositions must never share a key
 * (the preview is cached by it while the send carries the current request).
 */
function requestKey(req: SendRequest): string {
  if ("posts" in req) return JSON.stringify(["compose", req.posts.map((p) => `${p.author}/${p.permlink}`), req.subject ?? "", req.intro ?? ""]);
  return JSON.stringify(["post", `${req.author}/${req.permlink}`]);
}

export const sendPreviewKey = (req: SendRequest, viewer: string): readonly [QueryIdentifiers, string, string, string, string] =>
  [QueryIdentifiers.NEWSLETTER_SEND_PREVIEW, req.type, req.target, requestKey(req), viewer] as const;

/** Where the sender's history lives: their own profile card, or the community card. */
export function senderHistoryHref(target: SendTarget): string {
  return target.type === "creator" ? `/@${target.target}` : `/created/${target.target}`;
}

interface Refusal {
  key: string;
  detail?: string;
  /** For 409: which cadence's period is taken, and by what. */
  taken?: Array<{ cadence: string; period: string; kind: string }>;
}

function describeRefusal(err: unknown): Refusal {
  if (err instanceof SendRefusedError) {
    if (err.code === "already_sent") return { key: "newsletter.send-already-sent", taken: err.taken };
    if (err.code === "suspended") return { key: "newsletter.send-suspended" };
    if (err.code === "post_refused") return { key: "newsletter.send-post-refused", detail: err.message };
    if (err.code === "post_not_found") return { key: "newsletter.send-post-not-found" };
    if (err.status === 403) return { key: "newsletter.send-not-allowed", detail: err.message };
    if (err.status === 503 || err.status === 502 || err.status === 504) return { key: "newsletter.error-unavailable" };
  }
  return { key: "newsletter.error-generic" };
}

function RefusalAlert({ refusal, target }: { refusal: Refusal; target: SendTarget }): ReactElement {
  return (
    <Alert appearance="warning" className="mt-3">
      {i18next.t(refusal.key)}
      {refusal.detail ? <div className="mt-1 text-xs opacity-80">{refusal.detail}</div> : null}
      {refusal.taken && refusal.taken.length > 0 ? (
        <ul className="mt-1 text-xs opacity-90 list-disc pl-4">
          {refusal.taken.map((t) => (
            <li key={`${t.cadence}-${t.period}`}>
              {i18next.t("newsletter.send-taken-line", {
                cadence: i18next.t(`newsletter.cadence-${t.cadence}`),
                period: t.period,
                what: i18next.t(t.kind === "digest" ? "newsletter.send-taken-by-digest" : "newsletter.send-taken-by-send")
              })}
            </li>
          ))}
        </ul>
      ) : null}
      {refusal.key === "newsletter.send-already-sent" ? (
        <div className="mt-1 text-xs">
          <Link href={senderHistoryHref(target)} className="underline">
            {i18next.t("newsletter.send-see-history")}
          </Link>
        </div>
      ) : null}
    </Alert>
  );
}

/**
 * The send flow proper, reused by the single-post dialog and the composer:
 * preview, readers per cadence, the one-per-period rule, taken periods, send,
 * outcome. `request` is what is being sent, already decided by the caller.
 */
export function SendFlow({
  request,
  target,
  onHide,
  onBack
}: {
  request: SendRequest;
  target: SendTarget;
  onHide: () => void;
  /** The composer offers a way back to the picker. */
  onBack?: () => void;
}): ReactElement {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username ?? "";
  const queryClient = useQueryClient();
  const [result, setResult] = useState<SendResult | null>(null);

  const preview = useQuery<SendPreview, Error>({
    queryKey: sendPreviewKey(request, username),
    enabled: !!username,
    staleTime: 60_000,
    retry: false,
    queryFn: () => authorSendApi.preview(request, username)
  });

  const send = useMutation({
    mutationFn: () => authorSendApi.send(request, username),
    onSuccess: (r) => {
      setResult(r);
      queryClient.invalidateQueries({ queryKey: [QueryIdentifiers.NEWSLETTER_SEND_PREVIEW] });
      queryClient.invalidateQueries({ queryKey: [QueryIdentifiers.NEWSLETTER_SENT_ISSUES, target.type, target.target] });
      // The composer's candidates carry a "featured recently" mark; the posts just sent now have it.
      queryClient.invalidateQueries({ queryKey: [QueryIdentifiers.NEWSLETTER_CANDIDATE_POSTS, target.type, target.target] });
    }
  });

  const p = preview.data;
  const total = p ? p.subscribers.weekly + p.subscribers.monthly : 0;
  const freeCadences = p ? (["weekly", "monthly"] as const).filter((c) => p.subscribers[c] > 0 && !p.alreadySent.includes(c)) : [];
  const canSend = !!p && freeCadences.length > 0 && !send.isPending && !result;

  return (
    <>
        {preview.isPending && <div className="text-sm opacity-70">{i18next.t("newsletter.send-loading")}</div>}

        {preview.isError && (
          <>
            <RefusalAlert refusal={describeRefusal(preview.error)} target={target} />
            {onBack ? (
              // The composer: a refused post is fixed in the picker, not by starting over.
              <div className="mt-4 flex justify-end gap-2">
                <Button appearance="gray-link" onClick={onBack}>
                  {i18next.t("g.back")}
                </Button>
                <Button appearance="gray-link" onClick={onHide}>
                  {i18next.t("g.cancel")}
                </Button>
              </div>
            ) : null}
          </>
        )}

        {p && !result && (
          <>
            <div className="mb-3 text-sm">
              <div className="font-semibold">{p.subject}</div>
              <div className="opacity-80">
                {total === 0
                  ? i18next.t("newsletter.send-no-readers")
                  : i18next.t("newsletter.send-readers", { weekly: p.subscribers.weekly, monthly: p.subscribers.monthly })}
              </div>
              {p.alreadySent.length > 0 && (
                <div className="mt-1 text-red">
                  {i18next.t(p.alreadySent.length === 2 ? "newsletter.send-period-taken-all" : "newsletter.send-period-taken-some", {
                    cadences: p.alreadySent.map((c) => i18next.t(`newsletter.cadence-${c}`)).join(", ")
                  })}
                </div>
              )}
              <div className="mt-1 text-xs opacity-70">{i18next.t("newsletter.send-one-per-period")}</div>
            </div>
            <div className="rounded-lg border border-[--border-color] overflow-hidden bg-white">
              <iframe
                title={i18next.t("newsletter.send-preview")}
                sandbox=""
                srcDoc={p.html}
                className="w-full h-[420px] border-0"
                referrerPolicy="no-referrer"
              />
            </div>
            {send.isError && <RefusalAlert refusal={describeRefusal(send.error)} target={target} />}
            <div className="mt-4 flex justify-end gap-2">
              {onBack ? (
                <Button appearance="gray-link" onClick={onBack}>
                  {i18next.t("g.back")}
                </Button>
              ) : null}
              <Button appearance="gray-link" onClick={onHide}>
                {i18next.t("g.cancel")}
              </Button>
              <Button disabled={!canSend} isLoading={send.isPending} onClick={() => send.mutate()}>
                {i18next.t("newsletter.send-now")}
              </Button>
            </div>
          </>
        )}

        {result && (
          <>
            <Alert appearance="success">
              {i18next.t("newsletter.send-done", {
                count: result.issues.reduce((n, i) => n + i.send.recipients, 0)
              })}
            </Alert>
            <ul className="mt-2 text-sm list-disc pl-5">
              {result.issues.map((i) => (
                <li key={i.issueId}>
                  {i18next.t("newsletter.send-done-line", { cadence: i18next.t(`newsletter.cadence-${i.cadence}`), recipients: i.send.recipients })}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button onClick={onHide}>{i18next.t("g.close")}</Button>
            </div>
          </>
        )}
    </>
  );
}

/** One post as the issue, from the post's menu. */
export function AuthorSendDialog({ target, author, permlink, show, onHide }: Props): ReactElement {
  const request = useMemo<SendRequest>(() => ({ type: target.type, target: target.target, author, permlink }), [target, author, permlink]);
  return (
    <Modal show={show} onHide={onHide} centered={true} size="lg">
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("newsletter.send-title", { list: target.label })}</ModalTitle>
      </ModalHeader>
      <ModalBody>{show ? <SendFlow request={request} target={target} onHide={onHide} /> : null}</ModalBody>
    </Modal>
  );
}
