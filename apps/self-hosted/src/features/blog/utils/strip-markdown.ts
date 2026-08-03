/**
 * Reduces a post body to plain prose.
 *
 * Post bodies arrive as raw markdown that may also contain HTML, so anything
 * that reads or measures the text has to strip both. Stripping HTML alone left
 * image URLs, link targets, `#` and `*` in the string, which the read-time
 * estimate counted as words and the text-to-speech button read out loud.
 */
export function stripHtmlAndMarkdown(text: string): string {
  return (
    text
      // Remove HTML tags
      .replace(/<[^>]*>/g, ' ')
      // Remove Markdown images ![alt](url)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // Remove Markdown links [text](url) - keep the text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Remove Markdown bold/italic **text**, *text*, __text__, _text_
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove Markdown headings # ## ### etc.
      .replace(/^#{1,6}\s+/gm, '')
      // Remove Markdown blockquotes >
      .replace(/^>\s*/gm, '')
      // Remove Markdown code blocks ```...```
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code `text`
      .replace(/`([^`]*)`/g, '$1')
      // Remove horizontal rules ---, ***, ___
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}
