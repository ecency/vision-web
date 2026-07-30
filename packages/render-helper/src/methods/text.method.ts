import { IMG_REGEX, YOUTUBE_REGEX, WHITE_LIST, DOMParser, POST_REGEX  } from '../consts'
import { extractYtStartTime, isValidPermlink, isValidUsername, sanitizePermlink } from '../helper'
import { proxifyImageSrc } from '../proxify-image-src'
import { linkify } from './linkify.method'
import {createImageHTML} from "./img.method";
import { RenderOptions } from "../types";

function hasAncestor(node: Node, tagNames: string[]): boolean {
  let current = node.parentNode
  while (current) {
    if (tagNames.includes(current.nodeName.toLowerCase())) {
      return true
    }
    current = current.parentNode
  }
  return false
}

/**
 * True when the node already sits inside a rendered `@user` / `#tag` chip.
 *
 * The `'a'` guard below is what normally stops a chip's own `@user` text from
 * being linkified again: traverse() recurses into the node text() inserted, so
 * without a stop condition the chip's label is re-linkified into a nested chip
 * on every pass, forever. With `RenderOptions.inertAuthorAndTagChips` the chip
 * is a `<span>`, which the tag-name guard does not catch, so match on the chip
 * classes instead. a.method.ts uses the same class-based "already processed"
 * signal.
 */
function hasChipAncestor(node: Node): boolean {
  let current: Node | null = node.parentNode
  while (current) {
    const el = current as HTMLElement
    const className =
      typeof el.getAttribute === 'function' ? el.getAttribute('class') : null
    if (className && (className.includes('er-author-link') || className.includes('er-tag-link'))) {
      return true
    }
    current = current.parentNode
  }
  return false
}

export function text(node: HTMLElement | null, forApp: boolean, renderOptions?: RenderOptions): void {
  if (!node || !node.parentNode) {
    return
  }

  // Skip text nodes inside links, inline code, or code blocks (check all ancestors)
  if (hasAncestor(node, ['a', 'code', 'pre']) || hasChipAncestor(node)) {
    return
  }

  const nodeValue = node.nodeValue || ''
  const linkified = linkify(nodeValue, forApp, renderOptions)
  if (linkified !== nodeValue) {
    const doc = DOMParser.parseFromString(
      `<span class="wr">${linkified}</span>`,
      'text/html'
    )
    const replaceNode = (doc as any).body?.firstChild || doc.firstChild

    if (replaceNode) {
      node.parentNode.insertBefore(replaceNode, node)
      node.parentNode.removeChild(node)
    }
    return
  }

  if (nodeValue.match(IMG_REGEX)) {
    const isLCP = false; // Traverse handles LCP; no need to double-count
    const imageHTML = createImageHTML(nodeValue, isLCP, forApp);
    const doc = DOMParser.parseFromString(imageHTML, 'text/html');
    const replaceNode = (doc as any).body?.firstChild || doc.firstChild
    if (replaceNode) {
      node.parentNode.replaceChild(replaceNode, node);
    }
    return; // Early return after replacing node
  }
  // If a youtube video
  if (nodeValue.match(YOUTUBE_REGEX)) {
    const e = YOUTUBE_REGEX.exec(nodeValue)
    if (e && e[1]) {
      const vid = e[1]
      const thumbnail = proxifyImageSrc(`https://img.youtube.com/vi/${vid.split('?')[0]}/hqdefault.jpg`, 0, 0, 'match')
      const embedSrc = `https://www.youtube.com/embed/${vid}?autoplay=1`
      const startTime = extractYtStartTime(nodeValue);

      // Create container paragraph
      const container = node.ownerDocument.createElement('p')

      // Create anchor element
      const anchor = node.ownerDocument.createElement('a')
      anchor.setAttribute('class', 'markdown-video-link markdown-video-link-youtube')
      anchor.setAttribute('data-embed-src', embedSrc)
      anchor.setAttribute('data-youtube', vid)
      if (startTime) {
        anchor.setAttribute('data-start-time', startTime)
      }

      // Create and append thumbnail image
      const thumbImg = node.ownerDocument.createElement('img')
      thumbImg.setAttribute('class', 'no-replace video-thumbnail')
      thumbImg.setAttribute('src', thumbnail)
      anchor.appendChild(thumbImg)

      // Create and append play button
      const play = node.ownerDocument.createElement('span')
      play.setAttribute('class', 'markdown-video-play')
      anchor.appendChild(play)

      // Assemble and replace
      container.appendChild(anchor)
      node.parentNode.replaceChild(container, node)
      return; // Early return after replacing node
    }
  }
  if (nodeValue && typeof nodeValue === 'string') {
    const postMatch = nodeValue.trim().match(POST_REGEX)
    if (postMatch && WHITE_LIST.includes(postMatch[1].replace(/^www\./,''))) {
      const tag = postMatch[2]
      const author = postMatch[3].replace('@', '')
      const permlink = sanitizePermlink(postMatch[4])

      // Validate tag to prevent attribute breakout XSS
      // Allow only alphanumeric, hyphens, and underscores
      if (!tag || !/^[a-z0-9_-]+$/i.test(tag)) return
      if (!isValidUsername(author)) return
      if (!isValidPermlink(permlink)) return

      const attrs = forApp ? `data-tag="${tag}" data-author="${author}" data-permlink="${permlink}" class="markdown-post-link"` : `class="markdown-post-link" href="/@${author}/${permlink}"`
      const doc = DOMParser.parseFromString(
        `<a ${attrs}>/@${author}/${permlink}</a>`,
        'text/html'
      )
      const replaceNode = (doc as any).body?.firstChild || doc.firstChild
      if (replaceNode) {
        node.parentNode.replaceChild(replaceNode, node)
      }
    }
  }
}
