import { SUBMIT_TAG_MAX_LENGTH } from "@/app/submit/_consts";

/**
 * The i18n key of the first rule `tags` break, or "" when every tag is valid. One rule set
 * for every way a tag can arrive (typed, pasted, published), so a tag the selector warns
 * about can not reach the list, or publish, by a path that skipped the warning.
 * Tags in `kept` are exempt: a post being edited keeps the tags it was published with.
 */
export function getTagsWarning(input: string[], kept: string[] = []): string {
  const tags = input.filter((tag) => !kept.includes(tag));
  if (tags.length > 10) return "tag-selector.limited_tags";
  if (tags.some((c) => c.length > SUBMIT_TAG_MAX_LENGTH)) return "tag-selector.limited_length";
  if (tags.some((c) => c.split("-").length > 2)) return "tag-selector.limited_dash";
  if (tags.some((c) => c.indexOf(",") >= 0)) return "tag-selector.limited_space";
  if (tags.some((c) => /[A-Z]/.test(c))) return "tag-selector.limited_lowercase";
  if (tags.some((c) => !/^[a-z0-9-#]+$/.test(c))) return "tag-selector.limited_characters";
  if (tags.some((c) => !/^[a-z-#]/.test(c))) return "tag-selector.limited_firstchar";
  if (tags.some((c) => !/[a-z0-9]$/.test(c))) return "tag-selector.limited_lastchar";
  return "";
}
