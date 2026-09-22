"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import type { CurationRole, CurationRosterAdminEntry, CurationRosterRules } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { error as errorToast, success as successToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { dateToRelative } from "@/utils";
import { EcencyConfigManager } from "@/config";
import { Chip } from "./curation-chip";
import { CurationApplicationsPanel } from "./curation-applications-panel";
import { useCurationRosterAdmin, useCurationRosterRetire, useCurationRosterSet, useViewerRole } from "./hooks";

/**
 * The roster admin panel: the one place a curator is added, changed or retired.
 *
 * It writes to curation.curators, which erobot reads to build the lists that
 * used to live in its config.js. So a change here reaches the vote trail within
 * one roster refresh, with no deploy and no second copy to keep in step.
 */
const ROLES: CurationRole[] = ["admin", "mod", "curator", "trial"];
/** Hive vote weights: 100 = 1%. The backend takes 0..10000 and so does this form. */
const WEIGHT_RULES = ["min_weight", "max_weight", "waves_only_below"] as const;
type WeightRule = (typeof WEIGHT_RULES)[number];

interface DraftState {
  curator: string;
  role: CurationRole;
  note: string;
  trail: boolean;
  min_weight: string;
  max_weight: string;
  waves_only_below: string;
}

const EMPTY_DRAFT: DraftState = {
  curator: "",
  role: "curator",
  note: "",
  trail: true,
  min_weight: "",
  max_weight: "",
  waves_only_below: "",
};

/** The role default the backend applies when `rules.trail` is absent. */
function defaultTrail(role: CurationRole) {
  return role === "mod" || role === "curator";
}

function draftFrom(entry: CurationRosterAdminEntry): DraftState {
  const rules = (entry.rules ?? {}) as CurationRosterRules;
  return {
    curator: entry.username,
    role: entry.role,
    note: entry.note ?? "",
    // The resolved flag first, then the stored override, then the role default. Skipping
    // the middle step would let an older backend that omits `trail` turn an explicit
    // rules.trail = false back into the role default the moment someone saved the row.
    trail: entry.trail ?? rules.trail ?? defaultTrail(entry.role),
    min_weight: rules.min_weight ? String(rules.min_weight) : "",
    max_weight: rules.max_weight ? String(rules.max_weight) : "",
    waves_only_below: rules.waves_only_below ? String(rules.waves_only_below) : "",
  };
}

/**
 * The rules object the row should carry. `trail` is written only when it differs
 * from the role default, so a row says what is unusual about it rather than
 * restating the default and freezing today's default into the data.
 */
function rulesFrom(draft: DraftState): CurationRosterRules | undefined {
  const rules: CurationRosterRules = {};
  for (const key of WEIGHT_RULES) {
    const raw = draft[key].trim();
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isInteger(value) && value > 0) rules[key] = value;
  }
  if (draft.trail !== defaultTrail(draft.role)) rules.trail = draft.trail;
  return Object.keys(rules).length ? rules : undefined;
}

/**
 * Hive account names: dot-separated labels, each at least 3 characters, starting with a
 * letter, ending alphanumeric, hyphens only inside. The flat class this used to carry
 * accepted `1abc`, `abc.`, `-abc` and `abc.-def`, which the gateway then refused with a
 * bare 400, so the admin saw a server error rather than which character was wrong.
 */
const HIVE_LABEL = /^[a-z][a-z0-9-]{1,}[a-z0-9]$/;

function isHiveName(name: string) {
  if (name.length < 3 || name.length > 16) return false;
  return name.split(".").every((label) => label.length >= 3 && HIVE_LABEL.test(label));
}

function validate(draft: DraftState): string | null {
  if (!isHiveName(draft.curator.trim())) {
    return i18next.t("curation-desk.roster.invalid-name");
  }
  for (const key of WEIGHT_RULES) {
    const raw = draft[key].trim();
    if (!raw) continue;
    const value = Number(raw);
    // Blank means "no rule", so 0 has no separate meaning to carry: as a min or a waves
    // threshold it is what absent already says, and as a max it is a second spelling of
    // untrailed, which the trail switch owns. Refusing it here is what keeps the form,
    // the summary and the serializer from disagreeing about a value one of them drops.
    if (!Number.isInteger(value) || value < 1 || value > 10000) {
      return i18next.t("curation-desk.roster.invalid-weight");
    }
  }
  const min = Number(draft.min_weight.trim() || 0);
  const max = Number(draft.max_weight.trim() || 0);
  if (min && max && min > max) return i18next.t("curation-desk.roster.invalid-window");
  if (draft.note.length > 200) return i18next.t("curation-desk.roster.note-too-long");
  return null;
}

function RuleSummary({ entry }: { entry: CurationRosterAdminEntry }) {
  const rules = (entry.rules ?? {}) as CurationRosterRules;
  const parts = WEIGHT_RULES.filter((key) => rules[key]).map((key) =>
    i18next.t(`curation-desk.roster.rule-${key.replace(/_/g, "-")}`, {
      percent: ((rules[key] as number) / 100).toFixed(2).replace(/\.?0+$/, ""),
    })
  );
  if (!parts.length) return null;
  return <span className="text-xs text-gray-600 dark:text-gray-400">{parts.join(" · ")}</span>;
}

/**
 * add: a new curator, name editable. edit: an existing row. restore: a retired row coming
 * back. The last two MUST keep the name they were opened with, or the write lands on a
 * different account and leaves the one the admin picked exactly as it was.
 */
type FormMode = "add" | "edit" | "restore";

function CuratorForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  busy,
  mode,
}: {
  draft: DraftState;
  setDraft: (next: DraftState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  mode: FormMode;
}) {
  const isNew = mode === "add";
  return (
    <form
      className="mt-3 grid gap-3 rounded-lg border border-[--border-color] p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {i18next.t("curation-desk.roster.username")}
        <FormControl
          type="text"
          value={draft.curator}
          disabled={!isNew}
          autoFocus={isNew}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            // The guard is here, not only on the disabled attribute: edit and restore
            // write to the name they were opened with, and a name that could still change
            // would send the write to a different account.
            if (!isNew) return;
            setDraft({ ...draft, curator: e.target.value.trim().toLowerCase() });
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {i18next.t("curation-desk.roster.role")}
        <FormControl
          type="select"
          value={draft.role}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            const role = e.target.value as CurationRole;
            // The trail switch follows the new role's default unless it was
            // already moved away from the old one.
            const moved = draft.trail !== defaultTrail(draft.role);
            setDraft({ ...draft, role, trail: moved ? draft.trail : defaultTrail(role) });
          }}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {i18next.t(`curation-desk.roster.role-${role}`)}
            </option>
          ))}
        </FormControl>
      </label>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.trail}
          onChange={(e) => setDraft({ ...draft, trail: e.target.checked })}
        />
        <span>
          {i18next.t("curation-desk.roster.trail")}
          <span className="ml-2 text-xs text-gray-500">
            {i18next.t("curation-desk.roster.trail-hint")}
          </span>
        </span>
      </label>

      {WEIGHT_RULES.map((key) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          {i18next.t(`curation-desk.roster.label-${key.replace(/_/g, "-")}`)}
          <FormControl
            type="number"
            min={0}
            max={10000}
            placeholder={i18next.t("curation-desk.roster.weight-placeholder")}
            value={draft[key as WeightRule]}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDraft({ ...draft, [key]: e.target.value })
            }
          />
        </label>
      ))}

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        {i18next.t("curation-desk.roster.note")}
        <FormControl
          type="text"
          maxLength={200}
          value={draft.note}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, note: e.target.value })}
        />
      </label>

      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>
          {mode === "add"
            ? i18next.t("curation-desk.roster.add")
            : mode === "restore"
              ? i18next.t("curation-desk.roster.bring-back")
              : i18next.t("curation-desk.roster.save")}
        </Button>
        <Button type="button" size="sm" appearance="gray-link" onClick={onCancel} disabled={busy}>
          {i18next.t("g.cancel")}
        </Button>
      </div>
    </form>
  );
}

export function CurationRosterView() {
  const { role, isLoading: roleLoading } = useViewerRole();
  const isAdmin = role === "admin";
  const applicationsEnabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.applications.enabled
  );
  const { data, isLoading, isError } = useCurationRosterAdmin(isAdmin);
  const setCurator = useCurationRosterSet();
  const retireCurator = useCurationRosterRetire();
  // `editing` names the row whose inline form is open; `topForm` is the one at the top,
  // which is either a new curator or a retired one coming back. Two pieces of state
  // rather than a sentinel in `editing`, because "new" is a legal Hive account name.
  const [editing, setEditing] = useState<string | null>(null);
  const [topForm, setTopForm] = useState<FormMode | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [confirming, setConfirming] = useState<string | null>(null);

  const { active, retired } = useMemo(() => {
    const rows = data?.curators ?? [];
    return {
      active: rows.filter((row) => !row.removed_at),
      retired: rows.filter((row) => row.removed_at),
    };
  }, [data]);

  const busy = setCurator.isPending || retireCurator.isPending;

  function submit() {
    const problem = validate(draft);
    if (problem) {
      errorToast(problem);
      return;
    }
    setCurator.mutate(
      {
        curator: draft.curator.trim(),
        role: draft.role,
        rules: rulesFrom(draft),
        note: draft.note.trim(),
      },
      {
        onSuccess: () => {
          successToast(i18next.t("curation-desk.roster.saved", { name: draft.curator.trim() }));
          setEditing(null);
          setTopForm(null);
          setDraft(EMPTY_DRAFT);
        },
        onError: (e) => errorToast(...formatError(e)),
      }
    );
  }

  function retire(name: string) {
    retireCurator.mutate(name, {
      onSuccess: () => {
        successToast(i18next.t("curation-desk.roster.retired", { name }));
        setConfirming(null);
      },
      onError: (e) => errorToast(...formatError(e)),
    });
  }

  if (roleLoading) return <p className="p-4 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>;
  if (!isAdmin)
    return (
      <p className="p-6 text-center text-sm text-gray-500">{i18next.t("curation-desk.roster.admins-only")}</p>
    );

  return (
    <div className="p-2">
      {applicationsEnabled && <CurationApplicationsPanel enabled={isAdmin} />}

      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{i18next.t("curation-desk.roster.intro")}</p>

      {topForm ? (
        <CuratorForm
          draft={draft}
          setDraft={setDraft}
          onSubmit={submit}
          onCancel={() => {
            setTopForm(null);
            setDraft(EMPTY_DRAFT);
          }}
          busy={busy}
          mode={topForm}
        />
      ) : (
        <Button
          className="mt-3"
          size="sm"
          disabled={busy}
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setTopForm("add");
          }}
        >
          {i18next.t("curation-desk.roster.add")}
        </Button>
      )}

      {isLoading && <p className="p-4 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>}
      {isError && (
        <p className="p-4 text-sm text-red-030 dark:text-red-light-020" role="alert">
          {i18next.t("curation-desk.list.error")}
        </p>
      )}

      <ul className="mt-4 divide-y divide-[--border-color]">
        {active.map((entry) => (
          <li key={entry.username} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">@{entry.username}</span>
              <Chip>{i18next.t(`curation-desk.roster.role-${entry.role}`)}</Chip>
              {(entry.trail ?? defaultTrail(entry.role)) ? (
                <Chip>{i18next.t("curation-desk.roster.trailed")}</Chip>
              ) : (
                <span className="text-xs text-gray-500">{i18next.t("curation-desk.roster.not-trailed")}</span>
              )}
              <RuleSummary entry={entry} />
              <span className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  appearance="gray-link"
                  disabled={busy}
                  onClick={() => {
                    setDraft(draftFrom(entry));
                    setEditing(entry.username);
                  }}
                >
                  {i18next.t("g.edit")}
                </Button>
                {confirming === entry.username ? (
                  <>
                    <Button size="sm" appearance="danger" disabled={busy} onClick={() => retire(entry.username)}>
                      {i18next.t("curation-desk.roster.confirm-retire")}
                    </Button>
                    <Button size="sm" appearance="gray-link" disabled={busy} onClick={() => setConfirming(null)}>
                      {i18next.t("g.cancel")}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    appearance="gray-link"
                    disabled={busy}
                    onClick={() => setConfirming(entry.username)}
                  >
                    {i18next.t("curation-desk.roster.retire")}
                  </Button>
                )}
              </span>
            </div>
            {entry.note && <p className="mt-1 text-xs text-gray-500">{entry.note}</p>}
            {entry.added_by && entry.added_at && (
              <p className="mt-1 text-[11px] text-gray-400">
                {i18next.t("curation-desk.roster.added-by", {
                  name: entry.added_by,
                  when: dateToRelative(entry.added_at),
                })}
              </p>
            )}
            {editing === entry.username && (
              <CuratorForm
                draft={draft}
                setDraft={setDraft}
                onSubmit={submit}
                onCancel={() => setEditing(null)}
                busy={busy}
                mode="edit"
              />
            )}
          </li>
        ))}
      </ul>

      {retired.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            {i18next.t("curation-desk.roster.retired-heading")}
          </h2>
          <ul className="mt-2 divide-y divide-[--border-color]">
            {retired.map((entry) => (
              <li key={entry.username} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className={clsx("text-gray-500")}>@{entry.username}</span>
                <span className="text-xs text-gray-400">
                  {i18next.t("curation-desk.roster.retired-at", {
                    when: dateToRelative(entry.removed_at as string),
                  })}
                </span>
                <Button
                  className="ml-auto"
                  size="sm"
                  appearance="gray-link"
                  disabled={busy}
                  onClick={() => {
                    setDraft(draftFrom(entry));
                    setTopForm("restore");
                  }}
                >
                  {i18next.t("curation-desk.roster.bring-back")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
