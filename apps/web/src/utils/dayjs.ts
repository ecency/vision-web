import "@/polyfills";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import calendar from "dayjs/plugin/calendar";
import localizedFormat from "dayjs/plugin/localizedFormat";
import minMax from "dayjs/plugin/minMax";

// Extend dayjs with commonly used plugins
// These are needed for replacing moment.js features across the codebase
// utc & timezone: handling timezone conversions
// relativeTime: fromNow() style formatting
// isSameOrBefore / isSameOrAfter: comparison helpers
// calendar: calendar time formatting
// localizedFormat: format tokens like LLLL
// minMax: max() helper

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(calendar);
dayjs.extend(localizedFormat);
dayjs.extend(minMax);

/*
  Locale tables load on demand (#1668). The 14 eager imports above used to ride
  in the pre-paint chunk wave (chunk 2738, 135 KB wire) although a visitor uses
  at most one; English ships built into dayjs. The explicit loader map keeps
  the bundler emitting exactly one tiny lazy chunk per supported locale.
*/
const DAYJS_LOCALE_LOADERS: Record<string, () => Promise<unknown>> = {
  bg: () => import("dayjs/locale/bg"),
  es: () => import("dayjs/locale/es"),
  fi: () => import("dayjs/locale/fi"),
  hi: () => import("dayjs/locale/hi"),
  id: () => import("dayjs/locale/id"),
  it: () => import("dayjs/locale/it"),
  pt: () => import("dayjs/locale/pt"),
  ru: () => import("dayjs/locale/ru"),
  sr: () => import("dayjs/locale/sr"),
  uk: () => import("dayjs/locale/uk"),
  uz: () => import("dayjs/locale/uz"),
  "zh-cn": () => import("dayjs/locale/zh-cn"),
  th: () => import("dayjs/locale/th"),
  tr: () => import("dayjs/locale/tr")
};

/**
 * Loads (if needed) and applies the dayjs locale for an i18next language code.
 * "es-ES" resolves to "es", "zh-CN" to "zh-cn". A language with no bundled
 * table (fr, de, ja, nl, pl) keeps dates in the current locale, exactly as the
 * old eager-import setup behaved. Dates rendered between the language change
 * and the table arriving stay in the previous locale for that one render.
 */
export async function setDayjsLocale(lang: string): Promise<void> {
  const lower = lang.toLowerCase();
  const key = lower in DAYJS_LOCALE_LOADERS ? lower : lower.split("-")[0];
  const hasTable = key in DAYJS_LOCALE_LOADERS;
  if (hasTable) {
    try {
      await DAYJS_LOCALE_LOADERS[key]();
    } catch {
      return; // chunk fetch failed: keep the current locale
    }
  }
  dayjs.locale(hasTable ? key : lang);
}

export default dayjs;
export type { Dayjs } from "dayjs";
