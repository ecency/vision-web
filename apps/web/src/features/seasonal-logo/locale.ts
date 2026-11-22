import { normLanguage, normRegion } from "./seasonal";

/// The region and language a browser is set to, from its language list
/// (`navigator.languages`), never its location. The language is the first
/// entry's; the region the first two-letter region any entry names.
export function readLocale(languages: readonly string[] | undefined): { region: string | null; language: string | null } {
  const list = (languages ?? []).filter(Boolean);
  const language = normLanguage(list[0]);
  let region: string | null = null;
  for (const tag of list) {
    // up to the first one-letter subtag: what follows is an extension (-u-ca-gregory)
    const parts = tag.split(/[-_]/).slice(1);
    const end = parts.findIndex((p) => p.length === 1);
    region = (end < 0 ? parts : parts.slice(0, end)).map((p) => normRegion(p)).find((r) => r !== null) ?? null;
    if (region) break;
  }
  return { region, language };
}
