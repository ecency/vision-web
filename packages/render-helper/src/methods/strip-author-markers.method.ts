import { RENDER_HELPER_DATA_ATTRIBUTES, stripMarkdownClasses } from '../consts'
import { VALID_ATTRIBUTE_NAME, isHiddenElement } from './render-boundary.method'

const ELEMENT_NODE = 1

/**
 * Lower-cases an element's attribute names (the first spelling wins) and
 * drops render-helper's own link markers from it: `markdown-*` class tokens
 * and the `data-*` attributes the transforms set.
 *
 * xmldom keeps names as written, and its HTML-mode getAttribute/removeAttribute
 * do not fold case, so `CLASS=` / `DATA-AUTHOR=` / `SRC=` / `HREF=` slipped past
 * every transform that reads attributes by their lower-case name, and xss
 * lower-cases them on output where they took effect (#1919). Attribute nodes
 * are renamed here so every transform sees lower-case names.
 */
function normalizeElement(el: Element): void {
  const attrs = Array.from(el.attributes)
  const seen = new Set<string>()
  for (const attr of attrs) {
    const name = attr.name
    // xss deletes every character outside this set from an attribute name
    // before its whitelist lookup (`cléass` becomes `class`), while xmldom and
    // every transform see the name as written. Such an attribute would pass
    // the transforms unnoticed and come out as the name it spells.
    if (!VALID_ATTRIBUTE_NAME.test(name)) {
      el.removeAttributeNode(attr)
      continue
    }
    const lower = name.toLowerCase()
    if (seen.has(lower) || RENDER_HELPER_DATA_ATTRIBUTES.has(lower)) {
      seen.add(lower)
      el.removeAttributeNode(attr)
      continue
    }
    seen.add(lower)
    let value = attr.value
    if (lower === 'class') {
      value = stripMarkdownClasses(value)
      if (!value) {
        el.removeAttributeNode(attr)
        continue
      }
    }
    if (name !== lower) {
      el.removeAttributeNode(attr)
      el.setAttribute(lower, value)
    } else if (value !== attr.value) {
      el.setAttribute(lower, value)
    }
  }
}

/**
 * Lower-cases attribute names and strips render-helper's link markers on every
 * element before the DOM transforms run (#1919). CDATA, comments, processing
 * instructions, script/style and malformed element names are left in place
 * and kept out of the output by the serializer filter (render-boundary).
 *
 * Iterative over a snapshot of each child list: a recursive walk can run out
 * of stack on deep bodies, and xmldom's live lists made the old loop
 * quadratic.
 */
export function stripAuthorMarkers(doc: Document): void {
  const stack: Node[] = [doc]
  while (stack.length > 0) {
    const node = stack.pop() as Node
    const children = Array.from(node.childNodes || [])
    for (const child of children) {
      if (child.nodeType !== ELEMENT_NODE || isHiddenElement(child)) continue
      normalizeElement(child as Element)
      stack.push(child)
    }
  }
}
