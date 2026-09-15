export function extractPublishContentText(content?: string | null): string {
  if (!content) {
    return "";
  }

  return content
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasPublishContent(content?: string | null): boolean {
  if (!content) {
    return false;
  }

  if (extractPublishContentText(content).length > 0) {
    return true;
  }

  return /<(img|video|audio|iframe|embed|object|source|canvas)\b/i.test(content);
}

/**
 * Whether there is anything worth keeping, and so whether "Save draft" should
 * be offered.
 *
 * This deliberately does not require a title. Gating on the title alone left
 * anyone who drafts body-first with a button that never enabled - and, because
 * the gray-link appearance carried no disabled styling, one that looked
 * perfectly clickable while doing nothing. Autosave has always written
 * title-less drafts through the same endpoint, so the server accepts them.
 */
export function hasDraftableContent(title?: string | null, content?: string | null): boolean {
  return !!title?.trim() || hasPublishContent(content);
}

/**
 * The description to publish, or undefined when the body summary should be used
 * instead. A value of one character or less counts as empty: it is what the
 * composer used to capture from the first typed letter, never a real summary.
 */
export function usableDescription(description?: string | null): string | undefined {
  return description && description.trim().length > 1 ? description : undefined;
}
