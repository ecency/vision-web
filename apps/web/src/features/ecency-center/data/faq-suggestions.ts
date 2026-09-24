import data from "./path.json";

/**
 * Help center FAQ suggestions for a page. Every matching entry of path.json
 * overrides the previous one, so the catch-all `/.*` sits first and narrower
 * patterns (e.g. `/@.+/(wallet)`) come after the broader ones they refine.
 */
export function getFaqSuggestions(pathname: string | null): string[] {
  let suggestions: string[] = [];
  for (const p of data.faqPaths) {
    if (pathname?.match(p.path)) {
      suggestions = p.suggestions;
    }
  }
  return suggestions;
}
