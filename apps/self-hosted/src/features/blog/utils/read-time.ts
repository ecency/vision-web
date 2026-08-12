import { stripHtmlAndMarkdown } from './strip-markdown';

/**
 * Estimated reading minutes for a post body, computed at display time from
 * the raw markdown: the same stripping the text-to-speech button reads by,
 * 225 words a minute, and one shared estimator so a card and its article
 * header can never disagree. Nothing readable (an image-only post) answers
 * null instead of "0 min read".
 */
export function estimateReadMinutes(body: unknown): number | null {
  if (typeof body !== 'string') return null;
  const words = stripHtmlAndMarkdown(body)
    .split(/\s+/)
    .filter(Boolean).length;
  if (words === 0) return null;
  return Math.ceil(words / 225);
}
