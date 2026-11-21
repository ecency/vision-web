import type { Remarkable } from 'remarkable'

type Token = { type: string; level?: number; content?: string; children?: Token[] }
type CoreState = { tokens: Token[] }
type CoreRule = (state: CoreState) => unknown
type RuleList = { __rules__: Array<{ name: string; fn: CoreRule }>; at: (name: string, fn: CoreRule) => void }

// Remarkable's linkify core rule tests a text token with this before running
// the autolinker on it (remarkable/linkify LINK_SCAN_RE).
const LINK_SCAN_RE = /www|@|:\/\//
const isLinkOpen = (str: string) => /^<a[>\s]/i.test(str)
const isLinkClose = (str: string) => /^<\/a\s*>/i.test(str)

/**
 * Makes Remarkable's linkify rule linear in the number of links (#2183).
 *
 * The rule replaces each linkified text token by rebuilding the paragraph's
 * whole child list, so a paragraph with many links is quadratic. This wrapper
 * picks the text tokens the rule would read, by the rule's own skipping (the
 * content of markdown links and of HTML `<a>` tags is left alone), hands the
 * original rule those tokens at once, each as a one-token paragraph, and then
 * splices each result back in a single pass. The rule still does all the
 * linking, so the output is the same token for token.
 *
 * Install after `.use(linkify)` and before any other wrapper of the rule.
 */
export function linearLinkify(md: Remarkable): void {
  const ruler = (md as unknown as { core: { ruler: RuleList } }).core.ruler
  const rule = ruler.__rules__.find((r) => r.name === 'linkify')
  if (!rule) return
  const original = rule.fn
  ruler.at('linkify', (state: CoreState) => {
    const picked: Array<{ block: Token; at: number; single: Token }> = []
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue
      const tokens = block.children
      let htmlLinkLevel = 0
      // The rule's own walk, from the end, so the skips match exactly.
      for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i]
        if (token.type === 'link_close') {
          i--
          while (tokens[i].level !== token.level && tokens[i].type !== 'link_open') i--
          continue
        }
        if (token.type === 'htmltag') {
          if (isLinkOpen(token.content ?? '') && htmlLinkLevel > 0) htmlLinkLevel--
          if (isLinkClose(token.content ?? '')) htmlLinkLevel++
        }
        if (htmlLinkLevel > 0) continue
        if (token.type === 'text' && LINK_SCAN_RE.test(token.content ?? '')) {
          picked.push({ block, at: i, single: { type: 'inline', children: [token] } })
        }
      }
    }
    if (picked.length === 0) return
    original({ ...state, tokens: picked.map((p) => p.single) })
    // Each block's replacements, then one rebuild per block.
    const byBlock = new Map<Token, Map<number, Token[]>>()
    for (const p of picked) {
      const nodes = p.single.children ?? []
      if (nodes.length === 1 && nodes[0] === p.block.children![p.at]) continue
      let replacements = byBlock.get(p.block)
      if (!replacements) byBlock.set(p.block, (replacements = new Map()))
      replacements.set(p.at, nodes)
    }
    for (const [block, replacements] of byBlock) {
      const rebuilt: Token[] = []
      const children = block.children!
      for (let i = 0; i < children.length; i++) {
        const nodes = replacements.get(i)
        if (nodes) {
          for (const node of nodes) rebuilt.push(node)
        } else {
          rebuilt.push(children[i])
        }
      }
      block.children = rebuilt
    }
  })
}
