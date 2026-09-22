"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  getAccountFullQueryOptions,
  getCurationRecommenderQueryOptions,
  getCurationStatusQueryOptions,
  type CurationApplication,
  type CurationApplicationWindow
} from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { LoginRequired } from "@/features/shared/login-required";
import { error as errorToast, success as successToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import { accountReputation } from "@/utils/account-reputation";
import { dateToRelative } from "@/utils";
import { Chip } from "./curation-chip";
import { DAY_MS } from "./consts";
import {
  useCurationApplication,
  useCurationApplicationWithdraw,
  useCurationApply,
  useViewerRole
} from "./hooks";

/**
 * "Apply to be a guest curator": the one page that turns the guide's description
 * of a trial into something a reader can act on.
 *
 * Everything above the form renders for a logged-out visitor too, so the page is
 * worth indexing and worth linking. The checklist is deliberately informational:
 * the desk publishes the numbers it has about an account, and a curator still
 * reads the whole picture. Nothing here refuses an application.
 */

/** The caps the desk enforces. Mirrored so the counter is honest before the round trip. */
const ANSWER_MAX = { motivation: 500, availability: 200, pick: 500 } as const;

type AnswerKey = keyof typeof ANSWER_MAX;
const ANSWERS: AnswerKey[] = ["motivation", "availability", "pick"];

/** How long a declined applicant waits, as the desk counts it. */
const REAPPLY_DAYS = 30;

interface ChecklistProps {
  username: string;
}

function ApplicantChecklist({ username }: ChecklistProps) {
  const account = useQuery(getAccountFullQueryOptions(username));
  const record = useQuery(getCurationRecommenderQueryOptions(username));

  const ageDays = useMemo(() => {
    const created = account.data?.created;
    if (!created) return null;
    // The chain writes account.created without a zone; it is UTC.
    const at = Date.parse(created.endsWith("Z") ? created : `${created}Z`);
    if (Number.isNaN(at)) return null;
    return Math.max(0, Math.floor((Date.now() - at) / DAY_MS));
  }, [account.data?.created]);

  const rep = account.data ? Math.round(accountReputation(account.data.reputation)) : null;
  const stats = record.data;

  return (
    <div className="mt-6 rounded-lg border border-[--border-color] p-4">
      <h3 className="text-base font-semibold">
        {i18next.t("curation-desk.apply.checklist-title")}
      </h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
            {i18next.t("curation-desk.apply.check-age")}
          </dt>
          <dd className="text-sm">
            {ageDays === null
              ? i18next.t("curation-desk.apply.check-unknown")
              : i18next.t("curation-desk.apply.check-age-value", { count: ageDays })}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
            {i18next.t("curation-desk.apply.check-rep")}
          </dt>
          <dd className="text-sm">
            {rep === null ? i18next.t("curation-desk.apply.check-unknown") : rep}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
            {i18next.t("curation-desk.apply.check-recommendations")}
          </dt>
          <dd className="text-sm">
            {!stats || stats.recommended === 0
              ? i18next.t("curation-desk.apply.check-recommendations-none")
              : i18next.t("curation-desk.apply.check-recommendations-value", {
                  recommended: stats.recommended,
                  curated: stats.curated,
                  dismissed: stats.dismissed
                })}
            {stats?.trusted && (
              <Chip className="ml-2" tone="blue">
                {i18next.t("curation-desk.apply.check-trusted")}
              </Chip>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
        {i18next.t("curation-desk.apply.checklist-hint")}
      </p>
    </div>
  );
}

function SentApplication({
  application,
  onWithdraw,
  busy
}: {
  application: CurationApplication;
  onWithdraw: () => void;
  busy: boolean;
}) {
  const live = application.state === "open" || application.state === "shortlisted";
  const reapplyAt = useMemo(() => {
    if (application.state !== "declined") return null;
    const decided = Date.parse(application.decided_at ?? application.updated_at);
    if (Number.isNaN(decided)) return null;
    return new Date(decided + REAPPLY_DAYS * DAY_MS);
  }, [application.state, application.decided_at, application.updated_at]);

  return (
    <div className="mt-6 rounded-lg border border-[--border-color] p-4">
      <h3 className="text-base font-semibold">
        {i18next.t("curation-desk.apply.your-application")}
      </h3>
      <p className="mt-1 text-sm">{i18next.t(`curation-desk.apply.state-${application.state}`)}</p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
        {i18next.t("curation-desk.apply.sent-when", { when: dateToRelative(application.created) })}
      </p>
      {reapplyAt && (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          {i18next.t("curation-desk.apply.declined-again", {
            when: reapplyAt.toLocaleDateString()
          })}
        </p>
      )}
      <h4 className="mt-4 text-sm font-semibold">
        {i18next.t("curation-desk.apply.answers-title")}
      </h4>
      <dl className="mt-2 grid gap-2 text-sm">
        {ANSWERS.map((key) => (
          <div key={key}>
            <dt className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
              {i18next.t(`curation-desk.apply.${key}-label`)}
            </dt>
            <dd className="whitespace-pre-wrap">{application.answers?.[key]}</dd>
          </div>
        ))}
      </dl>
      {live && (
        <Button
          className="mt-4"
          size="sm"
          appearance="gray-link"
          disabled={busy}
          onClick={onWithdraw}
        >
          {busy
            ? i18next.t("curation-desk.apply.withdrawing")
            : i18next.t("curation-desk.apply.withdraw")}
        </Button>
      )}
    </div>
  );
}

export function CurationApplyView() {
  const username = useActiveUsername();
  const { isRoster } = useViewerRole();
  const status = useQuery(getCurationStatusQueryOptions());
  const mine = useCurationApplication(!!username);
  const apply = useCurationApply();
  const withdraw = useCurationApplicationWithdraw();

  const [draft, setDraft] = useState<Record<AnswerKey, string>>({
    motivation: "",
    availability: "",
    pick: ""
  });
  const [readGuide, setReadGuide] = useState(false);

  /**
   * The signed read is authoritative once it lands; until then the public status
   * carries the same two fields, so the page does not wait on a request to know
   * whether it may invite anyone. A desk that sends neither reads as open: the
   * feature flag is what decides whether this page exists at all, and a form
   * that answers "closed" until a slow request lands would turn every first
   * paint into a closed door.
   */
  const applicationWindow: CurationApplicationWindow = mine.data?.window ??
    status.data?.applications ?? { open: true, message: null };

  const application = mine.data?.application ?? null;
  const live = application?.state === "open" || application?.state === "shortlisted";
  // The roster read and the signed read can disagree for a moment after a
  // promotion; either saying so is enough to stop offering the form.
  const onRoster = isRoster || !!mine.data?.role;
  const busy = apply.isPending;

  function submit() {
    const answers = {
      motivation: draft.motivation.trim(),
      availability: draft.availability.trim(),
      pick: draft.pick.trim()
    };
    apply.mutate(answers, {
      onSuccess: () => {
        successToast(i18next.t("curation-desk.apply.sent-toast"));
        setDraft({ motivation: "", availability: "", pick: "" });
        setReadGuide(false);
      },
      onError: (e) => errorToast(...formatError(e))
    });
  }

  const complete =
    readGuide &&
    ANSWERS.every((key) => {
      const value = draft[key].trim();
      return value.length > 0 && value.length <= ANSWER_MAX[key];
    });

  return (
    <div className="px-2 py-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {i18next.t("curation-desk.apply.lead")}
      </p>

      <section className="mt-5">
        <h2 className="text-lg font-semibold">{i18next.t("curation-desk.apply.what-title")}</h2>
        <p className="mt-2 text-sm">{i18next.t("curation-desk.apply.what-body")}</p>
        <p className="mt-2 text-sm">{i18next.t("curation-desk.apply.what-time")}</p>
      </section>

      <section className="mt-5">
        <h2 className="text-lg font-semibold">{i18next.t("curation-desk.apply.trial-title")}</h2>
        <p className="mt-2 text-sm">{i18next.t("curation-desk.apply.trial-body")}</p>
        <Link className="mt-2 inline-block text-sm text-blue-dark-sky" href="/curation/guide">
          {i18next.t("curation-desk.apply.guide-link")}
        </Link>
      </section>

      {username && !onRoster && <ApplicantChecklist username={username} />}

      {onRoster ? (
        <p className="mt-6 text-sm">{i18next.t("curation-desk.apply.roster-member")}</p>
      ) : application && (live || application.state !== "withdrawn") ? (
        <SentApplication
          application={application}
          busy={withdraw.isPending}
          onWithdraw={() =>
            withdraw.mutate(undefined, {
              onSuccess: () => successToast(i18next.t("curation-desk.apply.withdrawn-toast")),
              onError: (e) => errorToast(...formatError(e))
            })
          }
        />
      ) : !applicationWindow.open ? (
        <div className="mt-6 rounded-lg border border-[--border-color] p-4">
          <h3 className="text-base font-semibold">
            {i18next.t("curation-desk.apply.closed-title")}
          </h3>
          <p className="mt-1 text-sm">
            {applicationWindow.message || i18next.t("curation-desk.apply.closed-body")}
          </p>
        </div>
      ) : (
        <form
          className="mt-6 grid gap-4 rounded-lg border border-[--border-color] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 className="text-lg font-semibold">
            {i18next.t("curation-desk.apply.questions-title")}
          </h2>
          {ANSWERS.map((key) => (
            <div key={key} className="flex flex-col gap-1">
              {/* The counter sits OUTSIDE the label: inside it, it becomes part of
                  the field's accessible name, so a screen reader reads the count
                  as part of the question and it changes on every keystroke. */}
              <label className="flex flex-col gap-1 text-sm">
                {i18next.t(`curation-desk.apply.${key}-label`)}
                <FormControl
                  type="textarea"
                  rows={key === "availability" ? 2 : 4}
                  maxLength={ANSWER_MAX[key]}
                  placeholder={i18next.t(`curation-desk.apply.${key}-placeholder`)}
                  value={draft[key]}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDraft((current) => ({ ...current, [key]: e.target.value }))
                  }
                />
              </label>
              <span
                aria-hidden="true"
                className={clsx(
                  "self-end text-xs",
                  draft[key].trim().length > ANSWER_MAX[key]
                    ? "text-red-030 dark:text-red-light-020"
                    : "text-gray-600 dark:text-gray-400"
                )}
              >
                {i18next.t("curation-desk.apply.counter", {
                  count: draft[key].trim().length,
                  max: ANSWER_MAX[key]
                })}
              </span>
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={readGuide}
              onChange={(e) => setReadGuide(e.target.checked)}
            />
            <span>{i18next.t("curation-desk.apply.guide-read")}</span>
          </label>

          <div>
            <LoginRequired promptOnAnon>
              <Button
                type={username ? "submit" : "button"}
                size="sm"
                disabled={busy || (!!username && !complete)}
              >
                {busy
                  ? i18next.t("curation-desk.apply.sending")
                  : i18next.t("curation-desk.apply.submit")}
              </Button>
            </LoginRequired>
            {!username && (
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                {i18next.t("curation-desk.apply.needs-login")}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
