"use client";

import { useEffect, useMemo, useState } from "react";
import i18next from "i18next";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { Button } from "@ui/button";
import { useMattermostGroupChannel, type MattermostUser } from "../mattermost-api";
import { GROUP_MAX_OTHERS, GROUP_MIN_OTHERS } from "../group-utils";
import { PeoplePicker } from "./people-picker";

interface NewGroupModalProps {
  show: boolean;
  onHide: () => void;
  currentUsername?: string;
  onCreated: (channelId: string) => void;
}

export function NewGroupModal({ show, onHide, currentUsername, onCreated }: NewGroupModalProps) {
  const [selected, setSelected] = useState<MattermostUser[]>([]);
  const createGroup = useMattermostGroupChannel();

  useEffect(() => {
    if (!show) {
      setSelected([]);
      createGroup.reset();
    }
    // Reset only when the dialog closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const exclude = useMemo(
    () => new Set(currentUsername ? [currentUsername.toLowerCase()] : []),
    [currentUsername]
  );
  const canCreate = selected.length >= GROUP_MIN_OTHERS && !createGroup.isPending;

  const create = () => {
    createGroup.mutate(
      selected.map((user) => user.username),
      { onSuccess: ({ channelId }) => onCreated(channelId) }
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered size="md" dialogClassName="!mt-0 flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden">
      <ModalHeader closeButton={true} className="shrink-0">{i18next.t("chat.new-group")}</ModalHeader>
      <ModalBody className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[--text-muted]">
            {i18next.t("chat.new-group-hint", { min: GROUP_MIN_OTHERS, max: GROUP_MAX_OTHERS })}
          </p>

          {show && (
            <PeoplePicker
              selected={selected}
              onChange={setSelected}
              exclude={exclude}
              max={GROUP_MAX_OTHERS}
              enabled={show}
            />
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
            <Button type="button" disabled={!canCreate} onClick={create} className="disabled:!opacity-75">
              {createGroup.isPending ? i18next.t("chat.new-group-creating") : i18next.t("chat.new-group-create")}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
