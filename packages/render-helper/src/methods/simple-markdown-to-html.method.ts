import { Remarkable } from 'remarkable'
import { linkify } from 'remarkable/linkify'
import { sanitizeHtml } from './sanitize-html.method'
import { withoutLoneSurrogates } from '../helper'

let mdInstance: Remarkable | null = null

function getMd(): Remarkable {
  if (!mdInstance) {
    mdInstance = new Remarkable({
      html: true,
      breaks: true,
      typographer: false
    }).use(linkify)
  }
  return mdInstance
}

/**
 * Lightweight markdown-to-HTML conversion with sanitization.
 * Unlike the full `markdownToHTML`, this skips Hive-specific transforms
 * (image proxying, link internalizing, DOM traversal, etc.).
 *
 * Intended for editor input (TipTap), chat messages, and other contexts
 * where simple markdown rendering is sufficient.
 */
export function simpleMarkdownToHTML(input: string): string {
  if (!input) return ''

  // A lone surrogate becomes U+FFFD, as markdownToHTML reads it: the parser's
  // encodeURI throws on one (#2178).
  const html = getMd().render(withoutLoneSurrogates(input))
  return sanitizeHtml(html)
}
