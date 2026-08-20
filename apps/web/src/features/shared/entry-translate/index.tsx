import React, { useEffect, useState } from "react";
import { Entry } from "@/entities";
import { getTranslation, getLanguages, Language } from "@/api/translation";
import { postBodySummary } from "@ecency/render-helper";
import i18next from "i18next";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { Spinner } from "@ui/spinner";
import { Select } from "@ui/input/form-controls/select";
import { isRtlLang, languageDisplayName, normLang } from "./iso639";
import { useQuery } from "@tanstack/react-query";
import { EcencyEntriesCacheManagement } from "@/core/caches";

interface Props {
  entry: Entry;
  onHide: () => void;
  // Pre-select the target language (e.g. from the inline banner's "Change
  // language" action or a feed/wave chip). Defaults to the UI language.
  initialTarget?: string;
  // Source language for the request. Defaults to "auto" (LibreTranslate detects).
  initialSource?: string;
}

export function EntryTranslate({ entry, onHide, initialTarget, initialSource }: Props) {
  const [translated, setTranslated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [detectedFrom, setDetectedFrom] = useState<string>("");
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<string>(
    normLang(initialTarget || i18next.language) || "en"
  );

  useEffect(() => {
    getLanguages().then(setLanguages);
  }, []);

  // Opened from a feed card, `entry` is a slim row with no body (see
  // core/entries/slim-entry.ts), so the full post is fetched here. The seeded
  // cache copy is stale from the start and refetchOnMount is off app-wide, hence
  // the explicit "always" — without it this would translate an empty string.
  const {
    data: fullEntry,
    isError: fullEntryFailed,
    isSuccess: fullEntryLoaded,
    isFetching: fullEntryFetching
  } = useQuery({
    ...EcencyEntriesCacheManagement.getEntryQueryByPath(entry.author, entry.permlink),
    enabled: !entry.body && !!entry.author && !!entry.permlink,
    refetchOnMount: "always"
  });
  const sourceBody = entry.body || fullEntry?.body || "";
  // No body is coming: the request failed, or it settled without a post (deleted,
  // or never indexed). Only then does the modal show its error rather than
  // spinning forever.
  //
  // `isFetching` is load-bearing. Feed cards seed this very cache key with the
  // slim row, so React Query reports success with an empty body from the first
  // render while the forced refetch is still in flight — reading that as terminal
  // flashed the error over a post that was about to arrive.
  const bodyUnavailable =
    !entry.body && !fullEntryFetching && (fullEntryFailed || fullEntryLoaded);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setTranslated("");
    setDetectedFrom("");
    setError(false);
    if (!sourceBody) {
      if (bodyUnavailable) {
        setError(true);
        setLoading(false);
      }
      // Otherwise the body is still on its way: stay in the loading state rather
      // than asking the translator for an empty document.
      return () => {
        canceled = true;
      };
    }
    const body = postBodySummary(sourceBody);
    getTranslation(body, initialSource ?? "auto", target)
      .then((r) => {
        if (!canceled) {
          setTranslated(r.translatedText);
          if (r.detectedLanguage?.language) {
            setDetectedFrom(r.detectedLanguage.language);
          }
        }
      })
      .catch(() => {
        // Surface the failure instead of leaving the modal blank (and swallow
        // the rejection so it isn't unhandled).
        if (!canceled) {
          setError(true);
        }
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [sourceBody, bodyUnavailable, target, initialSource]);

  return (
    <Modal
      show={true}
      onHide={onHide}
      className="flex justify-center items-center pt-0"
      dialogClassName="mt-0 rounded-xl"
    >
      <ModalHeader closeButton={true}>{i18next.t("entry-menu.translate")}</ModalHeader>
      <ModalBody className="pb-12 min-h-[200px]">
        <div className="mb-3">
          <label className="block text-sm mb-1">
            {i18next.t("entry-translate.target-language")}
          </label>
          <Select
            type={"select"}
            value={target}
            size="sm"
            onChange={(e) => setTarget(e.currentTarget.value)}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </Select>
        </div>
        {loading ? (
          <div className="flex justify-center p-3">
            <Spinner className="size-4" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{i18next.t("entry-translate.error")}</p>
        ) : (
          <>
            {detectedFrom && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                {i18next.t("entry-translate.translated-from", {
                  lang: languageDisplayName(detectedFrom, i18next.language)
                })}
              </div>
            )}
            <p className="whitespace-pre-line text-sm" dir={isRtlLang(target) ? "rtl" : "ltr"}>
              {translated}
            </p>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
