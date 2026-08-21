import { decodeEntities, makeEntryCacheKey, stripHtmlTags } from './helper'
import { cacheGet, cacheSet } from './cache'
import { Entry } from './types'
import { cleanReply } from './methods'
import { ENTITY_REGEX } from './consts'
import { Remarkable } from 'remarkable'

// Reused across all calls — config is constant and Remarkable construction
// (rule registration via ruler.enable) is non-trivial under SSR fan-out.
//
// linkify is intentionally omitted: the post-processing pass below strips bare
// URLs from the final text, so auto-linking them just to discard the <a>
// wrapper is wasted CPU during SSR.
const summaryRenderer = new Remarkable({
  html: true,
  breaks: true,
  typographer: false,
})
summaryRenderer.core.ruler.enable(['abbr'])
summaryRenderer.block.ruler.enable(['footnote', 'deflist'])
summaryRenderer.inline.ruler.enable([
  'footnote_inline',
  'ins',
  'mark',
  'sub',
  'sup',
])

const joint = (arr: string[], limit = 200) => {
  let result = '';
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      // join array with space separator
      if (result) {
        result += " ";
      }
      // break with length reaches limit
      if (result.length > limit) {
        break;
      } else {
        // make sure last join doesn't break the limit too much
        if ((result + arr[i]).length < limit + 10) {
          result += arr[i];
        } else {
          break;
        }
      }
    }
  }
  return result.trim();
};

/**
 * Generate a text summary from post body content
 * @param entryBody - The post body content to summarize
 * @param length - Maximum length of the summary (default: 200, use 0 for no truncation)
 * @param platform - Target platform: 'web' for browser/Node.js, 'ios'/'android' for React Native (default: 'web')
 *                   Controls entity/placeholder handling - 'web' skips placeholder substitution, other values enable it
 */
function postBodySummary(entryBody: string, length: number = 200, platform:'ios'|'android'|'web' = 'web'): string {
  if (!entryBody) {
    return ''
  }
  entryBody = cleanReply(entryBody)

  // Replace entities with deterministic placeholders to preserve them during rendering
  const entities = entryBody.match(ENTITY_REGEX);
  const entityPlaceholders: string[] = [];
  if (entities && platform !== 'web') {
    // Deduplicate entities to avoid duplicate placeholders
    const uniqueEntities = [...new Set(entities)];
    uniqueEntities.forEach((entity, index) => {
      // Use markdown-inert Unicode placeholder (zero-width spaces)
      const placeholder = `\u200B${index}\u200B`;
      entityPlaceholders.push(entity);
      // Replace all occurrences of this entity
      entryBody = entryBody.split(entity).join(placeholder);
    })
  }

  // Convert markdown to html
  let text = '';
  try {
    text = summaryRenderer.render(entryBody)
  } catch (err) {
    // Log error with context for debugging
    console.error('[postBodySummary] Failed to render markdown:', {
      error: err instanceof Error ? err.message : String(err),
      entryBodyLength: entryBody?.length || 0,
      platform
    })
    // Set empty text on error - caller receives empty summary
    text = ''
  }


  // Restore original entities from placeholders
  if (platform !== 'web' && entityPlaceholders.length > 0) {
    entityPlaceholders.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      // Replace all occurrences of the placeholder
      text = text.split(placeholder).join(entity);
    })
  }


  text = stripHtmlTags(text)
    .replace(/\r?\n|\r/g, ' ') // Remove new lines
    .replace(/(?:https?|ftp):\/\/[\n\S]+/g, '') // Remove urls
    .trim()
    // Collapse runs of 2+ spaces to a single space. Equivalent to the
    // previous `' +(?= )'` form (which deleted all-but-one space in a
    // run) but matches the whole run greedily without backtracking, so
    // it stays linear on long whitespace runs.
    .replace(/ {2,}/g, ' ')

  // Truncate if length > 0 (length === 0 means no truncation)
  if (length > 0) {
    text = joint(text.split(' '), length)
  }

  if (text) {
    text = decodeEntities(text) // decode html entities  
  }

  return text
}

/**
 * Generate a text summary from an Entry object or raw string
 * @param obj - Entry object or raw post body string
 * @param length - Maximum length of the summary (default: 200, use 0 for no truncation)
 * @param platform - Target platform: 'web' for browser/Node.js, 'ios'/'android' for React Native (default: 'web')
 *                   Controls entity/placeholder handling - 'web' skips placeholder substitution, other values enable it
 * @returns Text summary of the post body
 */
export function getPostBodySummary(obj: Entry | string, length?: number, platform?:'ios'|'android'|'web'): string {
  // Normalize parameters at function start for consistent behavior and caching
  const normalizedLength = length ?? 200
  const normalizedPlatform = platform || 'web'

  if (typeof obj === 'string') {
    return postBodySummary(obj as string, normalizedLength, normalizedPlatform)
  }

  const key = `${makeEntryCacheKey(obj)}-sum-${normalizedLength}-${normalizedPlatform}`

  const item = cacheGet<string>(key)
  if (item) {
    return item
  }

  const res = postBodySummary(obj.body, normalizedLength, normalizedPlatform)
  cacheSet(key, res)

  return res
}
