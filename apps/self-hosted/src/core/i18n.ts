import { InstanceConfigManager } from "./configuration-loader";
import { translations, type TranslationKey } from "./i18n-strings";

export type { TranslationKey } from "./i18n-strings";

/**
 * Get a translated string for the given key
 */
export function t(key: TranslationKey): string {
  const language = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general.language,
  );

  const langTranslations = translations[language] || translations.en;
  return langTranslations[key] || translations.en[key] || key;
}

/**
 * Get the current language code
 */
export function getCurrentLanguage(): string {
  return InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general.language,
  );
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(lang: string): boolean {
  return lang in translations;
}

/**
 * Get list of supported languages
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(translations);
}
