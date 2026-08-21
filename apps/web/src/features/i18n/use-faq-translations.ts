"use client";

import i18n from "i18next";
import { useEffect, useState } from "react";
import { ensureFaqLoaded, isFaqLoaded } from "./faq";

const RETRY_DELAYS_MS = [2000, 8000];

/**
 * True once the FAQ articles for the active language are registered with
 * i18next. Render FAQ strings only when this is true: before that
 * `i18next.t("static.faq.…-body")` returns the raw key (#1598).
 *
 * Readiness is always re-probed against the language that is current when a
 * load settles, so a load started for a previous language cannot mark the
 * new one ready. A failed chunk request is retried a couple of times with a
 * delay before the strings are left hidden until the next language change.
 */
export function useFaqTranslations(): boolean {
  const [ready, setReady] = useState(() => isFaqLoaded(i18n.language));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => !cancelled && setReady(isFaqLoaded(i18n.language));
    const load = (attempt = 0) => {
      settle();
      ensureFaqLoaded(i18n.language)
        .then(settle)
        .catch(() => {
          if (cancelled || attempt >= RETRY_DELAYS_MS.length) return;
          timer = setTimeout(() => load(attempt + 1), RETRY_DELAYS_MS[attempt]);
        });
    };
    const onLanguageChanged = () => {
      if (timer) clearTimeout(timer);
      load();
    };
    load();
    i18n.on("languageChanged", onLanguageChanged);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      i18n.off("languageChanged", onLanguageChanged);
    };
  }, []);

  return ready;
}
