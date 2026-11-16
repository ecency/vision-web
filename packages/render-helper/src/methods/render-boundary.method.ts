import type { Node as XmlNode } from '@xmldom/xmldom'

/**
 * Output boundary for full renders (#1919).
 *
 * The DOM transforms only ever see what xmldom parsed as elements, but the
 * final sanitizer is xss, which re-tokenizes the serialized string. Anything
 * the two read differently used to ship untransformed: markup inside
 * `<script>`/`<style>` raw text, CDATA, processing instructions or comments,
 * and elements whose name xmldom and xss split differently (`<img x>`).
 *
 * So the render stamps every element it serializes with a random per-render
 * nonce (`data-rh`). The final sanitizer trusts render-helper's own link
 * markers and link policy only on tags carrying that nonce; everything else
 * xss finds was hidden from the transforms and gets the untransformed rules.
 * The nonce is fresh per render and never derived from the body, so an author
 * cannot forge it, and `data-rh` is not whitelisted, so xss removes it.
 */

export const RENDER_NONCE_ATTRIBUTE = 'data-rh'

const VALID_ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9:_.-]*$/

/**
 * Attribute names xss keeps as written. xss strips every other character from
 * a name before its whitelist lookup, so a name outside this set comes out as
 * a different attribute than the one the DOM transforms saw.
 */
export const VALID_ATTRIBUTE_NAME = /^[A-Za-z0-9_:.-]+$/

/**
 * The exact shape xmldom gives a serialized element: a valid name, then only
 * `name="value"` pairs with names xss keeps as written. A stamped tag is
 * trusted only when its raw source (as xss hands it to onTag) has this shape;
 * anything else means xss would read different attributes than the DOM held.
 *
 * This boundary assumes xmldom 0.9.12 serialisation and xss 1.0.15
 * tokenisation. Bumping either must re-run the differential fuzz and the
 * corpus differential (see the package README).
 */
const STRICT_STAMPED_TAG = /^<[A-Za-z][A-Za-z0-9:_.-]*(?:\s+[A-Za-z0-9_:.-]+="[^"]*")*\s*\/?>$/

export function isStrictTag(rawTag: string): boolean {
  return STRICT_STAMPED_TAG.test(rawTag)
}
const WRAPPER_ELEMENTS = new Set(['html', 'head', 'body'])

/** Elements the transforms must not walk and the output must not contain. */
export function isHiddenElement(node: Node): boolean {
  const name = node.nodeName
  if (!VALID_ELEMENT_NAME.test(name)) return true
  const local = name.toLowerCase().replace(/^.*:/, '')
  return local === 'script' || local === 'style'
}

export function createRenderNonce(): string {
  const cryptoApi = typeof globalThis !== 'undefined'
    ? (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto
    : undefined
  const words = new Uint32Array(4)
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(words)
  } else {
    for (let i = 0; i < words.length; i++) words[i] = Math.floor(Math.random() * 0x100000000)
  }
  return `rh${Array.from(words, (w) => w.toString(36)).join('')}`
}

// Stands in for a node that must not reach the output. xss removes comments,
// so it disappears in the final pass, but until then it holds the node's
// place: the end-of-render trim() and the whitespace around it come out
// exactly as when the node itself was serialized and then dropped by xss.
const DROPPED = '<!---->'

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * xmldom serializer node filter: skips what must not reach the output and
 * stamps every element it does emit. Nothing in the tree is moved or removed
 * (xmldom rebuilds child lists on every removal, which made a body of
 * thousands of comments quadratic). A string return is written verbatim.
 */
/**
 * renderNodeFilter as xmldom's `serializeToString` types its filter. xmldom
 * writes a string return verbatim at runtime (the boundary relies on it), but
 * its typings declare only `Node | null | undefined`, so this is the one place
 * the two signatures are reconciled.
 */
export function xmldomNodeFilter(nonce: string): (node: XmlNode) => XmlNode | null | undefined {
  return renderNodeFilter(nonce) as unknown as (node: XmlNode) => XmlNode | null | undefined
}

export function renderNodeFilter(nonce: string): (node: Node) => Node | string {
  return (node: Node) => {
    switch (node.nodeType) {
      case 1: {
        if (isHiddenElement(node)) return DROPPED
        // Same guard as stripAuthorMarkers: an attribute xss would rename
        // never reaches the output on a stamped element.
        const el = node as Element
        for (const attr of Array.from(el.attributes)) {
          if (!VALID_ATTRIBUTE_NAME.test(attr.name)) el.removeAttributeNode(attr)
        }
        if (!WRAPPER_ELEMENTS.has(node.nodeName.toLowerCase())) {
          ;(node as Element).setAttribute(RENDER_NONCE_ATTRIBUTE, nonce)
        }
        return node
      }
      case 4: // CDATA: its content is text
        return escapeText(node.nodeValue || '')
      case 7: // processing instruction
      case 8: // comment
      case 10: // doctype
        return DROPPED
      default:
        return node
    }
  }
}
