import type { Locale } from 'date-fns';
import { format, formatDistanceToNow, formatRelative } from 'date-fns';
import {
  de,
  enUS,
  es,
  fr,
  id,
  it,
  ja,
  ko,
  pl,
  pt,
  ru,
  tr,
  uk,
  vi,
  zhCN,
} from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { InstanceConfigManager } from './configuration-loader';

// Map language codes to date-fns locales.
// Null-prototype on purpose: the language comes from owner-editable config, and
// a plain literal would resolve a value like 'constructor' to an inherited
// member instead of falling back to the default locale.
const localeMap: Record<string, Locale> = Object.assign(Object.create(null), {
  en: enUS,
  es: es,
  de: de,
  fr: fr,
  pt: pt,
  ru: ru,
  ko: ko,
  ja: ja,
  zh: zhCN,
  it: it,
  tr: tr,
  pl: pl,
  uk: uk,
  vi: vi,
  id: id,
});

// Convert config format patterns to date-fns format patterns
// Config uses common patterns like YYYY-MM-DD, date-fns uses yyyy-MM-dd
function convertFormatPattern(pattern: string): string {
  return pattern
    .replace(/YYYY/g, 'yyyy')
    .replace(/YY/g, 'yy')
    .replace(/DD/g, 'dd')
    .replace(/D/g, 'd');
}

/**
 * Parse a date string from Hive blockchain (UTC) into a Date object
 * Hive dates are in format "2024-01-16T10:00:00" without timezone indicator
 * They should be treated as UTC
 */
function parseHiveDate(date: Date | string | number): Date {
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);

  // Hive dates don't have timezone indicator, treat as UTC
  const dateStr = String(date);
  if (
    !dateStr.endsWith('Z') &&
    !dateStr.includes('+') &&
    !dateStr.includes('-', 10)
  ) {
    return new Date(dateStr + 'Z');
  }
  return new Date(dateStr);
}

/**
 * True for an unparseable/invalid Date. date-fns v4's `format` THROWS a RangeError on an
 * Invalid Date; since these formatters run during render and the only boundary is the
 * app-wide ErrorBoundary, an unexpected date (e.g. an undefined field) would otherwise blank
 * the entire page. The formatters below return "" for such input instead.
 */
function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/**
 * date-fns throws on an unknown time zone, and the value comes from a free text
 * config field, so "UTC+3" (not an IANA zone) would otherwise take down every
 * page that renders a date.
 */
function toZoned(date: Date, timezone: string): Date {
  const zoned = toZonedTime(date, timezone);
  return isValidDate(zoned) ? zoned : date;
}

/**
 * date-fns throws a RangeError on any unescaped latin character that is not a
 * token, which includes common Moment style patterns such as "hh:mm A". The
 * pattern is owner-typed, so one typo would blank the whole blog rather than a
 * single timestamp.
 */
function safeFormat(date: Date, pattern: string, fallback: string): string {
  // getLocale() reads the config and is inside the try on purpose: a general
  // section that is missing or not an object is exactly the shape this guard
  // exists to survive, and reading it above the try would throw past it.
  try {
    return format(date, pattern, { locale: getLocale() });
  } catch {
    try {
      return format(date, fallback, { locale: getLocale() });
    } catch {
      try {
        return format(date, fallback);
      } catch {
        return '';
      }
    }
  }
}

function getLocale(): Locale {
  const language = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general?.language,
  );
  return localeMap[language] || enUS;
}

function getTimezone(): string {
  return InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general?.timezone || 'UTC',
  );
}

function getDateFormat(): string {
  const configFormat = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general?.dateFormat,
  );
  return convertFormatPattern(configFormat || 'yyyy-MM-dd');
}

function getTimeFormat(): string {
  const configFormat = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general?.timeFormat,
  );
  return convertFormatPattern(configFormat || 'HH:mm:ss');
}

function getDateTimeFormat(): string {
  const configFormat = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general?.dateTimeFormat,
  );
  return convertFormatPattern(configFormat || 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Format a date using the configured date format and timezone
 */
export function formatDate(date: Date | string | number): string {
  const utcDate = parseHiveDate(date);
  if (!isValidDate(utcDate)) return '';
  const zonedDate = toZoned(utcDate, getTimezone());
  return safeFormat(zonedDate, getDateFormat(), 'yyyy-MM-dd');
}

/**
 * Format a time using the configured time format and timezone
 */
export function formatTime(date: Date | string | number): string {
  const utcDate = parseHiveDate(date);
  if (!isValidDate(utcDate)) return '';
  const zonedDate = toZoned(utcDate, getTimezone());
  return safeFormat(zonedDate, getTimeFormat(), 'HH:mm:ss');
}

/**
 * Format a date and time using the configured datetime format and timezone
 */
export function formatDateTime(date: Date | string | number): string {
  const utcDate = parseHiveDate(date);
  if (!isValidDate(utcDate)) return '';
  const zonedDate = toZoned(utcDate, getTimezone());
  return safeFormat(zonedDate, getDateTimeFormat(), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 * This compares UTC times correctly regardless of browser timezone
 */
export function formatRelativeTime(date: Date | string | number): string {
  const utcDate = parseHiveDate(date);
  if (!isValidDate(utcDate)) return '';
  // formatDistanceToNow compares UTC timestamps internally, so we just need
  // to ensure the input date is parsed as UTC (which parseHiveDate does).
  // Guarded like the others: getLocale() reads owner-controlled config.
  try {
    return formatDistanceToNow(utcDate, {
      addSuffix: true,
      locale: getLocale(),
    });
  } catch {
    return '';
  }
}

/**
 * Format a date relative to now (e.g., "yesterday at 3:00 PM")
 */
export function formatRelativeDate(date: Date | string | number): string {
  const utcDate = parseHiveDate(date);
  if (!isValidDate(utcDate)) return '';
  const timezone = getTimezone();
  const zonedDate = toZoned(utcDate, timezone);
  const zonedNow = toZoned(new Date(), timezone);

  try {
    return formatRelative(zonedDate, zonedNow, { locale: getLocale() });
  } catch {
    return zonedDate.toISOString();
  }
}

/**
 * Format a date for display (month and year only)
 */
export function formatMonthYear(date: Date | string | number): string {
  const utcDate = parseHiveDate(date);
  if (!isValidDate(utcDate)) return '';
  const zonedDate = toZoned(utcDate, getTimezone());
  return safeFormat(zonedDate, 'MMMM yyyy', 'MMMM yyyy');
}

/**
 * Custom format with locale support and timezone
 */
export function formatCustom(
  date: Date | string | number,
  formatStr: string,
): string {
  const utcDate = parseHiveDate(date);
  if (!isValidDate(utcDate)) return '';
  const zonedDate = toZoned(utcDate, getTimezone());
  return safeFormat(
    zonedDate,
    convertFormatPattern(formatStr),
    'yyyy-MM-dd HH:mm:ss',
  );
}
