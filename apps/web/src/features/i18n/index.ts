import i18n from "i18next";

import { setDayjsLocale } from "@/utils/dayjs";
import * as ls from "@/utils/local-storage";

export const langOptions = [
  {
    code: "en-US",
    name: "English"
  },
  {
    code: "es-ES",
    name: "Español"
  },
  {
    code: "fr-FR",
    name: "Français"
  },
  {
    code: "de-DE",
    name: "Deutsch"
  },
  {
    code: "hi-IN",
    name: "हिन्दी"
  },
  {
    code: "ja-JP",
    name: "日本語"
  },
  {
    code: "it-IT",
    name: "Italiano"
  },
  {
    code: "id-ID",
    name: "Bahasa Indonesia"
  },
  {
    code: "pt-PT",
    name: "Português"
  },
  {
    code: "nl-NL",
    name: "Nederlands"
  },
  {
    code: "sr-CS",
    name: "Srpski"
  },
  {
    code: "pl-PL",
    name: "Polski"
  },
  {
    code: "uk-UA",
    name: "Українська"
  },
  {
    code: "bg-BG",
    name: "Български"
  },
  {
    code: "ru-RU",
    name: "Русский"
  },
  {
    code: "uz-UZ",
    name: "O'zbekcha"
  },
  {
    code: "zh-CN",
    name: "简体字"
  },
  {
    code: "th-TH",
    name: "ไทย"
  },
  {
    code: "tr-TR",
    name: "Türkçe"
  }
];

// Only bundle en-US; all other locales are loaded on demand
const enUs = require("./locales/en-US.json");

const localeLoaders: Record<string, () => Promise<any>> = {
  "es-ES": () => import("./locales/es-ES.json"),
  "fr-FR": () => import("./locales/fr-FR.json"),
  "de-DE": () => import("./locales/de-DE.json"),
  "hi-IN": () => import("./locales/hi-IN.json"),
  "ja-JP": () => import("./locales/ja-JP.json"),
  "it-IT": () => import("./locales/it-IT.json"),
  "id-ID": () => import("./locales/id-ID.json"),
  "pt-PT": () => import("./locales/pt-PT.json"),
  "nl-NL": () => import("./locales/nl-NL.json"),
  "sr-CS": () => import("./locales/sr-CS.json"),
  "pl-PL": () => import("./locales/pl-PL.json"),
  "uk-UA": () => import("./locales/uk-UA.json"),
  "bg-BG": () => import("./locales/bg-BG.json"),
  "ru-RU": () => import("./locales/ru-RU.json"),
  "uz-UZ": () => import("./locales/uz-UZ.json"),
  "zh-CN": () => import("./locales/zh-CN.json"),
  "th-TH": () => import("./locales/th-TH.json"),
  "tr-TR": () => import("./locales/tr-TR.json")
};

export async function loadLocale(lang: string) {
  if (lang === "en-US" || !localeLoaders[lang]) return;
  // Probe a core key rather than the bundle's existence: a partial bundle
  // (FAQ articles registered early) must not pass for the whole file.
  if (i18n.getResourceBundle(lang, "translation")?.g) return;

  const mod = await localeLoaders[lang]();
  i18n.addResourceBundle(lang, "translation", mod.default || mod);
}

const supportedCodes = new Set(langOptions.map((l) => l.code));

/**
 * Best-effort detection of the visitor's preferred UI language from the browser.
 * Returns a supported langOptions code, or null when nothing matches.
 * SSR-safe: returns null when `navigator` is unavailable, so it must only be
 * relied upon on the client (call after mount to avoid hydration mismatches).
 */
export function detectBrowserLang(): string | null {
  if (typeof navigator === "undefined") return null;
  const navLangs =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
  for (const nav of navLangs) {
    if (!nav) continue;
    const lower = nav.toLowerCase();
    // exact match (e.g. "pt-PT")
    const exact = langOptions.find((o) => o.code.toLowerCase() === lower);
    if (exact) return exact.code;
    // base-language match (e.g. "de", "de-AT" -> "de-DE")
    const base = lower.split("-")[0];
    const baseMatch = langOptions.find((o) => o.code.split("-")[0].toLowerCase() === base);
    if (baseMatch) return baseMatch.code;
  }
  return null;
}

let initI18nextPromise: Promise<void> | null = null;

export function initI18next(): Promise<void> {
  if (initI18nextPromise) return initI18nextPromise;

  initI18nextPromise = (async () => {
    await i18n.init({
      resources: {
        ["en-US"]: {
          translation: enUs
        }
      },
      fallbackLng: "en-US",
      interpolation: {
        escapeValue: false
      }
    });

    i18n.on("languageChanged", async function (lang) {
      await loadLocale(lang);
      await setDayjsLocale(lang);
    });

    // Load the user's preferred locale on demand
    const raw = ls.get("lang") || ls.get("current-language");
    const userLang = raw && supportedCodes.has(raw) ? raw : "en-US";
    if (userLang !== "en-US") {
      await loadLocale(userLang);
    }
    await setDayjsLocale(userLang);
    await i18n.changeLanguage(userLang);
  })();

  return initI18nextPromise;
}

initI18next().catch((err) => console.error("[i18n] init failed:", err));

export * from "./navigation-locale-watcher";
export { ensureFaqLoaded, getEnglishFaqResources, isFaqLoaded } from "./faq";
