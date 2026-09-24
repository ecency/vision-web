import { SUBMIT_TAG_MAX_LENGTH } from "@/app/submit/_consts";
import type { Draft, Entry } from "@/entities";
import { metaStringList } from "@/utils/json-metadata";

/**
 * The i18n key of the first rule `tags` break, or "" when every tag is valid. One rule set
 * for every way a tag can arrive (typed, pasted, published), so a tag the selector warns
 * about can not reach the list, or publish, by a path that skipped the warning.
 * Tags in `kept` are exempt: a post being edited keeps the tags it was published with.
 */
export function getTagsWarning(input: string[], kept: string[] = []): string {
  if (input.length > 10) return "tag-selector.limited_tags";
  const tags = input.filter((tag) => !kept.includes(tag));
  if (tags.some((c) => c.length > SUBMIT_TAG_MAX_LENGTH)) return "tag-selector.limited_length";
  if (tags.some((c) => c.split("-").length > 2)) return "tag-selector.limited_dash";
  if (tags.some((c) => c.indexOf(",") >= 0)) return "tag-selector.limited_space";
  if (tags.some((c) => /[A-Z]/.test(c))) return "tag-selector.limited_lowercase";
  if (tags.some((c) => !/^[a-z0-9-#]+$/.test(c))) return "tag-selector.limited_characters";
  if (tags.some((c) => !/^[a-z-#]/.test(c))) return "tag-selector.limited_firstchar";
  if (tags.some((c) => !/[a-z0-9]$/.test(c))) return "tag-selector.limited_lastchar";
  return "";
}

/** Trims loaded tags to the length limit and drops empties and repeats. */
export function normalizeTagList(tagList: string[]): string[] {
  const trimmed = tagList.map((tag) => tag.slice(0, SUBMIT_TAG_MAX_LENGTH)).filter((tag) => tag);
  return trimmed.filter((tag, index) => trimmed.indexOf(tag) === index);
}

/** A saved draft keeps its tags as one space or comma separated string. */
export function draftTagList(tags: string | undefined): string[] {
  return (tags ?? "")
    .trim()
    .split(/[ ,]+/)
    .filter((t) => !!t);
}

/**
 * The publish-time check. Tags the edited post or the loaded draft already carry are
 * exempt: other clients (mobile among them, which shares drafts) accept tags such as
 * `3speak` that these rules refuse. They are compared in the form the editor loads
 * them, so a legacy tag trimmed on load still counts as kept.
 */
export function validateTags(
  tags: string[],
  { editingEntry, editingDraft }: { editingEntry?: Entry | null; editingDraft?: Draft | null }
): string {
  const kept = normalizeTagList([
    ...(editingEntry ? metaStringList(editingEntry.json_metadata?.tags) : []),
    ...(editingDraft ? draftTagList(editingDraft.tags) : [])
  ]);
  return getTagsWarning(tags, kept);
}
