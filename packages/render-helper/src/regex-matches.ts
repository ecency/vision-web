/**
 * Every match of `re` in `text`, in order: what `String.prototype.matchAll`
 * returns, without needing it. matchAll is ES2020 (Safari 13+), so it throws
 * on Safari 12 and on any engine without it (#1701).
 *
 * Runs on a global copy of `re`, so the caller's `lastIndex` is neither read
 * nor changed, and a pattern without the `g` flag is treated as global rather
 * than throwing. An empty match steps past one code point, as matchAll does.
 */
export function regexMatches(text: string, re: RegExp): RegExpExecArray[] {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  const unicode = copy.unicode || copy.flags.includes('v')
  const matches: RegExpExecArray[] = []
  let match: RegExpExecArray | null
  while ((match = copy.exec(text)) !== null) {
    matches.push(match)
    if (match[0] === '') {
      const code = text.charCodeAt(copy.lastIndex)
      const next = text.charCodeAt(copy.lastIndex + 1)
      const pair = unicode && code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
      copy.lastIndex += pair ? 2 : 1
    }
  }
  return matches
}
