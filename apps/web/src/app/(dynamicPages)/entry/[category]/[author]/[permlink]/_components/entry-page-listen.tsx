"use client";

import { EcencyConfigManager } from "@/config";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { Entry } from "@/entities";
import { error, success } from "@/features/shared";
import { TextToSpeechSettingsDialog, useTts } from "@/features/text-to-speech";
import { Button } from "@/features/ui";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { Spinner } from "@ui/spinner";
import { Select } from "@ui/input/form-controls/select";
import { getAccessToken, ensureValidToken, getPurePostText, getPurePostTextForWordCount } from "@/utils";
import { getTranslation, getLanguages, type Language } from "@/api/translation";
import { useAiAssist } from "@ecency/sdk";
import { UilPause, UilPlay, UilSetting } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Props {
  entry: Entry;
}

const WORDS_PER_MINUTE = 225;

export function countWords(entry: string): number {
  const words = getPurePostTextForWordCount(entry)
    .trim()
    .split(/\s+/)
    .filter((word) => word);
  return words.length;
}

export function EntryPageListen({ entry }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const accessToken = username ? getAccessToken(username) : undefined;

  const text = useMemo(() => getPurePostText(entry.body), [entry]);
  const { speechRef, hasPaused, hasStarted } = useTts(text);

  const { mutateAsync: runAssist, isPending: isSummarizing } = useAiAssist(username, accessToken);

  // Pure derivations of entry.body, computed during SSR so the server HTML
  // carries the final values instead of "0" placeholders that flip after
  // hydration (#1662).
  const wordCount = useMemo(() => countWords(entry.body), [entry.body]);
  const readTime = useMemo(() => Math.ceil(wordCount / WORDS_PER_MINUTE), [wordCount]);
  const [summary, setSummary] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    if (!speechRef.current) {
      return;
    }
    if (hasPaused) {
      window.speechSynthesis.resume();
    } else if (hasStarted) {
      window.speechSynthesis.pause();
    } else {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(speechRef.current);
    }
  }, [hasPaused, hasStarted, speechRef]);

  const handleSummarize = useCallback(async () => {
    if (!username) return;

    try {
      const token = await ensureValidToken(username);
      if (!token) {
        error(i18next.t("ai-assist.error-auth"));
        return;
      }

      const res = await runAssist({
        action: "summarize",
        text: text.slice(0, 10000),
        code: token,
      });

      setSummary(res.output);
      success(i18next.t("ai-assist.success"));
    } catch (err: any) {
      const status = err?.status;
      if (status === 402) {
        error(i18next.t("ai-assist.error-insufficient-points"));
      } else if (status === 422) {
        error(i18next.t("ai-assist.error-content-policy"));
      } else if (status === 429) {
        error(i18next.t("ai-assist.error-rate-limit"));
      } else {
        error(i18next.t("ai-assist.error-generic"));
      }
    }
  }, [username, runAssist, text]);

  const [showTranslate, setShowTranslate] = useState(false);
  const [translatedSummary, setTranslatedSummary] = useState("");
  const [translating, setTranslating] = useState(false);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [targetLang, setTargetLang] = useState(i18next.language.split("-")[0]);

  useEffect(() => {
    if (showTranslate && languages.length === 0) {
      getLanguages().then(setLanguages);
    }
  }, [showTranslate, languages.length]);

  useEffect(() => {
    if (!showTranslate || !summary) return;
    let canceled = false;
    setTranslating(true);
    setTranslatedSummary("");
    getTranslation(summary, "auto", targetLang)
      .then((r) => {
        if (!canceled) setTranslatedSummary(r.translatedText);
      })
      .finally(() => {
        if (!canceled) setTranslating(false);
      });
    return () => { canceled = true; };
  }, [showTranslate, summary, targetLang]);

  const isAiAssistEnabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.aiAssist?.enabled ?? false
  );
  const showAiAssistColumn = !!(activeUser) && isAiAssistEnabled;

  return (
    <div className="flex flex-col gap-2">
      <div className={`border border-[--border-color] rounded-xl grid ${showAiAssistColumn ? "grid-cols-4" : "grid-cols-3"} items-center min-w-[275px]`}>
        <div className="border-r border-[--border-color] p-2">
          <div className="text-sm opacity-50">{i18next.t("entry.post-word-count")}</div>
          <div className="text-sm">{wordCount}</div>
        </div>
        <div className="border-r border-[--border-color] p-2">
          <div className="text-sm opacity-50">{i18next.t("entry.post-read-time")}</div>
          <div className="text-sm">
            {readTime} {i18next.t("entry.post-read-minutes")}
          </div>
        </div>

        <div className={`w-full gap-2 justify-between p-2 ${showAiAssistColumn ? "border-r border-[--border-color]" : ""}`}>
          <div className="flex justify-between items-center">
            <div className="text-sm opacity-50">{i18next.t("entry.listen")}</div>
            <TextToSpeechSettingsDialog>
              <Button
                appearance="gray-link"
                size="xs"
                icon={<UilSetting />}
                noPadding={true}
                className="!h-4"
                aria-label={i18next.t("entry.tts-settings")}
              />
            </TextToSpeechSettingsDialog>
          </div>
          <div
            className="text-blue-dark-sky hover:text-blue-dark-sky-hover text-sm cursor-pointer flex items-center gap-1"
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }}
          >
            {hasPaused || !hasStarted ? (
              <UilPlay className="size-3.5" />
            ) : (
              <UilPause className="size-3.5" />
            )}
            {hasPaused || !hasStarted ? i18next.t("g.play") : i18next.t("g.pause")}
          </div>
        </div>

        {showAiAssistColumn && (
            <div className="w-full p-2">
              <div className="text-sm opacity-50 flex items-center gap-1">
                <span className="text-[8px] font-bold leading-none bg-blue-dark-sky text-white rounded px-0.5 py-px">
                  AI
                </span>
                {i18next.t("ai-assist.action-summarize")}
              </div>
              {summary ? (
                <button
                  type="button"
                  className="text-sm text-blue-dark-sky cursor-pointer"
                  onClick={() => setSummary(null)}
                >
                  {i18next.t("ai-assist.try-again")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSummarizing || wordCount < 50}
                  className={`text-blue-dark-sky hover:text-blue-dark-sky-hover text-sm flex items-center gap-1 ${
                    isSummarizing || wordCount < 50 ? "opacity-50" : "cursor-pointer"
                  }`}
                  onClick={handleSummarize}
                >
                  {isSummarizing ? (
                    <>{i18next.t("ai-assist.submitting")}</>
                  ) : (
                    <>
                      <UilPlay className="size-3.5" />
                      {i18next.t("g.start")}
                    </>
                  )}
                </button>
              )}
            </div>
        )}
      </div>

      <Modal
        show={!!summary}
        centered={true}
        onHide={() => {
          setSummary(null);
          setShowTranslate(false);
          setTranslatedSummary("");
        }}
        size="lg"
      >
        <ModalHeader closeButton={true}>
          <ModalTitle>
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-bold leading-none bg-blue-dark-sky text-white rounded px-1 py-0.5">
                AI
              </span>
              {i18next.t("ai-assist.action-summarize")}
            </span>
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="text-sm whitespace-pre-wrap mb-4">
            {showTranslate && translatedSummary ? translatedSummary : summary}
            {showTranslate && translating && (
              <div className="flex justify-center py-2">
                <Spinner className="size-4" />
              </div>
            )}
          </div>
          <div className="border-t border-[--border-color] pt-3 flex items-center gap-3">
            <button
              type="button"
              className="text-sm text-blue-dark-sky hover:text-blue-dark-sky-hover"
              onClick={() => setShowTranslate(!showTranslate)}
            >
              {showTranslate
                ? i18next.t("ai-assist.hide-translation")
                : i18next.t("entry-menu.translate")}
            </button>
            {showTranslate && (
              <Select
                type="select"
                value={targetLang}
                size="sm"
                onChange={(e) => setTargetLang(e.currentTarget.value)}
                className="!w-auto"
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}
