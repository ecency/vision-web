import i18n from "i18next";
import { loadLocale } from "./index";

/**
 * FAQ articles (`static.faq.*-header` / `*-body`) are split out of the eagerly
 * bundled en-US locale by the webpack loader in ./faq-split.js and merged back
 * into the "translation" namespace on demand, so every existing
 * `i18next.t("static.faq.…")` call keeps working once `ensureFaqLoaded` has
 * resolved for the active language (#1598).
 *
 * Other locales are loaded on demand as whole files (see loadLocale), articles
 * included, so for them "loaded" simply means the locale bundle is present.
 */
const PROBE_KEY = "what-is-ecency-header";
const pending = new Map<string, Promise<void>>();

type LocaleJson = { static?: { faq?: Record<string, string> } } & Record<string, unknown>;

// The loader returns only `{ static: { faq } }`; without it (vitest, or a
// bundler that ignores the rule) the import resolves to the whole locale, so
// reduce it to the same shape either way.
function pickFaq(mod: unknown): { static: { faq: Record<string, string> } } {
  const json = ((mod as { default?: LocaleJson }).default ?? mod) as LocaleJson;
  return { static: { faq: json.static?.faq ?? {} } };
}

// Probes the bundle itself rather than remembering what was loaded, so a
// bundle that is replaced or removed elsewhere is simply loaded again.
export function isFaqLoaded(lang: string = i18n.language): boolean {
  const bundle = i18n.getResourceBundle(lang, "translation") as LocaleJson | undefined;
  return Boolean(bundle?.static?.faq?.[PROBE_KEY]);
}

/**
 * Register the ENGLISH articles synchronously (idempotent). English only: the
 * other locales are owned by loadLocale as whole files, and registering a
 * partial bundle for one of them would make loadLocale believe the locale is
 * already present and never fetch it, leaving the rest of the UI untranslated.
 */
export function primeEnglishFaq(resources: { static: { faq: Record<string, string> } }) {
  if (isFaqLoaded("en-US")) return;
  i18n.addResourceBundle("en-US", "translation", resources, true, true);
}

export function ensureFaqLoaded(lang: string = i18n.language || "en-US"): Promise<void> {
  if (isFaqLoaded(lang)) return Promise.resolve();
  const inFlight = pending.get(lang);
  if (inFlight) return inFlight;
  const task = (async () => {
    if (lang === "en-US") {
      const mod = await import(/* webpackChunkName: "i18n-faq" */ "./locales/en-US.json?faq");
      primeEnglishFaq(pickFaq(mod));
    } else {
      // Whole-file locale, articles included. en-US is the fallback language
      // for any article a translation lacks, and its articles are no longer
      // in the eager bundle, so load them alongside or an untranslated
      // article would render as its raw key.
      await Promise.all([loadLocale(lang), ensureFaqLoaded("en-US")]);
    }
  })().finally(() => pending.delete(lang));
  pending.set(lang, task);
  return task;
}

/**
 * The English articles, for a server component to hand to <FaqResources> so
 * client components (which hydrate in the browser's language, English until a
 * switch loads a whole locale file) have them before they render. Call after
 * ensureFaqLoaded("en-US").
 */
export function getEnglishFaqResources(): { static: { faq: Record<string, string> } } {
  const bundle = i18n.getResourceBundle("en-US", "translation") as LocaleJson | undefined;
  const faq = bundle?.static?.faq ?? {};
  const content: Record<string, string> = {};
  for (const key of Object.keys(faq)) {
    if (/-(header|body)$/.test(key)) content[key] = faq[key];
  }
  return { static: { faq: content } };
}
