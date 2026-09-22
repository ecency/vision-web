"use client";

import { useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { useQuery } from "@tanstack/react-query";
import {
  getAccountFullQueryOptions,
  type CurationApplicationQueueEntry,
  type CurationApplicationVote,
  type CurationApplicationVoteValue,
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
  useCurationApplicationVote,
  useCurationApplicationWindow,
  useCurationApplications
} from "./hooks";

/**
 * The review side of guest curator applications. It used to sit inside the roster
 * tab, which is admin-only; the people who vote on applications are the mods, so
 * it has a tab of its own and the window controls stay behind the admin check.
 */

/** The caps the desk enforces, counted in code points on both sides. */
const NOTE_MAX = 500;
const MESSAGE_MAX = 200;

/** What the desk will take. Out of range is refused at the gateway, not clamped. */
const QUORUM_MAX = 50;
const TERM_DAYS_MAX = 365;

/**
 * A whole number the desk would accept. `Number("")` is 0 and `Number(" ")` is 0 too,
 * so an empty field would otherwise read as a valid quorum of zero on its way to a
 * button that looked enabled.
 */
function inRange(value: string, max: number): boolean {
  const n = Number(value);
  return value.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= max;
}

/** A number being edited, and the stored number it was typed against. */
type NumberDraft = { value: string; basedOn: number } | null;

/**
 * What to show in a number field: the draft while the stored value is still the one it
 * was typed against, and otherwise what is stored. Holding the text alone made this
 * tab's copy win for ever, so another admin's change arrived on a refetch, was hidden,
 * and was then sent back over their save.
 */
export function numberShown(draft: NumberDraft, stored: number | undefined): string {
  if (stored === undefined) return "";
  return draft && draft.basedOn === stored ? draft.value : String(stored);
}

/**
 * The knobs whose value actually differs from what the desk holds. Absent means "leave
 * it alone" upstream, so an unchanged knob must not travel at all.
 */
export function changedKnobs(
  quorum: string,
  termDays: string,
  stored: { quorum: number; term_days: number } | undefined
): { quorum?: number; term_days?: number } {
  if (!stored) return {};
  const out: { quorum?: number; term_days?: number } = {};
  if (Number(quorum) !== stored.quorum) out.quorum = Number(quorum);
  if (Number(termDays) !== stored.term_days) out.term_days = Number(termDays);
  return out;
}

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

/**
 * The seats an acceptance may grant. Admin is not one: that is a roster edit. Nor is
 * trial: a guest seat is trailed and bounded by its term, and an untrailed month would
 * be a month of work nothing follows.
 */
const SEATS: Extract<CurationRole, "curator" | "mod">[] = ["curator", "mod"];

/** The three things a reviewer can say. Abstaining is how an objection is lifted. */
const VOTES: CurationApplicationVoteValue[] = ["endorse", "object", "abstain"];

/**
 * Where an application stands with the bench. Only votes from people still on it
 * count, so a line from somebody since retired is shown struck through rather than
 * dropped: a total one short with no explanation reads as a bug.
 */
function VoteTally({
  votes,
  endorsed,
  quorum
}: {
  votes: CurationApplicationVote[];
  endorsed: number;
  quorum: number;
}) {
  const objections = votes.filter((v) => v.standing && v.vote === "object");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Chip tone={endorsed >= quorum ? "green" : undefined}>
        {i18next.t("curation-desk.applications.endorsements", { count: endorsed, quorum })}
      </Chip>
      {objections.length > 0 && (
        <Chip tone="amber">
          {i18next.t("curation-desk.applications.objections", { count: objections.length })}
        </Chip>
      )}
      {votes
        .filter((v) => v.vote !== "abstain")
        .map((v) => (
          <span
            key={v.voter}
            className={clsx(
              "text-xs",
              !v.standing && "line-through opacity-60",
              v.vote === "object"
                ? "text-warning-ink dark:text-warning-default"
                : "text-gray-600 dark:text-gray-400"
            )}
            title={
              v.standing
                ? (v.note ?? undefined)
                : i18next.t("curation-desk.applications.vote-not-counted")
            }
          >
            {v.vote === "object" ? "-" : "+"}@{v.voter}
          </span>
        ))}
    </div>
  );
}

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
  quorum,
  isAdmin,
  onDecide,
  onVote
}: {
  entry: CurationApplicationQueueEntry;
  busy: boolean;
  quorum: number;
  isAdmin: boolean;
  onDecide: (
    state: "shortlisted" | "accepted" | "declined",
    role: CurationRole,
    note: string
  ) => void;
  onVote: (vote: CurationApplicationVoteValue, note: string) => void;
}) {
  const [role, setRole] = useState<Extract<CurationRole, "curator" | "mod">>("curator");
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
        {/* The seat only matters to an acceptance, and only an admin can make one.
            The note travels with whatever this reviewer does next: a vote or, for an
            admin, a decision. */}
        {isAdmin && (
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
        )}
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

      <VoteTally votes={entry.votes} endorsed={entry.tally.endorsed} quorum={quorum} />

      {/* Everyone on the bench votes. Reaching the quorum with no objection standing
          grants the seat by itself, so these buttons are the ordinary path and the
          admin row below is the exception. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {VOTES.map((vote) => (
          <Button
            key={vote}
            size="sm"
            appearance={entry.my_vote === vote ? undefined : "gray"}
            disabled={busy || (vote === "abstain" && !entry.my_vote)}
            onClick={() => onVote(vote, note)}
          >
            {i18next.t(`curation-desk.applications.vote-${vote}`)}
          </Button>
        ))}
        {entry.my_vote && (
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {i18next.t("curation-desk.applications.your-vote", {
              vote: i18next.t(`curation-desk.applications.vote-${entry.my_vote}`)
            })}
          </span>
        )}
      </div>

      {isAdmin && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[--border-color] pt-3">
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
      )}
    </li>
  );
}

export function CurationApplicationsPanel({
  enabled,
  isAdmin
}: {
  enabled: boolean;
  isAdmin: boolean;
}) {
  const { data, isLoading, isError } = useCurationApplications(enabled);
  const decide = useCurationApplicationDecide();
  const vote = useCurationApplicationVote();
  const setWindow = useCurationApplicationWindow();
  // The draft remembers which stored line it was typed against. Holding the text
  // alone made this tab's copy win for ever: another admin's change arrived on a
  // refetch and was ignored, then overwritten by the next save from here.
  const [message, setMessage] = useState<{ value: string; basedOn: string } | null>(null);
  // Held as strings so a field can be empty while it is being retyped, and against the
  // stored number they were typed against, for the same reason the message is: a draft
  // that outlives the value it was based on hides another admin's change and then sends
  // the old number back over it.
  const [quorumDraft, setQuorum] = useState<NumberDraft>(null);
  const [termDraft, setTerm] = useState<NumberDraft>(null);

  const applications = data?.applications ?? [];
  const applicationWindow = data?.window;
  const busy = decide.isPending || setWindow.isPending || vote.isPending;
  const stored = applicationWindow?.message ?? "";
  const messageDraft = draftOrStored(message, stored);
  // Until the queue has answered, the quorum is unknown. Showing the default would
  // put a number on the screen that the desk might not be running on.
  const quorum = data?.quorum ?? 0;
  const quorumShown = numberShown(quorumDraft, data?.quorum);
  const termShown = numberShown(termDraft, data?.term_days);
  const knobsChanged =
    !!data &&
    inRange(quorumShown, QUORUM_MAX) &&
    inRange(termShown, TERM_DAYS_MAX) &&
    (Number(quorumShown) !== data.quorum || Number(termShown) !== data.term_days);

  function onVote(entry: CurationApplicationQueueEntry, value: CurationApplicationVoteValue, note: string) {
    vote.mutate(
      { applicant: entry.username, vote: value, note: note.trim() || undefined },
      {
        onSuccess: (result) =>
          successToast(
            result.elected
              ? i18next.t("curation-desk.applications.elected-toast", { name: entry.username })
              : i18next.t("curation-desk.applications.voted-toast", {
                  name: entry.username,
                  endorsed: result.tally.endorsed,
                  quorum: result.quorum
                })
          ),
        onError: (e) => errorToast(...formatError(e))
      }
    );
  }

  /**
   * One row holds the window, the line and the two numbers, and this screen has a button
   * for each. Every save therefore sends ONLY the field its button is about: upstream
   * reads an absent field as "leave it", so anything else sent along would go back over
   * whatever another admin had changed since this tab last read, while looking like it
   * had touched nothing.
   */
  function saveWindow(about: "open" | "message" | "knobs", open?: boolean) {
    setWindow.mutate(
      {
        // `open` travels only from the switch. Sent along with a message or a number it
        // would carry whatever this tab last read, which can undo another admin's close
        // and put applications back in front of readers who act on it.
        ...(about === "open" ? { open } : {}),
        ...(about === "message"
          ? { message: messageDraft.trim() ? messageDraft.trim() : null }
          : {}),
        ...(about === "knobs" ? changedKnobs(quorumShown, termShown, data) : {})
      },
      {
        onSuccess: (data) => {
          successToast(i18next.t("curation-desk.applications.window-saved"));
          if (about === "message") {
            // Based on the line this tab was showing BEFORE the save, not on what
            // was saved: the cached window is still the pre-save one until the
            // refetch lands, and a draft based on the new text would read as stale
            // against it, put the old message back in the field, and send it with
            // the next toggle, undoing the save.
            setMessage({ value: data.window.message ?? "", basedOn: stored });
          }
          // Dropped rather than pinned to what came back: setQueriesData has already put
          // the saved numbers in every cached queue, so the fields read them from there.
          // Pinning them here is what made a draft outlive its basis.
          setQuorum(null);
          setTerm(null);
        },
        onError: (e) => errorToast(...formatError(e))
      }
    );
  }

  function onDecide(
    entry: CurationApplicationQueueEntry,
    state: "shortlisted" | "accepted" | "declined",
    role: CurationRole,
    note: string
  ) {
    decide.mutate(
      {
        applicant: entry.username,
        state,
        // The seat only travels with an acceptance; upstream refuses it elsewhere.
        role: state === "accepted" ? (role as "curator" | "mod") : undefined,
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

      {/* The window and the election's own numbers are an admin's to set. A mod reads
          the queue and votes on it; opening a round is not part of that. */}
      {isAdmin && (
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          {i18next.t("curation-desk.applications.message-label")}
          <FormControl
            type="text"
            // Closed while its own save is in flight: the success handler replaces
            // this field's state with what was sent, so anything typed in the gap
            // would be dropped without a trace. A decide is not its business, so
            // `busy` would be too wide a guard here.
            disabled={setWindow.isPending}
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
            onClick={() => saveWindow("message")}
          >
            {i18next.t("curation-desk.applications.message-save")}
          </Button>
          <Button
            size="sm"
            appearance={applicationWindow?.open ? "gray" : undefined}
            // Until the window is known the button cannot say which way it flips,
            // and a click would send `open: true` at a desk that is closed.
            disabled={busy || !applicationWindow}
            onClick={() => saveWindow("open", !applicationWindow?.open)}
          >
            {applicationWindow?.open
              ? i18next.t("curation-desk.applications.close-action")
              : i18next.t("curation-desk.applications.open-action")}
          </Button>
        </div>
        {/* Both are left OUT of the save unless they changed: upstream reads an absent
            knob as "leave it alone", and this form is saved every time the message is
            reworded. Sending the shown value back would look harmless and would quietly
            re-set a number another admin had just changed. */}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <label className="flex flex-col gap-1 text-sm">
            {i18next.t("curation-desk.applications.quorum-label")}
            <FormControl
              type="number"
              min={1}
              max={QUORUM_MAX}
              disabled={setWindow.isPending || !data}
              value={quorumShown}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                data && setQuorum({ value: e.target.value, basedOn: data.quorum })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {i18next.t("curation-desk.applications.term-label")}
            <FormControl
              type="number"
              min={1}
              max={TERM_DAYS_MAX}
              disabled={setWindow.isPending || !data}
              value={termShown}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                data && setTerm({ value: e.target.value, basedOn: data.term_days })
              }
            />
          </label>
          <Button
            size="sm"
            appearance="gray"
            disabled={busy || !data || !knobsChanged}
            onClick={() => saveWindow("knobs")}
          >
            {i18next.t("curation-desk.applications.knobs-save")}
          </Button>
        </div>
      </div>
      )}

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
            quorum={quorum}
            isAdmin={isAdmin}
            onDecide={(state, role, note) => onDecide(entry, state, role, note)}
            onVote={(value, note) => onVote(entry, value, note)}
          />
        ))}
      </ul>
    </section>
  );
}
