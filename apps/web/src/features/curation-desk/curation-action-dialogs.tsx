"use client";

import React, { useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { CURATION_FLAG_REASONS, type CurationFlagReason } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle } from "@ui/modal";
import { SNOOZE_PRESETS, type SnoozePreset } from "./consts";

/** ISO instant for a snooze preset: N hours from now, or tomorrow 09:00 UTC. */
export function snoozeUntil(preset: SnoozePreset, now = Date.now()): string {
  if (preset === "tomorrow") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(9, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(now + preset * 3_600_000).toISOString();
}

interface SnoozeProps {
  title: string;
  onPick: (until: string, preset: SnoozePreset) => void;
  onHide: () => void;
}

export function SnoozeDialog({ title, onPick, onHide }: SnoozeProps) {
  return (
    <Modal show onHide={onHide} centered size="sm">
      <ModalHeader closeButton>
        <ModalTitle>{i18next.t("curation-desk.snooze.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{title}</p>
        <div className="grid grid-cols-2 gap-2">
          {SNOOZE_PRESETS.map((preset) => (
            <Button
              key={String(preset)}
              appearance="gray-link"
              outline
              aria-label={i18next.t(`curation-desk.snooze.preset-${preset}`)}
              onClick={() => onPick(snoozeUntil(preset), preset)}
            >
              {i18next.t(`curation-desk.snooze.preset-${preset}`)}
            </Button>
          ))}
        </div>
      </ModalBody>
    </Modal>
  );
}

interface FlagProps {
  title: string;
  onPick: (reason: CurationFlagReason, note: string) => void;
  onHide: () => void;
}

export function FlagDialog({ title, onPick, onHide }: FlagProps) {
  const [reason, setReason] = useState<CurationFlagReason>("plagiarism");
  const [note, setNote] = useState("");
  return (
    <Modal show onHide={onHide} centered size="sm">
      <ModalHeader closeButton>
        <ModalTitle>{i18next.t("curation-desk.flag.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{title}</p>
        <div role="radiogroup" aria-label={i18next.t("curation-desk.flag.reason-label")} className="grid grid-cols-2 gap-2">
          {CURATION_FLAG_REASONS.map((value) => (
            <label
              key={value}
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer text-sm",
                reason === value ? "border-red-400 bg-red-50 dark:bg-red-900/20" : "border-[--border-color]"
              )}
            >
              <input type="radio" name="curation-flag-reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
              {i18next.t(`curation-desk.flag-reasons.${value}`)}
            </label>
          ))}
        </div>
        <FormControl
          type="textarea"
          className="mt-3"
          rows={3}
          maxLength={500}
          value={note}
          placeholder={i18next.t("curation-desk.flag.note-placeholder")}
          aria-label={i18next.t("curation-desk.flag.note-placeholder")}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-2">{i18next.t("curation-desk.flag.hint")}</p>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button appearance="gray-link" onClick={onHide} aria-label={i18next.t("g.cancel")}>
          {i18next.t("g.cancel")}
        </Button>
        <Button appearance="danger" onClick={() => onPick(reason, note.trim())} aria-label={i18next.t("curation-desk.flag.confirm")}>
          {i18next.t("curation-desk.flag.confirm")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

interface NoteProps {
  title: string;
  initial?: string;
  onSave: (note: string) => void;
  onHide: () => void;
}

export function NoteDialog({ title, initial = "", onSave, onHide }: NoteProps) {
  const [note, setNote] = useState(initial);
  return (
    <Modal show onHide={onHide} centered size="sm">
      <ModalHeader closeButton>
        <ModalTitle>{i18next.t("curation-desk.note.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{title}</p>
        <FormControl
          type="textarea"
          rows={4}
          maxLength={500}
          autoFocus
          value={note}
          placeholder={i18next.t("curation-desk.note.placeholder")}
          aria-label={i18next.t("curation-desk.note.placeholder")}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-2">{i18next.t("curation-desk.note.hint")}</p>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button appearance="gray-link" onClick={onHide} aria-label={i18next.t("g.cancel")}>
          {i18next.t("g.cancel")}
        </Button>
        <Button disabled={!note.trim()} onClick={() => onSave(note.trim())} aria-label={i18next.t("curation-desk.note.save")}>
          {i18next.t("curation-desk.note.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ["j / k", "next-prev"],
  ["Enter / o", "quick-view"],
  ["v", "vote"],
  ["r", "reviewed"],
  ["Shift+R", "reviewed-up-to-here"],
  ["s / →", "skip"],
  ["z", "snooze"],
  ["f", "flag"],
  ["n", "note"],
  ["x", "recommend"],
  ["Shift+O", "open"],
  ["?", "help"],
];

export function ShortcutSheet({ onHide }: { onHide: () => void }) {
  return (
    <Modal show onHide={onHide} centered size="sm">
      <ModalHeader closeButton>
        <ModalTitle>{i18next.t("curation-desk.shortcuts.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([keys, name]) => (
            <React.Fragment key={name}>
              <dt>
                <kbd className="rounded border border-[--border-color] bg-gray-100 dark:bg-dark-default px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
              </dt>
              <dd className="text-gray-700 dark:text-gray-300">{i18next.t(`curation-desk.shortcuts.${name}`)}</dd>
            </React.Fragment>
          ))}
        </dl>
      </ModalBody>
    </Modal>
  );
}
