"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import i18next from "i18next";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { useMattermostRenameGroup } from "../mattermost-api";
import { GROUP_NAME_MAX_LENGTH, groupNameLength } from "../group-utils";

function renameErrorText(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "not_owner") return i18next.t("chat.rename-group-not-owner");
  if (code === "too_long") return i18next.t("chat.rename-group-too-long", { max: GROUP_NAME_MAX_LENGTH });
  return i18next.t("chat.rename-group-failed");
}

interface RenameGroupModalProps {
  show: boolean;
  onHide: () => void;
  channelId: string;
  currentName?: string;
}

export function RenameGroupModal({ show, onHide, channelId, currentName }: RenameGroupModalProps) {
  const [name, setName] = useState(currentName ?? "");
  const rename = useMattermostRenameGroup();

  useEffect(() => {
    if (show) {
      setName(currentName ?? "");
      rename.reset();
    }
    // Start from the saved name when the dialog opens, or when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, currentName]);

  const trimmed = name.trim();
  const unchanged = trimmed === (currentName ?? "").trim();
  // Counted as the server counts, so an emoji is one character.
  const tooLong = groupNameLength(trimmed) > GROUP_NAME_MAX_LENGTH;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (unchanged || tooLong || rename.isPending) return;
    rename.mutate({ channelId, name: trimmed }, { onSuccess: onHide });
  };

  return (
    <Modal show={show} onHide={onHide} centered size="sm">
      <ModalHeader closeButton={true}>{i18next.t("chat.rename-group")}</ModalHeader>
      <ModalBody>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <p className="text-xs text-[--text-muted]">{i18next.t("chat.rename-group-hint")}</p>
          <FormControl
            type="text"
            aria-label={i18next.t("chat.group-name")}
            placeholder={i18next.t("chat.group-name")}
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            autoFocus={true}
          />

          {tooLong && (
            <div className="text-sm text-red-500" role="alert">
              {i18next.t("chat.rename-group-too-long", { max: GROUP_NAME_MAX_LENGTH })}
            </div>
          )}

          {rename.error && !tooLong && (
            <div className="text-sm text-red-500" role="alert">
              {renameErrorText(rename.error)}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button appearance="secondary" type="button" onClick={onHide}>
              {i18next.t("g.cancel")}
            </Button>
            <Button type="submit" disabled={unchanged || tooLong || rename.isPending}>
              {rename.isPending ? i18next.t("chat.rename-group-saving") : i18next.t("g.save")}
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}
