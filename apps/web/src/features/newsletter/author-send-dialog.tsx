"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { QueryIdentifiers } from "@/core/react-query";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { authorSendApi, type SendPreview, type SendRef, type SendResult, SendRefusedError } from "./author-send-api";
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

export const sendPreviewKey = (ref: SendRef, viewer: string) =>
  [QueryIdentifiers.NEWSLETTER_SEND_PREVIEW, ref.type, ref.target, ref.author, ref.permlink, viewer] as const;

function describeRefusal(err: unknown): { key: string; detail?: string } {
  if (err instanceof SendRefusedError) {
    if (err.code === "already_sent") return { key: "newsletter.send-already-sent" };
    if (err.code === "suspended") return { key: "newsletter.send-suspended" };
    if (err.code === "post_refused") return { key: "newsletter.send-post-refused", detail: err.message };
    if (err.code === "post_not_found") return { key: "newsletter.send-post-not-found" };
    if (err.status === 403) return { key: "newsletter.send-not-allowed", detail: err.message };
    if (err.status === 503 || err.status === 502 || err.status === 504) return { key: "newsletter.error-unavailable" };
  }
  return { key: "newsletter.error-generic" };
}

export function AuthorSendDialog({ target, author, permlink, show, onHide }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username ?? "";
  const queryClient = useQueryClient();
  const ref = useMemo<SendRef>(() => ({ type: target.type, target: target.target, author, permlink }), [target, author, permlink]);
  const [result, setResult] = useState<SendResult | null>(null);

  const preview = useQuery<SendPreview, Error>({
    queryKey: sendPreviewKey(ref, username),
    enabled: show && !!username,
    staleTime: 60_000,
    retry: false,
    queryFn: () => authorSendApi.preview(ref, username)
  });

  const send = useMutation({
    mutationFn: () => authorSendApi.send(ref, username),
    onSuccess: (r) => {
      setResult(r);
      queryClient.invalidateQueries({ queryKey: [QueryIdentifiers.NEWSLETTER_SEND_PREVIEW] });
      queryClient.invalidateQueries({ queryKey: [QueryIdentifiers.NEWSLETTER_SENT_ISSUES, target.type, target.target] });
    }
  });

  const p = preview.data;
  const total = p ? p.subscribers.weekly + p.subscribers.monthly : 0;
  const freeCadences = p ? (["weekly", "monthly"] as const).filter((c) => p.subscribers[c] > 0 && !p.alreadySent.includes(c)) : [];
  const canSend = !!p && freeCadences.length > 0 && !send.isPending && !result;

  return (
    <Modal show={show} onHide={onHide} centered={true} size="lg">
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("newsletter.send-title", { list: target.label })}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {preview.isPending && <div className="text-sm opacity-70">{i18next.t("newsletter.send-loading")}</div>}

        {preview.isError && (
          <Alert appearance="warning">
            {i18next.t(describeRefusal(preview.error).key)}
            {describeRefusal(preview.error).detail ? <div className="mt-1 text-xs opacity-80">{describeRefusal(preview.error).detail}</div> : null}
          </Alert>
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
            {send.isError && (
              <Alert appearance="warning" className="mt-3">
                {i18next.t(describeRefusal(send.error).key)}
                {describeRefusal(send.error).detail ? <div className="mt-1 text-xs opacity-80">{describeRefusal(send.error).detail}</div> : null}
              </Alert>
            )}
            <div className="mt-4 flex justify-end gap-2">
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
      </ModalBody>
    </Modal>
  );
}
