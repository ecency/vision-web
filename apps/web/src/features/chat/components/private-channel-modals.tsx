"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import i18next from "i18next";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { UserAvatar } from "@/features/shared/user-avatar";
import {
  useMattermostCreatePrivateChannel,
  useMattermostManagePrivateChannel,
  useMattermostPrivateChannel,
  type MattermostUser
} from "../mattermost-api";
import { PeoplePicker } from "./people-picker";

// Matches the server limit, which follows Mattermost's display name limit.
export const PRIVATE_CHANNEL_NAME_MAX_LENGTH = 64;

function nameIsValid(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 0 && Array.from(trimmed).length <= PRIVATE_CHANNEL_NAME_MAX_LENGTH;
}

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="text-sm text-red-500" role="alert">
      {(error as Error).message}
    </div>
  );
}

interface NewPrivateChannelModalProps {
  show: boolean;
  onHide: () => void;
  currentUsername?: string;
  onCreated: (channelId: string) => void;
}

/** Chat admin only: names a private channel and picks its first members. */
export function NewPrivateChannelModal({
  show,
  onHide,
  currentUsername,
  onCreated
}: NewPrivateChannelModalProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<MattermostUser[]>([]);
  const create = useMattermostCreatePrivateChannel();

  useEffect(() => {
    if (!show) {
      setName("");
      setSelected([]);
      create.reset();
    }
    // Reset only when the dialog closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const exclude = useMemo(
    () => new Set(currentUsername ? [currentUsername.toLowerCase()] : []),
    [currentUsername]
  );
  const canCreate = nameIsValid(name) && !create.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    create.mutate(
      { name: name.trim(), usernames: selected.map((user) => user.username) },
      { onSuccess: ({ channelId }) => onCreated(channelId) }
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered size="md">
      <ModalHeader closeButton={true}>{i18next.t("chat.new-private-channel")}</ModalHeader>
      <ModalBody>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <p className="text-xs text-[--text-muted]">{i18next.t("chat.private-channel-hint")}</p>
          <FormControl
            type="text"
            aria-label={i18next.t("chat.private-channel-name")}
            placeholder={i18next.t("chat.private-channel-name")}
            value={name}
            maxLength={PRIVATE_CHANNEL_NAME_MAX_LENGTH}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />

          {show && (
            <PeoplePicker selected={selected} onChange={setSelected} exclude={exclude} enabled={show} />
          )}

          <ErrorText error={create.error} />

          <div className="flex justify-end gap-2">
            <Button appearance="secondary" type="button" onClick={onHide}>
              {i18next.t("g.cancel")}
            </Button>
            <Button type="submit" disabled={!canCreate}>
              {create.isPending
                ? i18next.t("chat.private-channel-creating")
                : i18next.t("chat.private-channel-create")}
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

interface ManagePrivateChannelModalProps {
  show: boolean;
  onHide: () => void;
  channelId: string;
}

/** Chat admin only: renames a private channel and adds or removes its members. */
export function ManagePrivateChannelModal({ show, onHide, channelId }: ManagePrivateChannelModalProps) {
  const details = useMattermostPrivateChannel(channelId, show);
  const manage = useMattermostManagePrivateChannel(channelId);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState<MattermostUser[]>([]);

  const savedName = details.data?.channel.display_name ?? "";
  useEffect(() => {
    if (show) setName(savedName);
  }, [show, savedName]);

  useEffect(() => {
    if (!show) {
      setAdding([]);
      manage.reset();
    }
    // Reset only when the dialog closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const members = details.data?.members ?? [];
  const memberNames = useMemo(
    () => new Set(members.map((member) => member.username.toLowerCase())),
    [members]
  );

  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!nameIsValid(name) || name.trim() === savedName || manage.isPending) return;
    manage.mutate({ kind: "rename", name: name.trim() });
  };

  const add = () => {
    if (!adding.length || manage.isPending) return;
    manage.mutate(
      { kind: "add", usernames: adding.map((user) => user.username) },
      { onSuccess: () => setAdding([]) }
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered size="md">
      <ModalHeader closeButton={true}>{i18next.t("chat.manage-private-channel")}</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-4">
          <form className="flex gap-2" onSubmit={rename}>
            <FormControl
              type="text"
              aria-label={i18next.t("chat.private-channel-name")}
              placeholder={i18next.t("chat.private-channel-name")}
              value={name}
              maxLength={PRIVATE_CHANNEL_NAME_MAX_LENGTH}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!nameIsValid(name) || name.trim() === savedName || manage.isPending}
            >
              {i18next.t("g.save")}
            </Button>
          </form>

          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold">{i18next.t("chat.private-channel-add")}</div>
            {show && (
              <PeoplePicker
                selected={adding}
                onChange={setAdding}
                exclude={memberNames}
                enabled={show}
              />
            )}
            <div className="flex justify-end">
              <Button type="button" size="sm" disabled={!adding.length || manage.isPending} onClick={add}>
                {i18next.t("chat.private-channel-add")}
              </Button>
            </div>
          </div>

          <ErrorText error={manage.error ?? details.error} />

          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">
              {i18next.t("chat.private-channel-members", { count: members.length })}
            </div>
            {details.isLoading ? (
              <div className="text-xs text-[--text-muted]">{i18next.t("chat.loading")}</div>
            ) : (
              <ul className="max-h-72 overflow-y-auto rounded border border-[--border-color]">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <UserAvatar username={member.username} size="small" className="size-6" />
                      <span className="truncate">@{member.username}</span>
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      appearance="secondary"
                      outline={true}
                      disabled={manage.isPending}
                      onClick={() => manage.mutate({ kind: "remove", username: member.username })}
                      aria-label={i18next.t("chat.new-group-remove", { username: member.username })}
                    >
                      {i18next.t("chat.private-channel-remove")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
