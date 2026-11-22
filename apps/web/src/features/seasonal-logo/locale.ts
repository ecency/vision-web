import { normLanguage, normRegion } from "./seasonal";

/// The region and language a browser is set to, from its language list
/// (`navigator.languages`), never its location. The language is the first
/// entry's; the region the first two-letter region any entry names.
export function readLocale(languages: readonly string[] | undefined): { region: string | null; language: string | null } {
  const list = (languages ?? []).filter(Boolean);
  const language = normLanguage(list[0]);
  let region: string | null = null;
  for (const tag of list) {
    const parts = tag.split(/[-_]/).slice(1);
    region = parts.map((p) => normRegion(p)).find((r) => r !== null) ?? null;
    if (region) break;
  }
  return { region, language };
}
