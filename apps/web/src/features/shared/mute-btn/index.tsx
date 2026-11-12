import React, { useCallback, useMemo, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { FormControl, InputGroup } from "@ui/input";
import { Button } from "@ui/button";
import { Community, Entry, EntryStat } from "@/entities";
import i18next from "i18next";
import { useMutePost } from "@/api/mutations";
import { clone } from "remeda";
import { classNameObject } from "@ui/util";

interface Props {
  entry: Entry;
  community: Community;
  onlyDialog?: boolean;
  onSuccess: (entry: Entry, mute: boolean) => void;
  onCancel?: () => void;
}

/**
 * The entry as shown after a (un)mute: only `gray` changes. No vote count is
 * invented for a row without stats (a waves row counts with net_votes): the
 * count reads stats.total_votes first, so a made-up 0 would hide the real one.
 */
export function mutedEntry(entry: Entry, mute: boolean): Entry {
  const nStats = { ...clone(entry.stats ?? { flag_weight: 0, hide: false }), gray: mute } as EntryStat;
  return { ...clone(entry), stats: nStats };
}

export function MuteBtn({ entry, community, onSuccess, onCancel, onlyDialog }: Props) {
  const [value, setValue] = useState("");
  const [dialog, setDialog] = useState(false);

  const isMuted = useMemo(() => !!entry.stats?.gray, [entry]);
  const { mutateAsync: mutePost, isPending } = useMutePost(entry, community);

  const submit = useCallback(
    async (mute: boolean, notes: string) => {
      await mutePost({ notes, mute });
      onSuccess(mutedEntry(entry, mute), mute);
    },
    [entry, mutePost, onSuccess]
  );

  return (
    <>
      {isMuted && !onlyDialog && (
        <>
          <a
            href="#"
            className={classNameObject({
              "mute-btn": true,
              "in-progress": isPending
            })}
            onClick={(e) => {
              e.preventDefault();
              setDialog(false);
            }}
          >
            {i18next.t("mute-btn.unmute")}
          </a>
        </>
      )}
      {!isMuted && !onlyDialog && (
        <a
          href="#"
          className={classNameObject({
            "mute-btn": true,
            "in-progress": isPending
          })}
          onClick={(e) => {
            e.preventDefault();
            setDialog(true);
          }}
        >
          {i18next.t("mute-btn.mute")}
        </a>
      )}
      {(dialog || onlyDialog) && (
        <Modal
          show={true}
          centered={true}
          onHide={() => {
            onCancel?.();
            setDialog(false);
          }}
          className="mute-dialog"
          size="lg"
        >
          <ModalHeader closeButton={true} />
          <ModalBody>
            <div className="mute-form">
              <div className="mb-4">
                <div className="entry-title">
                  @{entry.author}/{entry.permlink}
                </div>
                <InputGroup>
                  <FormControl
                    type="text"
                    autoComplete="off"
                    autoFocus={true}
                    value={value}
                    placeholder={i18next.t("mute-btn.notes")}
                    onChange={(e) => setValue(e.target.value)}
                    maxLength={120}
                  />
                </InputGroup>
                <small>
                  {!isMuted && i18next.t("mute-btn.note-placeholder-mute")}
                  {isMuted && "unmute" && i18next.t("mute-btn.note-placeholder-unmute")}
                </small>
              </div>
              <div>
                <Button
                  disabled={value.trim().length === 0 || isPending}
                  onClick={() => {
                    setDialog(false);
                    submit(!isMuted, value);
                  }}
                >
                  {!isMuted && i18next.t("mute-btn.mute")}
                  {isMuted && "unmute" && i18next.t("mute-btn.unmute")}
                  {isPending && " ..."}
                </Button>
              </div>
            </div>
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
