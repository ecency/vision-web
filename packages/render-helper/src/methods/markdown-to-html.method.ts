import { traverse } from './traverse.method'
import { sanitizeHtml } from './sanitize-html.method'
import { moveBlockClosingTagOutOfParagraph, removeDuplicateAttributes } from '../helper'
import { DOMParser, XMLSerializer, ENTITY_REGEX } from '../consts'
import { Remarkable } from 'remarkable'
import { linkify } from 'remarkable/linkify'
import * as htmlparser2 from 'htmlparser2'
import * as domSerializerModule from 'dom-serializer'
import { RenderOptions, SeoContext } from '../types'

const domSerializer = (domSerializerModule as any).default || domSerializerModule

// Conditionally load lolight for syntax highlighting (Node.js only)
// Browser builds will gracefully handle missing lolight by using fallback
type Lolight = typeof import('lolight').default
let lolightPromise: Promise<Lolight | null> | null = null
let lolightModule: Lolight | null = null

async function loadLolight() {
  if (typeof window !== 'undefined') {
    // Skip in browser environment
    return null
  }

  if (lolightModule) {
    return lolightModule
  }

  if (!lolightPromise) {
    lolightPromise = import('lolight')
      .then((mod) => {
        lolightModule = mod.default || mod
        return lolightModule
      })
      .catch(() => {
        lolightModule = null
        return null
      })
  }

  return lolightPromise
}

// Synchronous wrapper for backward compatibility
function getLolightInstance() {
  return lolightModule
}

// Pre-load lolight when module is imported (Node.js only)
if (typeof window === 'undefined') {
  loadLolight().catch(() => {
    // Silently fail if lolight is not available
  })
}

/**
 * Fixes block-level HTML tags that Remarkable incorrectly wraps inside <p> tags.
 *
 * Problem: When Remarkable encounters block-level HTML tags (like <center>, <div>)
 * with blank lines after them, it generates malformed HTML like:
 *   <p><center></p>
 *   <p>content</p>
 *   <p></center></p>
 *
 * This function repairs such patterns by:
 * 1. Extracting block-level tags from paragraph wrappers
 * 2. Removing empty paragraphs created by this mismatch
 *
 * @param html - The HTML string to fix
 * @returns The repaired HTML string
 */
// Block-level tags that should never be wrapped in <p> tags. Defined at
// module scope so the alternation string and the Set used by the
// non-regex closing pass stay in sync.
const BLOCK_TAGS_ALTERNATION = 'center|div|table|figure|section|article|aside|header|footer|nav|main'
const BLOCK_TAGS_SET = new Set(BLOCK_TAGS_ALTERNATION.split('|'))

function fixBlockLevelTagsInParagraphs(html: string): string {
  // Pattern 1: <p><tag></p> - opening tag wrapped in <p>
  // Replace with just <tag> (remove the wrapping <p>)
  const openingPattern = new RegExp(`<p>(<(?:${BLOCK_TAGS_ALTERNATION})(?:\\s[^>]*)?>)<\\/p>`, 'gi')
  html = html.replace(openingPattern, '$1')

  // Pattern 2: <p></tag></p> - closing tag wrapped in <p>
  // Replace with just </tag> (remove the wrapping <p>)
  const closingPattern = new RegExp(`<p>(<\\/(?:${BLOCK_TAGS_ALTERNATION})>)<\\/p>`, 'gi')
  html = html.replace(closingPattern, '$1')

  // Pattern 3: <p><tag><br> or <p><tag> at start of <p>
  // This handles cases where the tag is at the start but followed by content
  const startPattern = new RegExp(`<p>(<(?:${BLOCK_TAGS_ALTERNATION})(?:\\s[^>]*)?>)(?:<br>)?\\s*`, 'gi')
  html = html.replace(startPattern, '$1<p>')

  // Pattern 4: </tag></p> or <br>\n</tag></p> - closing tag at end of <p>
  // Done as a single linear pass instead of a regex. The previous form
  // `\s*(?:<br>)?\s*(<\/(?:…)>)<\/p>` had two unanchored `\s*`
  // quantifiers that backtracked quadratically on whitespace-heavy
  // inputs with no matching closing tag.
  html = moveBlockClosingTagOutOfParagraph(html, BLOCK_TAGS_SET)

  // Clean up any empty paragraphs that may have been created
  html = html.replace(/<p>\s*<\/p>/g, '')
  html = html.replace(/<p><br>\s*<\/p>/g, '')

  return html
}

export function markdownToHTML(input: string, forApp: boolean, parentDomain: string = 'ecency.com', seoContext?: SeoContext, renderOptions?: RenderOptions): string {
  // Internalize leofinance.io links
  input = input.replace(new RegExp("https://leofinance.io/threads/view/","g"), "/@");
  input = input.replace(new RegExp("https://leofinance.io/posts/","g"), "/@");
  input = input.replace(new RegExp("https://leofinance.io/threads/","g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/threads/view/","g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/posts/","g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/threads/","g"), "/@");


  const md = new Remarkable({
    html: true,
    breaks: true,
    typographer: false,
    highlight: function (str: string) {
      const lolightInstance = getLolightInstance()
      if (!lolightInstance) {
        // Fallback when lolight is not available
        return str
      }

      try {
        const tokens = lolightInstance.tok(str);
        return tokens.map(
          (token: string[]) => `<span class="ll-${token[0]}">${token[1]}</span>`
        ).join('')
      } catch (err) { console.error(err) }

      return str
    }
  }).use(linkify)
  md.core.ruler.enable([
    'abbr'
  ]);
  md.block.ruler.enable([
    'footnote',
    'deflist'
  ]);
  md.inline.ruler.enable([
    'footnote_inline',
    'ins',
    'mark',
    'sub',
    'sup'
  ]);
  const serializer = new XMLSerializer()

  if (!input) {
    return ''
  }

  let output = '';

  // Replace entities with deterministic placeholders to preserve them during rendering
  const entities = input.match(ENTITY_REGEX);
  const entityPlaceholders: string[] = [];

  if (entities && forApp) {
    // Deduplicate entities to avoid duplicate placeholders
    const uniqueEntities = [...new Set(entities)];
    uniqueEntities.forEach((entity, index) => {
      // Use markdown-inert Unicode placeholder (zero-width spaces)
      const placeholder = `\u200B${index}\u200B`;
      entityPlaceholders.push(entity);
      // Replace all occurrences of this entity
      input = input.split(entity).join(placeholder);
    })
  }


  try {
    output = md.render(input)

    // Fix malformed block-level HTML tags that Remarkable wraps in <p> tags
    // This prevents "Opening and ending tag mismatch" errors from DOMParser
    output = fixBlockLevelTagsInParagraphs(output)

    const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(output)}</body>`, 'text/html')

    traverse(doc as any, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions)

    output = serializer.serializeToString(doc)
  } catch (error) {
    // @xmldom/xmldom is stricter than old xmldom and throws ParseError for malformed HTML
    // Instead of returning empty string (bad UX), attempt graceful recovery
    try {
      // Strategy:
      // 1. Pre-sanitize to remove XSS vectors
      // 2. Use lenient htmlparser2 to auto-repair malformed HTML (auto-close unclosed tags)
      // 3. Serialize the repaired HTML
      // 4. Re-parse with @xmldom/xmldom (now well-formed)
      // 5. Traverse and serialize as normal
      // Reuse the markdown output already produced before the failing
      // DOMParser pass — `md.render(input)` is the expensive step and
      // re-running it costs ~100 ms per fallback hit on a 60 KB body.
      const preSanitized = sanitizeHtml(output, renderOptions)

      // Use htmlparser2 to parse malformed HTML leniently
      const dom = htmlparser2.parseDocument(preSanitized, {
        // lenient options - don't throw on malformed HTML
        lowerCaseTags: false,
        lowerCaseAttributeNames: false,
      })

      // Serialize back to well-formed HTML (htmlparser2 auto-closes tags)
      const repairedHtml = domSerializer(dom.children)

      // Now parse the well-formed HTML with @xmldom/xmldom
      const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(repairedHtml)}</body>`, 'text/html')

      traverse(doc as any, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions)

      output = serializer.serializeToString(doc)
    } catch (fallbackError) {
      // If DOM parsing fails, sanitize the Remarkable HTML output directly.
      // This skips the traverse() image proxy/link rewriting but preserves
      // readable HTML content instead of showing escaped tags.
      output = sanitizeHtml(output || md.render(input), renderOptions)
    }
  }

  // Restore original entities from placeholders
  if (forApp && output && entityPlaceholders.length > 0) {
    entityPlaceholders.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      // Replace all occurrences of the placeholder
      output = output.split(placeholder).join(entity);
    })
  }

  output = output
    .replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, '')
    // Strip full HTML document wrapper (native browser DOMParser wraps in <html><head><body>)
    .replace(/^<\?xml[^?]*\?>/, '')
    .replace(/^<!DOCTYPE[^>]*>/i, '')
    .replace(/<\/?html[^>]*>/g, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/g, '')
    .replace('<body id="root">', '')
    .replace('</body>', '')
    .trim()

  return sanitizeHtml(output, renderOptions)
}
