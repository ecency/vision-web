"use client";

import { useState } from "react";
import i18next from "i18next";
import { useQuery } from "@tanstack/react-query";
import {
  getAccountFullQueryOptions,
  type CurationApplicationAdminEntry,
  type CurationRole
} from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { error as errorToast, success as successToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { UserAvatar } from "@/features/shared/user-avatar";
import { accountReputation, dateToRelative } from "@/utils";
import { Chip } from "./curation-chip";
import { DAY_MS } from "./consts";
import {
  useCurationApplicationDecide,
  useCurationApplicationWindow,
  useCurationApplications
} from "./hooks";

/**
 * The review side of guest curator applications, inside the admin-only roster
 * tab: promoting writes the roster row the form below manages, so the two
 * belong on one screen rather than in two tabs that disagree.
 */

/** The seats an acceptance may grant. Admin is not one: that is a roster edit. */
const SEATS: Extract<CurationRole, "trial" | "curator" | "mod">[] = ["trial", "curator", "mod"];

function ApplicantFacts({ username }: { username: string }) {
  const account = useQuery(getAccountFullQueryOptions(username));
  if (!account.data) return null;
  const created = account.data.created;
  const at = Date.parse(created?.endsWith("Z") ? created : `${created}Z`);
  const days = Number.isNaN(at) ? null : Math.max(0, Math.floor((Date.now() - at) / DAY_MS));
  return (
    <>
      <Chip>
        {i18next.t("curation-desk.applications.rep", {
          rep: Math.round(accountReputation(account.data.reputation))
        })}
      </Chip>
      {days !== null && <Chip>{i18next.t("curation-desk.applications.age", { count: days })}</Chip>}
    </>
  );
}

function ApplicationRow({
  entry,
  busy,
  onDecide
}: {
  entry: CurationApplicationAdminEntry;
  busy: boolean;
  onDecide: (
    state: "shortlisted" | "accepted" | "declined",
    role: CurationRole,
    note: string
  ) => void;
}) {
  const [role, setRole] = useState<Extract<CurationRole, "trial" | "curator" | "mod">>("trial");
  const [note, setNote] = useState("");
  const record = entry.snapshot;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        <UserAvatar username={entry.username} size="small" />
        <strong className="text-sm">@{entry.username}</strong>
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {i18next.t("curation-desk.applications.applied", { when: dateToRelative(entry.created) })}
        </span>
        {entry.state === "shortlisted" && (
          <Chip tone="blue">{i18next.t("curation-desk.applications.shortlisted")}</Chip>
        )}
        <ApplicantFacts username={entry.username} />
        <Chip>
          {!record || record.recommended === 0
            ? i18next.t("curation-desk.applications.record-none")
            : i18next.t("curation-desk.applications.record", {
                recommended: record.recommended,
                curated: record.curated,
                dismissed: record.dismissed
              })}
        </Chip>
      </div>

      <dl className="mt-3 grid gap-2 text-sm">
        {(["motivation", "availability", "pick"] as const).map((key) => (
          <div key={key}>
            <dt className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
              {i18next.t(`curation-desk.applications.${key}`)}
            </dt>
            <dd className="whitespace-pre-wrap">{entry.answers?.[key]}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {i18next.t("curation-desk.applications.seat")}
          <FormControl
            type="select"
            value={role}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setRole(e.target.value as (typeof SEATS)[number])
            }
          >
            {SEATS.map((seat) => (
              <option key={seat} value={seat}>
                {i18next.t(`curation-desk.roster.role-${seat}`)}
              </option>
            ))}
          </FormControl>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {i18next.t("curation-desk.applications.note")}
          <FormControl
            type="text"
            maxLength={500}
            placeholder={i18next.t("curation-desk.applications.note-placeholder")}
            value={note}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => onDecide("accepted", role, note)}>
          {i18next.t("curation-desk.applications.promote")}
        </Button>
        {entry.state !== "shortlisted" && (
          <Button
            size="sm"
            appearance="gray"
            disabled={busy}
            onClick={() => onDecide("shortlisted", role, note)}
          >
            {i18next.t("curation-desk.applications.shortlist")}
          </Button>
        )}
        <Button
          size="sm"
          appearance="gray-link"
          disabled={busy}
          onClick={() => onDecide("declined", role, note)}
        >
          {i18next.t("curation-desk.applications.decline")}
        </Button>
      </div>
    </li>
  );
}

export function CurationApplicationsPanel({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isError } = useCurationApplications(enabled);
  const decide = useCurationApplicationDecide();
  const setWindow = useCurationApplicationWindow();
  const [message, setMessage] = useState<string | null>(null);

  const applications = data?.applications ?? [];
  const applicationWindow = data?.window;
  const busy = decide.isPending || setWindow.isPending;
  // Edited once and then owned by the field; until then the stored line shows.
  const messageDraft = message ?? applicationWindow?.message ?? "";

  function saveWindow(open: boolean) {
    setWindow.mutate(
      { open, message: messageDraft.trim() ? messageDraft.trim() : null },
      {
        onSuccess: (data) => {
          successToast(i18next.t("curation-desk.applications.window-saved"));
          // Hold what was saved rather than dropping back to the stored line,
          // which is the pre-write one until the list refetches.
          setMessage(data.window.message ?? "");
        },
        onError: (e) => errorToast(...formatError(e))
      }
    );
  }

  function onDecide(
    entry: CurationApplicationAdminEntry,
    state: "shortlisted" | "accepted" | "declined",
    role: CurationRole,
    note: string
  ) {
    decide.mutate(
      {
        applicant: entry.username,
        state,
        // The seat only travels with an acceptance; upstream refuses it elsewhere.
        role: state === "accepted" ? (role as "trial" | "curator" | "mod") : undefined,
        note: note.trim() || undefined
      },
      {
        onSuccess: () =>
          successToast(
            i18next.t(
              `curation-desk.applications.${state === "accepted" ? "promoted" : state === "declined" ? "declined" : "shortlisted"}-toast`,
              {
                name: entry.username
              }
            )
          ),
        onError: (e) => errorToast(...formatError(e))
      }
    );
  }

  return (
    <section className="mt-2 rounded-lg border border-[--border-color] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {i18next.t("curation-desk.applications.title")}
          {data?.counts && (
            <span className="ml-2 text-xs font-normal text-gray-600 dark:text-gray-400">
              {i18next.t("curation-desk.applications.counts", {
                open: data.counts.open ?? 0,
                shortlisted: data.counts.shortlisted ?? 0
              })}
            </span>
          )}
        </h2>
        {applicationWindow && (
          <Chip tone={applicationWindow.open ? "green" : "gray"}>
            {applicationWindow.open
              ? i18next.t("curation-desk.applications.window-open")
              : i18next.t("curation-desk.applications.window-closed")}
          </Chip>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {i18next.t("curation-desk.applications.intro")}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          {i18next.t("curation-desk.applications.message-label")}
          <FormControl
            type="text"
            maxLength={200}
            placeholder={i18next.t("curation-desk.applications.message-placeholder")}
            value={messageDraft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-2">
          {/* Saving the line and flipping the switch are separate: rewording the
              message while closed used to mean opening applications for the round
              trip, which readers could act on. */}
          <Button
            size="sm"
            appearance="gray"
            disabled={busy || !applicationWindow}
            onClick={() => saveWindow(!!applicationWindow?.open)}
          >
            {i18next.t("curation-desk.applications.message-save")}
          </Button>
          <Button
            size="sm"
            appearance={applicationWindow?.open ? "gray" : undefined}
            // Until the window is known the button cannot say which way it flips,
            // and a click would send `open: true` at a desk that is closed.
            disabled={busy || !applicationWindow}
            onClick={() => saveWindow(!applicationWindow?.open)}
          >
            {applicationWindow?.open
              ? i18next.t("curation-desk.applications.close-action")
              : i18next.t("curation-desk.applications.open-action")}
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="mt-3 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>
      )}
      {isError && (
        <p className="mt-3 text-sm text-red-030 dark:text-red-light-020" role="alert">
          {i18next.t("curation-desk.applications.error")}
        </p>
      )}
      {!isLoading && !isError && applications.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">
          {i18next.t("curation-desk.applications.empty")}
        </p>
      )}

      <ul className="divide-y divide-[--border-color]">
        {applications.map((entry) => (
          <ApplicationRow
            key={entry.id}
            entry={entry}
            busy={busy}
            onDecide={(state, role, note) => onDecide(entry, state, role, note)}
          />
        ))}
      </ul>
    </section>
  );
}
