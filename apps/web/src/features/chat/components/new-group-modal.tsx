"use client";

import { ChangeEvent, useEffect, useState } from "react";
import i18next from "i18next";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { UserAvatar } from "@/features/shared/user-avatar";
import {
  useMattermostGroupChannel,
  useMattermostUserSearch,
  type MattermostUser
} from "../mattermost-api";
import { getUserDisplayName } from "../format-utils";
import { GROUP_MAX_OTHERS, GROUP_MIN_OTHERS } from "../group-utils";

interface NewGroupModalProps {
  show: boolean;
  onHide: () => void;
  currentUsername?: string;
  onCreated: (channelId: string) => void;
}

export function NewGroupModal({ show, onHide, currentUsername, onCreated }: NewGroupModalProps) {
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<MattermostUser[]>([]);
  const search = useMattermostUserSearch(term, show);
  const createGroup = useMattermostGroupChannel();

  useEffect(() => {
    if (!show) {
      setTerm("");
      setSelected([]);
      createGroup.reset();
    }
    // Reset only when the dialog closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const self = currentUsername?.toLowerCase();
  const selectedNames = new Set(selected.map((user) => user.username.toLowerCase()));
  const results = (search.data?.users ?? []).filter(
    (user) =>
      user.username &&
      user.username.toLowerCase() !== self &&
      !selectedNames.has(user.username.toLowerCase())
  );
  const atLimit = selected.length >= GROUP_MAX_OTHERS;
  const canCreate = selected.length >= GROUP_MIN_OTHERS && !createGroup.isPending;

  const add = (user: MattermostUser) => {
    if (atLimit) return;
    setSelected((current) => [...current, user]);
    setTerm("");
  };

  const remove = (username: string) =>
    setSelected((current) => current.filter((user) => user.username !== username));

  const create = () => {
    createGroup.mutate(
      selected.map((user) => user.username),
      { onSuccess: ({ channelId }) => onCreated(channelId) }
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered size="md">
      <ModalHeader closeButton={true}>{i18next.t("chat.new-group")}</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[--text-muted]">
            {i18next.t("chat.new-group-hint", { min: GROUP_MIN_OTHERS, max: GROUP_MAX_OTHERS })}
          </p>

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
                ? i18next.t("chat.new-group-full", { max: GROUP_MAX_OTHERS })
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

          {createGroup.error && (
            <div className="text-sm text-red-500" role="alert">
              {(createGroup.error as Error).message}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button appearance="secondary" type="button" onClick={onHide}>
              {i18next.t("g.cancel")}
            </Button>
            <Button type="button" disabled={!canCreate} onClick={create}>
              {createGroup.isPending ? i18next.t("chat.new-group-creating") : i18next.t("chat.new-group-create")}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
