"use client";

import { useQuery } from "@tanstack/react-query";
import { getProMembersQueryOptions } from "@ecency/sdk";
import { isProMember } from "@/features/pro/pro-config";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { QueryIdentifiers } from "@/core/react-query";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { UilEnvelopeEdit } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import React, { type ReactElement, useMemo, useState } from "react";
import { authorSendApi, type CandidatePost, COMPOSE_MAX, COMPOSE_MIN, type ComposeRequest, INTRO_MAX, SUBJECT_MAX } from "./author-send-api";
import { SendFlow } from "./author-send-dialog";
import type { SendTarget } from "./author-send-eligibility";
import { useNewsletterEnabled } from "./runtime";

/**
 * Compose an email digest (vision-web#1536): pick 2..10 of the list's recent
 * posts (candidates come filtered from the service, with "featured recently"
 * marks), write a subject and an intro, then the same preview-and-send flow as
 * a single post. Same gate, same one-issue-per-period rule.
 */
export const candidatesKey = (type: "creator" | "community", target: string, viewer: string | null | undefined): readonly [QueryIdentifiers, string, string, string] =>
  [QueryIdentifiers.NEWSLETTER_CANDIDATE_POSTS, type, target, viewer ?? "anon"] as const;

const refKey = (p: { author: string; permlink: string }) => `${p.author}/${p.permlink}`;

export function ComposeDigestDialog({ target, show, onHide }: { target: SendTarget; show: boolean; onHide: () => void }): ReactElement {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username ?? "";
  const [picked, setPicked] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("");
  const [phase, setPhase] = useState<"pick" | "send">("pick");

  const candidates = useQuery<CandidatePost[], Error>({
    queryKey: candidatesKey(target.type, target.target, username),
    enabled: show && !!username,
    staleTime: 60_000,
    retry: false,
    queryFn: () => authorSendApi.candidates(target.type, target.target, username)
  });

  const toggle = (key: string) =>
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length < COMPOSE_MAX ? [...cur, key] : cur));

  const request = useMemo<ComposeRequest | null>(() => {
    if (picked.length < COMPOSE_MIN || !candidates.data) return null;
    // Keep the sender's picking order: it is the order in the issue.
    const byKey = new Map(candidates.data.map((c) => [refKey(c), c]));
    const posts = picked.map((k) => byKey.get(k)).filter((c): c is CandidatePost => !!c).map((c) => ({ author: c.author, permlink: c.permlink }));
    return { type: target.type, target: target.target, posts, subject: subject.trim() || undefined, intro: intro.trim() || undefined };
  }, [picked, candidates.data, target, subject, intro]);

  const close = () => {
    onHide();
    setPhase("pick");
  };

  return (
    <Modal show={show} onHide={close} centered={true} size="lg">
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("newsletter.compose-title", { list: target.label })}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {phase === "send" && request ? (
          <SendFlow request={request} target={target} onHide={close} onBack={() => setPhase("pick")} />
        ) : (
          <>
            <p className="text-sm opacity-80 mb-3">{i18next.t("newsletter.compose-help", { min: COMPOSE_MIN, max: COMPOSE_MAX })}</p>
            {candidates.isPending && <div className="text-sm opacity-70">{i18next.t("newsletter.compose-loading")}</div>}
            {candidates.isError && <Alert appearance="warning">{i18next.t("newsletter.compose-candidates-unavailable")}</Alert>}
            {candidates.data && candidates.data.length === 0 && <Alert appearance="primary">{i18next.t("newsletter.compose-no-candidates")}</Alert>}
            {candidates.data && candidates.data.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col gap-1 max-h-[300px] overflow-y-auto border border-[--border-color] rounded-lg p-2" aria-label={i18next.t("newsletter.compose-pick")}>
                {candidates.data.map((c) => {
                  const key = refKey(c);
                  const on = picked.includes(key);
                  const idx = picked.indexOf(key);
                  return (
                    <li key={key}>
                      <label className="flex items-start gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={on}
                          disabled={!on && picked.length >= COMPOSE_MAX}
                          onChange={() => toggle(key)}
                          aria-label={c.title}
                        />
                        <span className="min-w-0">
                          <span className="block truncate">
                            {on ? <span className="opacity-60 tabular-nums mr-1">{idx + 1}.</span> : null}
                            {c.title}
                          </span>
                          <span className="text-xs opacity-60">
                            <time dateTime={c.created}>{new Date(c.created).toLocaleDateString(i18next.language)}</time>
                            {c.featured ? ` · ${i18next.t("newsletter.compose-featured")}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <FormControl
                type="text"
                value={subject}
                maxLength={SUBJECT_MAX}
                placeholder={i18next.t("newsletter.compose-subject")}
                aria-label={i18next.t("newsletter.compose-subject")}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
              />
              <FormControl
                type="textarea"
                value={intro}
                maxLength={INTRO_MAX}
                rows={3}
                placeholder={i18next.t("newsletter.compose-intro")}
                aria-label={i18next.t("newsletter.compose-intro")}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setIntro(e.target.value)}
              />
              <div className="text-xs opacity-60">{i18next.t("newsletter.compose-picked", { n: picked.length, min: COMPOSE_MIN, max: COMPOSE_MAX })}</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button appearance="gray-link" onClick={close}>
                {i18next.t("g.cancel")}
              </Button>
              <Button disabled={!request} onClick={() => setPhase("send")}>
                {i18next.t("newsletter.compose-continue")}
              </Button>
            </div>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}

/**
 * The entry point on the sender's own surfaces. Renders nothing unless the
 * viewer may send: `isSender` is the surface's own knowledge (own profile;
 * community owner or admin), and a creator additionally has to be Pro, checked
 * here against the roster the way the post menu does.
 */
export function ComposeDigestButton({ target, isSender, className }: { target: SendTarget; isSender: boolean; className?: string }): ReactElement | null {
  const enabled = useNewsletterEnabled();
  const [open, setOpen] = useState(false);
  const { data: pro } = useQuery({ ...getProMembersQueryOptions(), enabled: enabled && isSender && target.type === "creator" });
  const canSend = isSender && (target.type !== "creator" || isProMember(pro?.members, target.target));
  if (!enabled || !canSend) return null;
  return (
    <>
      <Button size="sm" appearance="gray-link" icon={<UilEnvelopeEdit />} iconPlacement="left" className={className} onClick={() => setOpen(true)}>
        {i18next.t("newsletter.compose-button")}
      </Button>
      {open && <ComposeDigestDialog target={target} show={open} onHide={() => setOpen(false)} />}
    </>
  );
}
