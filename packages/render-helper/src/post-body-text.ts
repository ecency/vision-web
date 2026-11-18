import { decodeEntities, makeEntryCacheKey } from './helper'
import { entryMemoGet, entryMemoSet, MEMO_MISS } from './cache'
import { Entry } from './types'
import { cleanReply } from './methods/clean-reply.method'
import { codeRanges } from './methods/code-ranges.method'

/**
 * A post's summary text without the markdown renderer (#2113), for feed cards
 * and anything else that runs in the browser bundle of a feed. It reads the
 * markdown syntax a summary needs to drop with a few line-level patterns, then
 * applies the same steps as getPostBodySummary (tags stripped, URLs removed,
 * whitespace collapsed, cut at a word boundary, entities decoded once). On
 * recent posts it gives the same text in the large majority of cases; where it
 * differs it is in markup a summary barely shows (footnotes, tables, nested
 * emphasis). Server-side callers that need the exact rendered text keep
 * getPostBodySummary.
 *
 * Every pattern is anchored per line or bounded by a character class that
 * excludes its own delimiter, so each pass is linear.
 */

// An escaped character, set aside before the markdown patterns so `\*x\*`
// is never read as emphasis (a private-use pair around its index), and shown
// as the character at the end.
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!>~|])/g
const ESCAPE_SLOT = /\uE000(\d+)\uE001/g

function markdownToText(source: string): string {
  const escaped: string[] = []
  // A body that already holds the private-use pair keeps its text as written.
  const md = /[\uE000\uE001]/.test(source)
    ? source
    : source.replace(ESCAPED, (_m, c: string) => `\uE000${escaped.push(c) - 1}\uE001`)
  return (
    md
      .replace(/\r\n?/g, '\n')
      // Fence lines go, the code inside stays as text (as the renderer shows it).
      .replace(/^ {0,3}(?:```|~~~)[^\n]*$/gm, '')
      // Reference definitions are not shown.
      .replace(/^ {0,3}\[[^\]\n]+\]:[ \t]*\S[^\n]*$/gm, '')
      // Images render as <img>, which has no text.
      .replace(/!\[[^[\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '')
      .replace(/!\[[^[\]\n]*\]\[[^[\]\n]*\]/g, '')
      // Links keep their label.
      .replace(/\[([^[\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
      .replace(/\[([^[\]\n]*)\]\[[^[\]\n]*\]/g, '$1')
      // Autolinks are URLs, removed below with the rest.
      .replace(/<((?:https?|ftp):\/\/[^<>\s]+)>/gi, '$1')
      // Block markers at the start of a line: quotes, headings, list items.
      .replace(/^[ \t]*(?:>[ \t]?)+/gm, '')
      .replace(/^[ \t]*#{1,6}(?:[ \t]+|$)/gm, '')
      // Rules on both sides of the list markers: before, so `* * *` does not
      // lose its first `*` as a list item; after, for a rule inside a list
      // item (`1. ***`).
      .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')
      .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/gm, '')
      .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')
      // Setext underlines and table separator rows.
      .replace(/^[ \t]*=+[ \t]*$/gm, '')
      // A separator row: three dashes, or a leading pipe and a dash (`|-|-|`).
      // A data row of only dashes (`| - |`) goes too, which a summary can spare.
      .replace(/^[ \t|:-]+$/gm, (row) => (row.includes('---') || (/^[ \t]*\|/.test(row) && row.includes('-')) ? '' : row))
      // Table cell borders, on lines that are table rows.
      .replace(/^[ \t]*\|[^\n]*$/gm, (row) => row.replace(/\|/g, ' '))
      // Emphasis and strike delimiters (one to three `*` or `_`, or `~~`): a
      // run at the start of a word (after any non-word character or the line
      // start) or at its end (before one, or the line end). Never paired across
      // the line, which backtracks; `5 * 3` and `snake_case` keep their characters.
      .replace(/(^|[^\w*_~])(?:[*_]{1,3}|~~)(?=[^\s*_~])/gm, '$1')
      .replace(/([^\s*_~])(?:[*_]{1,3}|~~)(?=$|[^\w*_~])/gm, '$1')
      .replace(/`+/g, '')
      // Escaped characters show as themselves.
      .replace(ESCAPE_SLOT, (_m, i: string) => escaped[Number(i)] ?? '')
  )
}

/**
 * HTML comments and tag-shaped text removed, nothing else: a `<` that opens no
 * tag (`a < b`, `<3`) is text, as the renderer shows it. The result is plain
 * text for a text node, never HTML. Comments are found
 * with indexOf, one pass; an unclosed one hides the rest, as in a browser.
 */
function stripTags(text: string): string {
  let out = ''
  let at = 0
  for (;;) {
    const open = text.indexOf('<!--', at)
    if (open === -1) {
      out += text.slice(at)
      break
    }
    out += text.slice(at, open)
    const close = text.indexOf('-->', open + 4)
    if (close === -1) break
    at = close + 3
  }
  return dropTags(out)
}

const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')

/**
 * One left-to-right scan: a tag (`<` + optional `/` + letter, up to the next
 * `>` with no `<` before it) is skipped whole; any other `<` that would start
 * a tag (left by one tag split by another, `<scr<b>ipt>`) is dropped alone,
 * unless no `>` follows anywhere, when it is text. Its output never holds a
 * raw `<` before a letter, `/` or `!`: a `<` kept as text goes out as an
 * entity, decoded with the rest later. Linear: the search for `>` stops at
 * the next `<`, and each character is pushed and popped at most once.
 */
function dropTags(text: string): string {
  // Characters in an array: dropping the last kept `<` is a pop, not a copy.
  const out: string[] = []
  // Past the last `>` no tag can be completed, so a `<` there is text
  // (`a<b`), as the renderer shows it. It goes out as an entity (decoded with
  // the rest later), which the pop below never takes.
  const lastGt = text.lastIndexOf('>')
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c !== '<') {
      // A kept `<` that a removed tag has now put before a letter, `/` or `!`
      // would read as an opener: it goes.
      if (isLetter(c) || c === '/' || c === '!') {
        while (out[out.length - 1] === '<') out.pop()
      }
      out.push(c)
      i++
      continue
    }
    const next = text[i + 1] ?? ''
    const opensTag = isLetter(next) || (next === '/' && isLetter(text[i + 2] ?? ''))
    if (opensTag && i > lastGt) {
      out.push('&lt;')
      i++
      continue
    }
    if (opensTag) {
      let j = i + 1
      while (j < text.length && text[j] !== '>' && text[j] !== '<') j++
      // A whole tag is skipped; an opener with no `>` before the next `<` is
      // dropped alone and the scan goes on from the character after it.
      i = text[j] === '>' ? j + 1 : i + 1
      continue
    }
    if (i > lastGt) {
      out.push('&lt;')
    } else if (next !== '/' && next !== '!') {
      out.push(c)
    }
    i++
  }
  return out.join('')
}

const joint = (arr: string[], limit = 200) => {
  let result = ''
  for (let i = 0; i < arr.length; i++) {
    if (result) {
      result += ' '
    }
    if (result.length > limit) {
      break
    }
    if ((result + arr[i]).length < limit + 10) {
      result += arr[i]
    } else {
      break
    }
  }
  return result.trim()
}

// Inside code the renderer escapes markup, so a summary shows `<div>` there
// as written: its `<` becomes an entity here (decoded with the rest at the
// end), and the tag pass below leaves it alone.
function protectCode(md: string): string {
  const ranges = codeRanges(md)
  if (ranges.length === 0) return md
  const parts: string[] = []
  let from = 0
  for (const [start, end] of ranges) {
    if (start < from) continue
    parts.push(md.slice(from, start), md.slice(start, end).replace(/</g, '&lt;'))
    from = end
  }
  parts.push(md.slice(from))
  return parts.join('')
}

function postBodyText(body: string, length: number): string {
  if (!body) {
    return ''
  }
  // The renderer escapes `"` and a bare `&` in text, and the summary is cut
  // before entities are decoded, so the cut lands where it does there.
  const escaped = markdownToText(protectCode(cleanReply(body)))
    .replace(/&(?!#?[A-Za-z0-9]+;)/g, '&amp;')
    .replace(/"/g, '&quot;')
  let text = stripTags(escaped)
    .replace(/\r?\n|\r/g, ' ')
    .replace(/(?:https?|ftp):\/\/[\n\S]+/g, '')
    .trim()
    // Tabs too: the rendered summary shows any run of them as one space.
    .replace(/[ \t]{2,}|\t/g, ' ')
  if (length > 0) {
    text = joint(text.split(' '), length)
  }
  return text ? decodeEntities(text) : text
}

/**
 * Summary text of an entry or a raw body, without the markdown renderer.
 * `length` 0 means no truncation, as in getPostBodySummary.
 */
export function getPostBodyText(obj: Entry | string, length = 200): string {
  if (typeof obj === 'string') {
    return postBodyText(obj, length)
  }
  const key = `${makeEntryCacheKey(obj)}-text-${length}`
  const item = entryMemoGet<string>(key, obj.body)
  if (item !== MEMO_MISS) {
    return item
  }
  const res = postBodyText(obj.body, length)
  entryMemoSet(key, obj.body, undefined, res)
  return res
}
