import { YOUTUBE_REGEX, WHITE_LIST, DOMParser, POST_REGEX  } from '../consts'
import { markInternalThumbnail } from './internal-thumbnail'
import { extractYtStartTime, youtubeVideoLinkClass, isValidPermlink, isValidUsername, sanitizePermlink } from '../helper'
import { proxifyImageSrc } from '../proxify-image-src'
import { linkify } from './linkify.method'
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

const CHIP_CLASSES = ['er-author-link', 'er-tag-link']

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
 *
 * Only consulted on inert renders. `class` is author-writable (the sanitizer
 * allows it on `span` and runs *after* traverse), so a post body containing
 * `<span class="er-tag-link">@alice</span>` would otherwise let an author
 * suppress linkification, and the later bare-image and video enhancements, for
 * every reader on the default render path. Gating keeps that reachable only
 * where the inert chips actually need it. Tokens are compared exactly so
 * unrelated names like `custom-er-tag-link-label` do not match.
 */
function hasChipAncestor(node: Node): boolean {
  let current: Node | null = node.parentNode
  while (current) {
    const el = current as HTMLElement
    const className =
      typeof el.getAttribute === 'function' ? el.getAttribute('class') : null
    if (className && className.split(/\s+/).some((token) => CHIP_CLASSES.includes(token))) {
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
  if (hasAncestor(node, ['a', 'code', 'pre'])) {
    return
  }

  // Inert chips are spans, so they need the class-based guard too. Kept behind
  // the option so the default render path is untouched — see hasChipAncestor.
  if (renderOptions?.inertAuthorAndTagChips && hasChipAncestor(node)) {
    return
  }

  const nodeValue = node.nodeValue || ''
  // The node value is decoded text: `&lt;a data-author=..&gt;` in the body (or
  // `\<a ..\>` in markdown) arrives here as a literal `<a ...>`. It is parsed
  // as HTML below, so escape the angle brackets first or the author's text
  // becomes real markup with forged link markers (#1919). `&` stays as is: a
  // bare ampersand can only ever produce text, and image URLs carry it in
  // their query strings, which the proxy hashes byte for byte.
  const escaped = nodeValue.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linkified = linkify(escaped, forApp, renderOptions)
  if (linkified !== escaped) {
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

  // Image URLs were handled by linkify above (imageUrlEnd). A node it left
  // unchanged holds no URL whose path ends in an image extension, so it is not
  // turned into an image here either: IMG_REGEX also matched `.ico` inside
  // `.icons/readme` and proxied the whole node as an image.
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
      anchor.setAttribute('class', youtubeVideoLinkClass(e[0]))
      anchor.setAttribute('data-embed-src', embedSrc)
      anchor.setAttribute('data-youtube', vid)
      if (startTime) {
        anchor.setAttribute('data-start-time', startTime)
      }

      // Create and append thumbnail image
      const thumbImg = node.ownerDocument.createElement('img')
      thumbImg.setAttribute('class', 'no-replace video-thumbnail')
      markInternalThumbnail(thumbImg)
      thumbImg.setAttribute('src', thumbnail)
      anchor.appendChild(thumbImg)

      // Create and append play button
      const play = node.ownerDocument.createElement('span')
      play.setAttribute('class', 'markdown-video-play')
      anchor.appendChild(play)

      // Assemble and replace. Text around the URL stays where it was (the
      // card used to replace the whole text node).
      container.appendChild(anchor)
      // The match starts at `youtube.com/`; widen it to the whole
      // whitespace-delimited URL (scheme, www., trailing parameters).
      let start = e.index
      while (start > 0 && !/\s/.test(nodeValue[start - 1])) start--
      let end = e.index + e[0].length
      while (end < nodeValue.length && !/\s/.test(nodeValue[end])) end++
      const before = nodeValue.slice(0, start)
      const after = nodeValue.slice(end)
      const parent = node.parentNode
      if (before) parent.insertBefore(node.ownerDocument.createTextNode(before), node)
      if (after) parent.insertBefore(node.ownerDocument.createTextNode(after), node.nextSibling)
      parent.replaceChild(container, node)
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
