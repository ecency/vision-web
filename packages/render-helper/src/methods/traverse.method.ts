import { a } from './a.method'
import { iframe } from './iframe.method'
import { img } from './img.method'
import { p } from './p.method'
import { text } from './text.method'
import { video } from './video.method'
import { isHiddenElement } from './render-boundary.method'
import { RenderOptions, SeoContext } from '../types'

// Explicit nesting cap (#1920). Real posts stay far below it. Past it the
// subtree is reduced to its plain text instead of being walked further: the
// JS engine's stack limit is never reached, the rest of the body is still
// transformed, and nothing below the cap ships untransformed (an image, link
// or iframe there would otherwise skip img()/a()/iframe()).
// 2000 stays well inside every engine's stack for this one-frame-per-level
// walk (develop rendered 5000 nested divs) and above what hundreds of unclosed
// tags in a real body nest to.
export const MAX_TRAVERSE_DEPTH = 2000

function flattenToText(node: Node): void {
  // traverse() also visits text and comment nodes; those are already inert.
  if (node.nodeType !== 1) return
  const text = node.textContent || ''
  while (node.firstChild) {
    node.removeChild(node.firstChild)
  }
  if (text && node.ownerDocument) {
    node.appendChild(node.ownerDocument.createTextNode(text))
  }
}

export function traverse(node: Node, forApp: boolean, depth = 0, state = { firstImageFound: false }, parentDomain: string = 'ecency.com', seoContext?: SeoContext, renderOptions?: RenderOptions): void {
  if (!node || !node.childNodes) {
    return
  }
  if (depth > MAX_TRAVERSE_DEPTH) {
    flattenToText(node)
    return
  }

  // Walk siblings using nextSibling instead of indexing into the live NodeList.
  // node.childNodes is live: when a handler removes or replaces a child the
  // indices shift, causing index-based loops to skip nodes. Capturing
  // nextSibling before running handlers gives a stable "next" pointer that
  // isn't affected by mutations to the current child.
  let child = node.firstChild
  while (child) {
    const next = child.nextSibling
    const prev = child.previousSibling

    // script/style and malformed names never reach the output
    // (render-boundary), so there is nothing to transform inside them.
    if (child.nodeType === 1 && isHiddenElement(child)) {
      child = next
      continue
    }

    if (child.nodeName.toLowerCase() === 'a') {
      a(<HTMLElement>child, forApp, parentDomain, seoContext, renderOptions)
    }
    if (child.nodeName.toLowerCase() === 'iframe') {
      iframe(<HTMLElement>child, parentDomain, forApp, renderOptions)
    }
    if (child.nodeName === '#text') {
      text(<HTMLElement>child, forApp, renderOptions)
    }
    if (child.nodeName.toLowerCase() === 'img') {
      img(<HTMLElement>child, state, forApp, renderOptions)
    }
    if (child.nodeName.toLowerCase() === 'p') {
      p(<HTMLElement>child)
    }
    if (child.nodeName.toLowerCase() === 'video') {
      video(<HTMLElement>child)
    }

    if (child.parentNode) {
      // Child is still in the DOM — recurse into it normally
      traverse(child, forApp, depth + 1, state, parentDomain, seoContext, renderOptions)
    } else {
      // Child was removed or replaced by a handler. If a replacement was
      // inserted (e.g. text() wraps a URL in <span>, a() swaps a tweet link
      // for <blockquote>), it now sits between `prev` and `next` in the live
      // childNodes. Detect it by comparing next.previousSibling to the
      // captured `prev` — if they differ a new node was inserted.
      const possibleReplacement = next ? next.previousSibling : node.lastChild
      if (possibleReplacement && possibleReplacement !== prev && possibleReplacement.parentNode === node) {
        traverse(possibleReplacement, forApp, depth + 1, state, parentDomain, seoContext, renderOptions)
      }
    }

    child = next
  }
}
