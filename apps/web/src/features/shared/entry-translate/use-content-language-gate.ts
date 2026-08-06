"use client";

import { useEffect, useState } from "react";
import i18next from "i18next";
import { postBodySummary } from "@ecency/render-helper";
import { detectLanguage } from "@/api/translation";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import {
  francToIso1,
  LIBRETRANSLATE_TARGETS,
  MIN_DETECT_CHARS,
  normLang,
  resolveTranslateCta,
  TranslateCtaDecision
} from "./iso639";

// How much plain text to feed the detector. franc is accurate well below this.
const SAMPLE_CHARS = 600;
// Only render markdown for the first slice of raw body — detection needs a few
// hundred clean chars, so rendering a whole long article would be wasted work
// (especially across many feed cards).
const RAW_SAMPLE_CHARS = 2000;

interface CacheEntry {
  // Detected content language (ISO-639-1), null when undetermined/unsupported.
  lang: string | null;
  // true once the server /detect confirmed it (full-post path). A franc-only
  // (feed) result can later be upgraded by the full-post path.
  confirmed: boolean;
}

// Module-scoped, keyed by `${author}/${permlink}` so the reader-independent
// content language is computed at most once per post for the whole session.
// Crucially this survives component REMOUNTS (feed scroll/refetch, FlashList-
// style header churn), so nothing re-runs detection or re-hits the network.
const MAX_CACHE_ENTRIES = 500;
const contentLangCache = new Map<string, CacheEntry>();

// Bound memory over long infinite-scroll sessions with simple FIFO eviction.
function cacheDetection(key: string, entry: CacheEntry): void {
  if (!contentLangCache.has(key) && contentLangCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = contentLangCache.keys().next().value;
    if (oldest !== undefined) {
      contentLangCache.delete(oldest);
    }
  }
  contentLangCache.set(key, entry);
}

/** Read the reader's preferred language. MUST be called client-side only. */
function resolveReaderLang(): string {
  const candidates = [
    i18next.language,
    typeof navigator !== "undefined" ? navigator.language : "",
    typeof navigator !== "undefined" && navigator.languages?.length ? navigator.languages[0] : ""
  ];
  for (const candidate of candidates) {
    const norm = normLang(candidate);
    if (norm && LIBRETRANSLATE_TARGETS.has(norm)) {
      return norm;
    }
  }
  return "en";
}

function scheduleIdle(cb: () => void): void {
  const ric = (typeof window !== "undefined" && (window as any).requestIdleCallback) as
    | ((c: () => void, o?: { timeout: number }) => number)
    | undefined;
  if (ric) {
    ric(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 200);
  }
}

interface GateEntry {
  author: string;
  permlink: string;
  body: string;
}

interface GateOptions {
  // Full-post view: confirm/refine the franc guess with the server /detect
  // endpoint (accurate source-language name, catches franc-unsupported langs,
  // corrects confident misdetections). NEVER enable for feed/wave chips — it
  // would fan out one network call per rendered item. Only honored for
  // logged-in readers: search crawlers and headless scrapers execute this
  // code while rendering post pages, and their per-view /detect calls were
  // enough traffic to overload the translate backend. Logged-out readers get
  // the franc guess, the same fallback as when /detect is unreachable.
  serverConfirm?: boolean;
  // Skip detection entirely (e.g. raw/edit view, NSFW not yet revealed).
  disabled?: boolean;
}

/**
 * Decide whether to offer a "Translate to <reader>" CTA for an entry, by
 * comparing the reader's language to the detected content language.
 *
 * Contract: returns `null` until resolved on the client (never during SSR or the
 * first client render) so it cannot cause a hydration mismatch — callers render
 * nothing while it is null. Fails closed (null) on any error.
 *
 * Feed-safe: the only synchronous work per mount is a raw string-length check
 * and a Map lookup. The expensive markdown render + detection happen once per
 * permlink, at idle, and only on a cache miss.
 */
export function useContentLanguageGate(
  entry: GateEntry | null | undefined,
  { serverConfirm = false, disabled = false }: GateOptions = {}
): TranslateCtaDecision | null {
  const [decision, setDecision] = useState<TranslateCtaDecision | null>(null);
  const { username: activeUsername } = useActiveAccount();
  // Server /detect is a logged-in-only escalation (see GateOptions.serverConfirm).
  const canServerConfirm = serverConfirm && !!activeUsername;

  const author = entry?.author;
  const permlink = entry?.permlink;
  const body = entry?.body;

  useEffect(() => {
    setDecision(null);

    if (disabled || !author || !permlink || !body) {
      return;
    }

    // Cheap raw pre-check — never render a summary for a trivially short body.
    if (body.trim().length < MIN_DETECT_CHARS) {
      return;
    }

    let cancelled = false;
    const key = `${author}/${permlink}`;
    const reader = resolveReaderLang();

    const cached = contentLangCache.get(key);
    if (cached && (cached.confirmed || !canServerConfirm)) {
      // A cached lang implies the body was already long enough when detected.
      setDecision(
        resolveTranslateCta({ detected: cached.lang, reader, textLength: MIN_DETECT_CHARS })
      );
      return;
    }

    scheduleIdle(async () => {
      if (cancelled) {
        return;
      }
      try {
        // Bound markdown work regardless of article length.
        const sample = postBodySummary(body.slice(0, RAW_SAMPLE_CHARS), 0).slice(0, SAMPLE_CHARS);
        const textLength = sample.trim().length;

        if (textLength < MIN_DETECT_CHARS) {
          cacheDetection(key, { lang: null, confirmed: true });
          return; // decision stays null → no CTA
        }

        let lang: string | null = cached?.lang ?? null;
        let confirmed = cached?.confirmed ?? false;

        if (!cached) {
          const { franc } = await import("franc-min");
          if (cancelled) {
            return;
          }
          lang = francToIso1(franc(sample));
        }

        if (lang && lang === reader) {
          // franc is confident it's the reader's own language — no CTA, and no
          // need to spend a /detect call. Safe to treat as confirmed.
          confirmed = true;
        } else if (canServerConfirm) {
          // Full-post: get the authoritative source language. Covers franc
          // 'und'/unsupported langs and corrects confident misdetections
          // (e.g. Danish reported as Dutch) so the banner names the real one.
          try {
            const detected = await detectLanguage(sample);
            if (cancelled) {
              return;
            }
            const top = detected[0];
            if (top && typeof top.language === "string") {
              lang = normLang(top.language);
              confirmed = true;
            }
          } catch {
            // /detect unreachable — keep the franc guess (fail open to franc).
          }
        }

        cacheDetection(key, { lang, confirmed });
        if (!cancelled) {
          setDecision(resolveTranslateCta({ detected: lang, reader, textLength }));
        }
      } catch {
        // Detector chunk failed to load or threw — fail closed, keep original.
        if (!cancelled) {
          setDecision(null);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [author, permlink, body, canServerConfirm, disabled]);

  return decision;
}
