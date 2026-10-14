"use client";

import { ChangeEvent, useState } from "react";
import i18next from "i18next";
import { FormControl } from "@ui/input";
import { UserAvatar } from "@/features/shared/user-avatar";
import { useMattermostUserSearch, type MattermostUser } from "../mattermost-api";
import { getUserDisplayName } from "../format-utils";

interface PeoplePickerProps {
  selected: MattermostUser[];
  onChange: (selected: MattermostUser[]) => void;
  /** Lowercased usernames never offered, such as the viewer or existing members. */
  exclude?: Set<string>;
  /** The most people that can be picked; unlimited when absent. */
  max?: number;
  enabled: boolean;
}

/** Chips for the people picked so far, and a username search to pick more. */
export function PeoplePicker({ selected, onChange, exclude, max, enabled }: PeoplePickerProps) {
  const [term, setTerm] = useState("");
  const search = useMattermostUserSearch(term, enabled);

  const selectedNames = new Set(selected.map((user) => user.username.toLowerCase()));
  const results = (search.data?.users ?? []).filter(
    (user) =>
      user.username &&
      !exclude?.has(user.username.toLowerCase()) &&
      !selectedNames.has(user.username.toLowerCase())
  );
  const atLimit = max !== undefined && selected.length >= max;

  const add = (user: MattermostUser) => {
    if (atLimit) return;
    onChange([...selected, user]);
    setTerm("");
  };

  const remove = (username: string) => onChange(selected.filter((user) => user.username !== username));

  return (
    <>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={i18next.t("chat.new-group-members")}>
          {selected.map((user) => (
            <span
              key={user.username}
              className="flex items-center gap-1 rounded-full border border-[--border-color] bg-[--background-color] py-0.5 pl-0.5 pr-2 text-xs"
            >
              <UserAvatar username={user.username} size="small" className="size-5" />
              <span>@{user.username}</span>
              <button
                type="button"
                className="ml-0.5 text-[--text-muted] hover:text-[--text-color]"
                onClick={() => remove(user.username)}
                aria-label={i18next.t("chat.new-group-remove", { username: user.username })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <FormControl
        type="text"
        placeholder={
          atLimit
            ? i18next.t("chat.new-group-full", { max })
            : i18next.t("chat.new-group-search")
        }
        value={term}
        disabled={atLimit}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setTerm(e.target.value)}
        autoFocus={true}
      />

      {term.trim().length >= 2 && !atLimit && (
        <div className="max-h-60 overflow-y-auto rounded border border-[--border-color]">
          {search.isFetching && !results.length ? (
            <div className="px-3 py-2 text-xs text-[--text-muted]">{i18next.t("chat.searching")}</div>
          ) : results.length ? (
            results.map((user) => (
              <button
                key={user.id || user.username}
                type="button"
                onClick={() => add(user)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[--background-color]"
              >
                <UserAvatar username={user.username} size="small" className="size-7" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {getUserDisplayName(user) || `@${user.username}`}
                  </span>
                  <span className="block truncate text-[11px] text-[--text-muted]">@{user.username}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-[--text-muted]">{i18next.t("chat.new-group-no-results")}</div>
          )}
        </div>
      )}
    </>
  );
}
