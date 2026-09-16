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
  const trimmed = description?.trim();
  return trimmed && countGraphemes(trimmed) > 1 ? description! : undefined;
}

// A flag is a pair of regional indicators. Everything else a reader sees as one symbol is
// built by hanging skin tone modifiers, variation selectors or zero width joiners off a
// base character. Plain code point ranges only: an engine old enough to lack Intl.Segmenter
// may also lack Unicode property escapes, and an unsupported escape throws while the module
// is parsed, which would break far more than this count.
const REGIONAL_INDICATOR_PAIR = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const GRAPHEME_JOINERS = /[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;

// A single emoji can span several UTF-16 code units, so count what a reader sees.
function countGraphemes(text: string): number {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text))
      .length;
  }

  // Normalising composes a base character and its combining marks into one code point.
  const collapsed = text
    .normalize("NFC")
    .replace(REGIONAL_INDICATOR_PAIR, "\u{1F3F3}")
    .replace(GRAPHEME_JOINERS, "");
  return Array.from(collapsed).length;
}
