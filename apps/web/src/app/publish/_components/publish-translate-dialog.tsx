"use client";

import { translateMarkdown } from "@/api/translation";
import { SUBMIT_TITLE_MAX_LENGTH } from "@/app/submit/_consts";
import {
  francToIso1,
  isRtlLang,
  languageDisplayName,
  LIBRETRANSLATE_CODES,
  LIBRETRANSLATE_SOURCES,
  LIBRETRANSLATE_TARGETS,
  normLang
} from "@/features/shared/entry-translate/iso639";
import { parseAllExtensionsToDoc, resolveInsertContent } from "@/features/tiptap-editor";
import { postBodySummary, simpleMarkdownToHTML } from "@ecency/render-helper";
import { Editor } from "@tiptap/core";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@ui/modal";
import { Spinner } from "@ui/spinner";
import i18next from "i18next";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePublishState } from "../_hooks";

// Same sampling bounds as the reader-side language gate: a few hundred clean
// chars are plenty for franc, and rendering a whole long draft would be waste.
const SAMPLE_CHARS = 600;
const RAW_SAMPLE_CHARS = 2000;
// Below this much plain text detection is unreliable and translating is moot.
const MIN_TRANSLATE_CHARS = 30;

interface Props {
  show: boolean;
  setShow: (v: boolean) => void;
  editor: Editor | null;
}

export function PublishTranslateDialog({ show, setShow, editor }: Props) {
  const { title, content, setTitle } = usePublishState();

  const [source, setSource] = useState("en");
  const [target, setTarget] = useState("es");
  const [detected, setDetected] = useState("");
  const [addTitleMarker, setAddTitleMarker] = useState(true);
  const [translated, setTranslated] = useState("");
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [failed, setFailed] = useState(false);

  const sample = useMemo(
    () =>
      content ? postBodySummary(content.slice(0, RAW_SAMPLE_CHARS), 0).slice(0, SAMPLE_CHARS) : "",
    [content]
  );
  const tooShort = sample.trim().length < MIN_TRANSLATE_CHARS;

  useEffect(() => {
    if (!show || tooShort) {
      return;
    }

    let cancelled = false;
    import("franc-min")
      .then(({ franc }) => {
        if (cancelled) {
          return;
        }
        const lang = francToIso1(franc(sample));
        if (lang && LIBRETRANSLATE_SOURCES.has(lang)) {
          setDetected(lang);
          setSource(lang);
        }
      })
      .catch(() => {
        // Detector chunk failed to load. Keep the default source, the user
        // can still pick it manually.
      });
    return () => {
      cancelled = true;
    };
  }, [show, sample, tooShort]);

  useEffect(() => {
    if (source !== "en") {
      setTarget("en");
      return;
    }
    const reader = normLang(i18next.language);
    setTarget(reader && reader !== "en" && LIBRETRANSLATE_TARGETS.has(reader) ? reader : "es");
  }, [source]);

  // A result translated into a previous language pair must never be applied.
  useEffect(() => {
    setTranslated("");
    setFailed(false);
  }, [source, target]);

  // The dialog unmounts on close; stop the request chain instead of letting
  // it keep hitting the translation service in the background.
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const translate = async () => {
    setTranslating(true);
    setFailed(false);
    setTranslated("");
    setProgress([0, 0]);
    try {
      const result = await translateMarkdown(
        content ?? "",
        source,
        target,
        (done, total) => setProgress([done, total]),
        () => unmounted.current
      );
      setTranslated(result);
    } catch {
      if (!unmounted.current) {
        setFailed(true);
      }
    } finally {
      if (!unmounted.current) {
        setTranslating(false);
      }
    }
  };

  const apply = () => {
    const appendix = `\n\n---\n\n## ${languageDisplayName(target, target)}\n\n${translated}`;
    const content = editor
      ? resolveInsertContent(
          editor.schema,
          parseAllExtensionsToDoc(simpleMarkdownToHTML(appendix)),
          appendix
        )
      : null;

    if (content) {
      editor?.chain().focus("end").insertContent(content).run();
    }
    if (addTitleMarker && title?.trim()) {
      const marker = ` [${source.toUpperCase()} | ${target.toUpperCase()}]`;
      if (title.length + marker.length <= SUBMIT_TITLE_MAX_LENGTH) {
        setTitle(`${title}${marker}`);
      }
    }
    setShow(false);
  };

  return (
    <Modal show={show} onHide={() => setShow(false)} centered={true} size="lg">
      <ModalHeader closeButton={true}>{i18next.t("publish.translate.title")}</ModalHeader>
      <ModalBody>
        {tooShort ? (
          <div className="text-sm opacity-50">{i18next.t("publish.translate.empty-body-hint")}</div>
        ) : (
          <>
            <div className="text-sm opacity-50 mb-4">
              {i18next.t("publish.translate.review-note")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">
                  {i18next.t("publish.translate.source-language")}
                </label>
                <FormControl
                  type="select"
                  size="sm"
                  value={source}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSource(e.target.value)
                  }
                >
                  {LIBRETRANSLATE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {languageDisplayName(code, i18next.language)}
                    </option>
                  ))}
                </FormControl>
                {detected && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {i18next.t("publish.translate.detected-language", {
                      lang: languageDisplayName(detected, i18next.language)
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm mb-1">
                  {i18next.t("publish.translate.target-language")}
                </label>
                <FormControl
                  type="select"
                  size="sm"
                  value={target}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setTarget(e.target.value)
                  }
                >
                  {LIBRETRANSLATE_CODES.filter((code) => code !== source).map((code) => (
                    <option key={code} value={code}>
                      {languageDisplayName(code, i18next.language)}
                    </option>
                  ))}
                </FormControl>
              </div>
            </div>
            {!!title.trim() && (
              <FormControl
                type="checkbox"
                label={i18next.t("publish.translate.add-title-marker")}
                checked={addTitleMarker}
                onChange={(v) => setAddTitleMarker(v)}
              />
            )}
            {translating && (
              <div className="flex items-center justify-center gap-3 p-4">
                <Spinner className="size-4" />
                {progress[1] > 0 && (
                  <span className="text-sm">
                    {i18next.t("publish.translate.progress", {
                      done: progress[0],
                      total: progress[1]
                    })}
                  </span>
                )}
              </div>
            )}
            {failed && (
              <p className="text-sm text-red-500 mt-4">{i18next.t("publish.translate.error")}</p>
            )}
            {translated && !translating && (
              <div className="max-h-[300px] overflow-y-auto border border-[--border-color] rounded-xl p-3 mt-4">
                <p
                  className="whitespace-pre-wrap text-sm"
                  dir={isRtlLang(target) ? "rtl" : "ltr"}
                >
                  {translated}
                </p>
              </div>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button
          size="sm"
          appearance={translated ? "gray" : "primary"}
          disabled={tooShort || translating}
          onClick={translate}
        >
          {i18next.t("publish.translate.translate")}
        </Button>
        <Button size="sm" disabled={!translated || translating} onClick={apply}>
          {i18next.t("publish.translate.apply")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
