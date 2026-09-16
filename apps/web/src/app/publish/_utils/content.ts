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
 * The body as plain text, for a post the summariser cannot summarise: an image only post,
 * or a long run with no spaces, both of which it returns nothing for.
 *
 * Markdown destinations are scanned rather than matched with a pattern, because a URL can
 * hold parentheses, as in `a_(1).png`, and an image can sit inside a link. An image is
 * dropped whole. A link keeps its label, which is text the reader sees, and loses its
 * target. HTML tags are stripped including unclosed forms (`<[^>]*(?:>|$)`), so a truncated
 * `…<script` substring cannot leak into the meta tag, and the loop catches nested payloads
 * like `<scr<script>ipt>`.
 */
export function plainTextDescription(content: string, length: number): string {
  let stripped = stripMarkdownTargets(content);
  let previous: string;
  do {
    previous = stripped;
    stripped = stripped.replace(/<[^>]*(?:>|$)/g, "");
  } while (stripped !== previous);

  return stripped.replace(/\s+/g, " ").trim().slice(0, length);
}

/** Index of the character closing the pair opened at `start`, or -1 while it stays open. */
function closingIndex(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) {
      depth++;
    } else if (text[i] === close) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Drops `![alt](target)` whole and reduces `[label](target)` to its label. */
function stripMarkdownTargets(text: string): string {
  let out = "";
  let i = 0;

  while (i < text.length) {
    const isImage = text[i] === "!" && text[i + 1] === "[";

    if (isImage || text[i] === "[") {
      const labelOpen = i + (isImage ? 1 : 0);
      const labelClose = closingIndex(text, labelOpen, "[", "]");
      const targetClose =
        labelClose !== -1 && text[labelClose + 1] === "("
          ? closingIndex(text, labelClose + 1, "(", ")")
          : -1;

      if (targetClose !== -1) {
        // The label of a link can hold an image, so read it the same way.
        out += isImage ? " " : stripMarkdownTargets(text.slice(labelOpen + 1, labelClose));
        i = targetClose + 1;
        continue;
      }
    }

    out += text[i];
    i++;
  }

  return out;
}

// A letter or digit in any script. Plain ranges rather than `\p{...}` escapes, for the same
// reason as the grapheme fallback below.
const WORD_CHARACTER = /[a-z0-9]|[^\u0000-\u007F]/i;

/** Whether text says anything at all, as opposed to punctuation such as a stray `![](`. */
export function hasWordCharacter(text: string): boolean {
  return WORD_CHARACTER.test(text);
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
// Marks that hang off the character before them. Normalising composes the ones that have a
// precomposed form, such as e plus an acute accent; the rest, such as q plus the same accent,
// have none and are dropped here instead.
const COMBINING_MARKS =
  /[\u{0300}-\u{036F}\u{1AB0}-\u{1AFF}\u{1DC0}-\u{1DFF}\u{20D0}-\u{20FF}\u{FE20}-\u{FE2F}]/gu;

// A single emoji can span several UTF-16 code units, so count what a reader sees.
function countGraphemes(text: string): number {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text))
      .length;
  }

  // Approximate: a script whose clusters this does not model, such as Devanagari, still
  // counts high, which keeps a description rather than replacing it. That is the same
  // direction the old UTF-16 count erred in, and only engines without Intl.Segmenter get here.
  const collapsed = text
    .normalize("NFC")
    .replace(REGIONAL_INDICATOR_PAIR, "\u{1F3F3}")
    .replace(GRAPHEME_JOINERS, "")
    .replace(COMBINING_MARKS, "");
  return Array.from(collapsed).length;
}
