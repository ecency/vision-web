import i18n from "i18next";
import { loadLocale } from "./index";

/**
 * The Raidstead game's strings leave the eagerly bundled en-US locale through
 * the webpack loader in ./faq-split.js (`?raidstead`) and are merged back into
 * the "translation" namespace when the game loads, so `i18next.t("raidstead.…")`
 * works as usual once `ensureRaidsteadLoaded` has resolved. Other locales load
 * as whole files (loadLocale), with English as the fallback, as for the FAQ.
 */
const PROBE_KEY = "intro";
const pending = new Map<string, Promise<void>>();

type LocaleJson = { raidstead?: Record<string, unknown> } & Record<string, unknown>;

// The loader returns only `{ raidstead }`; without it (vitest) the import is
// the whole locale, so reduce it to the same shape either way.
function pickGame(mod: unknown): { raidstead: Record<string, unknown> } {
  const json = ((mod as { default?: LocaleJson }).default ?? mod) as LocaleJson;
  return { raidstead: json.raidstead ?? {} };
}

export function isRaidsteadLoaded(lang: string = i18n.language): boolean {
  const bundle = i18n.getResourceBundle(lang, "translation") as LocaleJson | undefined;
  return Boolean(bundle?.raidstead?.[PROBE_KEY]);
}

export function ensureRaidsteadLoaded(lang: string = i18n.language || "en-US"): Promise<void> {
  if (isRaidsteadLoaded(lang)) return Promise.resolve();
  const inFlight = pending.get(lang);
  if (inFlight) return inFlight;
  const task = (async () => {
    if (lang === "en-US") {
      const mod = await import(
        /* webpackChunkName: "i18n-raidstead" */ "./locales/en-US.json?raidstead"
      );
      i18n.addResourceBundle("en-US", "translation", pickGame(mod), true, true);
    } else {
      await Promise.all([loadLocale(lang), ensureRaidsteadLoaded("en-US")]);
    }
  })().finally(() => pending.delete(lang));
  pending.set(lang, task);
  return task;
}
