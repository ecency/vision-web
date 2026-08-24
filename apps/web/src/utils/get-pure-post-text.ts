export function getPurePostText(text: string) {
  // Remove code blocks (```...``` and `...`)
  text = text.replace(/```[\s\S]*?```|`[^`]*`/g, "");

  // Remove images (![alt](url))
  text = text.replace(/!\[.*?\]\(.*?\)/g, "");

  // Remove links ([text](url)), keep link text
  text = text.replace(/\[([^\]]*)\]\(.*?\)/g, "$1");

  // Remove headers (#), lists (-, *, 1.), blockquotes (>), tables
  text = text.replace(/^[#*-]|\d+\.\s|^>\s/gm, "").replace(/\|.*?\|/g, "");

  // Remove inline Markdown formatting (**bold**, *italic*, _italic_)
  text = text.replace(/(\*\*|__|\*|_)(.*?)\1/g, "$2");

  // Remove HTML tags & comments. Patterns intentionally match unclosed
  // forms via `(?:>|$)` / `(?:-->|$)` so an input ending mid-tag like
  // `…<script` or `…<!--abc` is fully stripped in a single pass (without
  // this, CodeQL's incomplete-multi-character-sanitization rule fires
  // because the regex is judged locally and doesn't see downstream
  // cleanup). Loop until idempotent to also catch nested payloads like
  // `<scr<script>ipt>`.
  let prev: string;
  do {
    prev = text;
    text = text.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
    text = text.replace(/<[^>]*(?:>|$)/g, "");
  } while (text !== prev);

  // Remove URLs (http:// or https://)
  text = text.replace(/https?:\/\/[^\s/$.?#].[^\s]*/g, "");

  return text;
}

/**
 * Version for word counting that tokenizes CJK characters as individual words.
 */
export function getPurePostTextForWordCount(text: string) {
  text = getPurePostText(text);
  // Treat each CJK character as a separate word for counting
  text = text.replace(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, " $& ");
  return text;
}

/**
 * Word count of a post body, as shown in the entry stats bar.
 */
export function countPostWords(body: string): number {
  return getPurePostTextForWordCount(body)
    .trim()
    .split(/\s+/)
    .filter((word) => word).length;
}
