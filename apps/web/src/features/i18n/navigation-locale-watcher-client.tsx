"use client";

import useMount from "react-use/lib/useMount";
import * as ls from "@/utils/local-storage";
import { useSearchParams } from "next/navigation";
import { langOptions } from "@/features/i18n/index";
import { useCallback, useEffect, useMemo } from "react";
import { useGlobalStore } from "@/core/global-store";
import useUnmount from "react-use/lib/useUnmount";
import i18next from "i18next";
import { setDayjsLocale } from "@/utils/dayjs";

interface Props {
  targetLanguage?: string | null;
}

export function NavigationLocaleWatcherClient({ targetLanguage }: Props) {
  const params = useSearchParams();
  const languageFromList = useMemo(
    () => langOptions.find((item) => item.code.split("-")[0] === params?.get("lang")),
    [params]
  );
  const derivedLanguage = targetLanguage ?? languageFromList?.code;

  const lang = useGlobalStore((state) => state.lang);
  const setLang = useGlobalStore((state) => state.setLang);

  const localeChanged = useCallback((lang: string) => void setDayjsLocale(lang), []);

  useEffect(() => {
    if (derivedLanguage && lang !== derivedLanguage) {
      // setLang is the ordered pipeline: it loads the i18n resources and the
      // dayjs table, switches i18next and only then publishes the state. A
      // separate direct changeLanguage() here would re-render with a
      // half-switched locale (#1669 review).
      setLang(derivedLanguage);
    }
  }, [derivedLanguage, lang, setLang]);

  useMount(() => {
    if (derivedLanguage && lang !== derivedLanguage) {
      ls.set("current-language", lang);
    }

    i18next.on("languageChanged", localeChanged);
  });

  useUnmount(() => {
    const currentLang = ls.get("current-language");
    if (currentLang) {
      setLang(currentLang);
    }
    i18next.off("languageChanged", localeChanged);
  });

  return <></>;
}
