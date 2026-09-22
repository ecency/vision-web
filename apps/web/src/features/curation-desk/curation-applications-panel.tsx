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
import { clampTrimmed } from "./curation-text-limit";
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

/** The caps the desk enforces, counted in code points on both sides. */
const NOTE_MAX = 500;
const MESSAGE_MAX = 200;

/**
 * The line to show in the field: the draft while the stored line is still the one
 * it was typed against, and otherwise what is stored. Holding the text alone made
 * this tab's copy win for ever, so another admin's change arrived on a refetch,
 * was ignored, and was then overwritten by the next save from here.
 */
export function draftOrStored(
  draft: { value: string; basedOn: string } | null,
  stored: string
): string {
  return draft && draft.basedOn === stored ? draft.value : stored;
}

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
            placeholder={i18next.t("curation-desk.applications.note-placeholder")}
            value={note}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setNote(clampTrimmed(e.target.value, NOTE_MAX))
            }
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
  // The draft remembers which stored line it was typed against. Holding the text
  // alone made this tab's copy win for ever: another admin's change arrived on a
  // refetch and was ignored, then overwritten by the next save from here.
  const [message, setMessage] = useState<{ value: string; basedOn: string } | null>(null);

  const applications = data?.applications ?? [];
  const applicationWindow = data?.window;
  const busy = decide.isPending || setWindow.isPending;
  const stored = applicationWindow?.message ?? "";
  const messageDraft = draftOrStored(message, stored);

  function saveWindow(open: boolean) {
    setWindow.mutate(
      { open, message: messageDraft.trim() ? messageDraft.trim() : null },
      {
        onSuccess: (data) => {
          successToast(i18next.t("curation-desk.applications.window-saved"));
          // Based on the line this tab was showing BEFORE the save, not on what
          // was saved: the cached window is still the pre-save one until the
          // refetch lands, and a draft based on the new text would read as stale
          // against it, put the old message back in the field, and send it with
          // the next toggle, undoing the save.
          setMessage({ value: data.window.message ?? "", basedOn: stored });
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
            placeholder={i18next.t("curation-desk.applications.message-placeholder")}
            value={messageDraft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setMessage({ value: clampTrimmed(e.target.value, MESSAGE_MAX), basedOn: stored })
            }
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
