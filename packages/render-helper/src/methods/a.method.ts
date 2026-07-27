import {
  BITCHUTE_REGEX,
  CUSTOM_COMMUNITY_REGEX,
  INTERNAL_POST_REGEX,
  INTERNAL_POST_TAG_REGEX,
  D_TUBE_REGEX,
  D_TUBE_REGEX2,
  IMG_REGEX,
  IPFS_REGEX,
  MENTION_REGEX,
  INTERNAL_MENTION_REGEX,
  TOPIC_REGEX,
  INTERNAL_TOPIC_REGEX,
  POST_REGEX,
  CCC_REGEX,
  SPEAK_REGEX,
  SPEAK_AUDIO_REGEX,
  LIKETU_AUDIO_REGEX,
  TWITCH_REGEX,
  TWITTER_REGEX,
  VIMEO_REGEX,
  WHITE_LIST,
  YOUTUBE_REGEX,
  SPOTIFY_REGEX,
  RUMBLE_REGEX,
  BRIGHTEON_REGEX,
  ODYSEE_WATCH_REGEX,
  DOMParser,
  LOOM_REGEX,
  SECTION_LIST
} from '../consts'
import { getSerializedInnerHTML } from './get-inner-html.method'
import { proxifyImageSrc } from '../proxify-image-src'
import { removeChildNodes } from './remove-child-nodes.method'
import { extractYtStartTime, isValidPermlink, isValidUsername, sanitizePermlink, stripHtmlTags, trimTrailingSlash } from '../helper'
import { createImageHTML } from "./img.method";
import { RenderOptions, SeoContext } from '../types'

const NOFOLLOW_REPUTATION_THRESHOLD = 40;
const FOLLOW_PAYOUT_THRESHOLD = 5;

/**
 * Determines the rel attribute for external links based on SEO context.
 *
 * Default: "nofollow ugc noopener" for all user-generated external links.
 * Exception: "noopener" only (followed) when author reputation >= 40 AND post payout > $5.
 */
function getExternalLinkRel(seoContext?: SeoContext): string {
  if (
    seoContext?.authorReputation !== undefined &&
    seoContext?.postPayout !== undefined &&
    seoContext.authorReputation >= NOFOLLOW_REPUTATION_THRESHOLD &&
    seoContext.postPayout > FOLLOW_PAYOUT_THRESHOLD
  ) {
    return 'noopener';
  }
  return 'nofollow ugc noopener';
}

/**
 * Turns a video link into a player for the providers we cannot derive a
 * thumbnail for synchronously (BitChute, Rumble, Brighteon, Odysee). YouTube and
 * 3Speak stay hand-written because each carries provider-specific work (start
 * time, portrait detection, thumbnail from post metadata).
 *
 * The per-provider modifier class matters: both the stylesheet and the
 * click-to-play extension select on it, so an anchor carrying only the base
 * class is unstyled (zero height, no play icon) and unhandled — which is why a
 * posted BitChute link used to render as nothing at all.
 *
 * `embedVideosDirectly` (waves feed, self-hosted blog) mounts no client
 * enhancer, so there a placeholder would stay inert forever; emit a real iframe
 * instead, mirroring the YouTube branch. It is never autoplayed: a feed
 * scrolling past several videos that all start at once is disorienting.
 */
function renderPlainVideoLink(
  el: HTMLElement,
  provider: string,
  embedSrc: string,
  renderOptions?: RenderOptions
): void {
  const baseClass = `markdown-video-link markdown-video-link-${provider}`
  // Attribute order below matches what these branches emitted before they were
  // folded together, so the serialized-output fixtures stay stable.
  el.setAttribute('class', baseClass)
  el.removeAttribute('href')
  el.textContent = ''
  el.setAttribute('data-embed-src', embedSrc)

  if (renderOptions?.embedVideosDirectly) {
    const wrapper = el.ownerDocument.createElement('span')
    wrapper.setAttribute('class', 'er-embed-frame')
    wrapper.setAttribute('style', 'display:block')

    const frame = el.ownerDocument.createElement('iframe')
    frame.setAttribute('src', embedSrc)
    frame.setAttribute('title', 'Video player')
    frame.setAttribute(
      'allow',
      'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share'
    )
    frame.setAttribute('allowfullscreen', '')

    wrapper.appendChild(frame)
    el.appendChild(wrapper)
    // `er-embed` marks this as already enhanced so the click-to-play extension
    // skips it if both paths ever run over the same document.
    el.setAttribute('class', `${baseClass} er-embed`)
    return
  }

  const play = el.ownerDocument.createElement('span')
  play.setAttribute('class', 'markdown-video-play')
  el.appendChild(play)
}

const normalizeValue = (value?: string | null): string => (value ? value.trim() : '')

const matchesHref = (href: string, value?: string | null): boolean => {
  const normalizedHref = normalizeValue(href)
  if (!normalizedHref) {
    return false
  }

  return normalizeValue(value) === normalizedHref
}

/**
 * Normalizes display text for inline detection by:
 * - Stripping protocol and domain (ecency.com, peakd.com, hive.blog, leofinance.io, inleo.io, snapie.io, hivesuite.app)
 * - Removing leading/trailing slashes
 * - Removing query parameters
 * - Removing comment hashes (#@...)
 * - Converting to lowercase
 */
const normalizeDisplayText = (text: string): string => {
  const beforeTrailingSlash = text
    .trim()
    .replace(/^https?:\/\/(www\.)?(ecency\.com|peakd\.com|hive\.blog|leofinance\.io|inleo\.io|snapie\.io|hivesuite\.app)/i, "")
    .replace(/^\/+/, "")
    .split("?")[0]
    .replace(/#@.*$/i, "");
  return trimTrailingSlash(beforeTrailingSlash).toLowerCase();
}

/**
 * Enhanced inline detection that handles edge cases like:
 * - Full URLs: https://ecency.com/@author/permlink
 * - Relative URLs: /@author/permlink
 * - With community tags: hive-123456/@author/permlink
 * - With query params: @author/permlink?ref=twitter
 * - With trailing slashes: @author/permlink/
 */
const getInlineMeta = (el: HTMLElement, href: string, author: string, permlink: string, communityTag?: string) => {
  // Simple exact match (original behavior)
  const textMatches = matchesHref(href, el.textContent)
  const titleMatches = matchesHref(href, el.getAttribute('title'))

  // Sophisticated normalized matching
  const normalizedDisplay = normalizeDisplayText(el.textContent || "");
  const normalizedTarget = `@${author}/${permlink}`.toLowerCase();

  // Build expected display patterns
  const expectedDisplays = new Set([normalizedTarget]);
  if (communityTag) {
    expectedDisplays.add(`${communityTag.toLowerCase()}/${normalizedTarget}`);
  }

  const sophisticatedMatch =
    normalizedDisplay === normalizedTarget ||
    (communityTag ? normalizedDisplay === `${communityTag.toLowerCase()}/${normalizedTarget}` : false);

  return {
    textMatches,
    titleMatches,
    isInline: textMatches || titleMatches || sophisticatedMatch
  }
}

/**
 * Adds a line break before inline post links in mobile app mode
 * This ensures enhanced post links (where the raw URL is displayed) render on separate lines
 * in React Native where CSS display properties don't work the same way as in browsers
 */
const addLineBreakBeforePostLink = (el: HTMLElement, forApp: boolean, isInline: boolean): void => {
  if (forApp && isInline && el.parentNode) {
    const br = el.ownerDocument.createElement('br')
    el.parentNode.insertBefore(br, el)
  }
}

export function a(el: HTMLElement | null, forApp: boolean, parentDomain: string = 'ecency.com', seoContext?: SeoContext, renderOptions?: RenderOptions): void {
  if (!el || !el.parentNode) {
    return
  }
  let href = el.getAttribute('href')

  // Continue if href has no value
  if (!href) {
    return
  }

  // Positive scheme whitelist. Anything that isn't http(s)/mailto/hive/
  // tel/web+ext or a same-document/relative reference is stripped — this
  // rejects javascript:, data:, vbscript:, file: and also less-common
  // exploit vectors like ms-its:, mk:, res:, intent:. Case-insensitive
  // and tolerant of whitespace/control chars browsers ignore inside the
  // scheme (\t \n \r \f \v \0).
  // Runs before the author/tag short-circuit below: that short-circuit keys off
  // `class`, which an author can set on raw HTML, so it must not be reachable with
  // an unvalidated href.
  const trimmed = href.trim().replace(/[\t\n\r\f\v\0]/g, '').toLowerCase()
  const isSafeScheme = /^(https?|mailto|hive|tel|web\+[a-z0-9.+-]+):/i.test(trimmed)
  // `\/[^/]?` matches both bare `/` (site-root link) and `/path…`;
  // alongside protocol-relative `//host`, fragment `#…`, query `?…`,
  // and document-relative `name.ext`/`name/`/bare `name`.
  const isRelative = /^(\/\/|\/[^/]?|#|\?|[a-z0-9._\-]+(\/|$))/i.test(trimmed)
  if (!isSafeScheme && !isRelative) {
    el.removeAttribute('href')
    return
  }

  const className = el.getAttribute('class')

  // Don't re-process user and hashtag links (original or enhanced). The marker is an
  // attacker-writable attribute rather than proof the renderer built this link, so a
  // crafted `<a class="er-author" target="_blank" rel="opener">` would otherwise keep
  // its own rel and re-enable window.opener on the landing page. Skipping the rewrite
  // is fine; skipping the link policy is not, so re-assert it here.
  if (className && (
    ['markdown-author-link', 'markdown-tag-link'].includes(className) ||
    className.includes('er-author') ||
    className.includes('er-tag')
  )) {
    if (el.getAttribute('target')) {
      el.setAttribute('rel', getExternalLinkRel(seoContext))
    }
    return
  }

  // if href is an image url and innerHTML same with href then mark it as image
  // & => &amp; can break equality
  if (
    href.match(IMG_REGEX) &&
    href.trim().replace(/&amp;/g, '&') ===
    getSerializedInnerHTML(el).trim().replace(/&amp;/g, '&')
  ) {
    const isLCP = false; // LCP handled elsewhere
    const imgHTML = createImageHTML(href, isLCP, forApp);
    const doc = DOMParser.parseFromString(imgHTML, 'text/html');
    const replaceNode = (doc as any).body?.firstChild || doc.firstChild

    if (replaceNode && el.parentNode) {
      const importedNode = el.ownerDocument.importNode(replaceNode, true)
      el.parentNode.replaceChild(importedNode, el)
    }

    return
  }

  if (
    href.match(IPFS_REGEX) &&
    href.trim().replace(/&amp;/g, '&') ===
    getSerializedInnerHTML(el).trim().replace(/&amp;/g, '&') &&
    href.indexOf('#') === -1
  ) {
    if (forApp) {
      el.setAttribute('data-href', href)
      el.removeAttribute('href')
    }

    el.setAttribute('class', 'markdown-img-link')

    removeChildNodes(el)

    const img = el.ownerDocument.createElement('img')
    img.setAttribute('src', href)
    el.appendChild(img)

    return
  }

  // If a hive post
  const postMatch = href.match(POST_REGEX)
  if (postMatch && WHITE_LIST.includes(postMatch[1].replace(/^www\./,''))) {
    el.setAttribute('class', 'markdown-post-link')

    const tag = postMatch[2]
    const author = postMatch[3].replace('@', '')
    const permlink = sanitizePermlink(postMatch[4])

    if (!isValidPermlink(permlink)) return;

    const inlineMeta = getInlineMeta(el, href, author, permlink)
    if (inlineMeta.textMatches) {
      el.textContent = `@${author}/${permlink}`
    }
    const isInline = inlineMeta.isInline
    if (forApp) {
      el.removeAttribute('href')

      el.setAttribute('data-href', href)
      el.setAttribute('data-is-inline', '' + isInline)
      el.setAttribute('data-tag', tag)
      el.setAttribute('data-author', author)
      el.setAttribute('data-permlink', permlink)

    } else {
      const h = `/@${author}/${permlink}`
      el.setAttribute('href', h)
      el.setAttribute('data-is-inline', '' + isInline)
    }

    addLineBreakBeforePostLink(el, forApp, isInline)
    return
  }

  // If a hive user with url
  const mentionMatch = href.match(MENTION_REGEX)
  if (mentionMatch && WHITE_LIST.includes(mentionMatch[1].replace(/^www\./,'')) && mentionMatch.length === 3) {
    const _author = mentionMatch[2].replace('@', '')
    if (!isValidUsername(_author)) return
    const author = _author.toLowerCase()

    el.setAttribute('class', 'markdown-author-link')

    if (author.indexOf('/')===-1) {
      if (el.textContent === href) {
        el.textContent = `@${author}`
      }
      if (forApp) {
        el.removeAttribute('href')

        el.setAttribute('data-author', author)
      } else {
        const h = `/@${author}`
        el.setAttribute('href', h)
      }
    }
    return
  }

  // If a tagged post and profile section links
  const tpostMatch = href.match(INTERNAL_POST_TAG_REGEX)

  // Extract and validate domain from tpostMatch[1]
  let isValidDomain = false;
  if (tpostMatch && tpostMatch.length === 4) {
    if (tpostMatch[1].indexOf('/') === 0) {
      // Internal path like /ecency/@user/post
      isValidDomain = true;
    } else if (tpostMatch[1].includes('.')) {
      // Extract domain from URL (strip protocol and www.)
      const domain = tpostMatch[1]
        .replace(/^https?:\/\//, '') // Remove protocol
        .replace(/^www\./, '')        // Remove www. prefix
      isValidDomain = WHITE_LIST.includes(domain);
    }
  }

  // isValidDomain is only ever set true inside the `tpostMatch && length === 4` block above,
  // so tpostMatch is non-null here — asserted with `!` (type-only, erased at emit) at each use
  // to keep the emitted JS byte-identical.
  if (isValidDomain) {
    // check if permlink is section or section with params ?q=xyz
    // Split on '?' first to get path segment
    const pathSegment = tpostMatch![3].split('?')[0]
    if (SECTION_LIST.some(v => pathSegment === v || pathSegment.startsWith(v + '/'))) {
      el.setAttribute('class', 'markdown-profile-link')
      const author = tpostMatch![2].replace('@', '').toLowerCase()
      const section = tpostMatch![3]

      if (!isValidPermlink(section)) return;
      if (el.textContent === href) {
        el.textContent = `@${author}/${section}`
      }
      if (forApp) {
        const ha = `https://ecency.com/@${author}/${section}`
        el.setAttribute('href', ha)
      } else {
        const h = `/@${author}/${section}`
        el.setAttribute('href', h)
      }
      return
    } else {
      // Domain already validated in outer if condition
      let tag = 'post'
      // check if tag does exist and doesn't include dot likely word/tag
      if (tpostMatch![1] && !tpostMatch![1].includes('.')) {
        [, tag] = tpostMatch!
        tag = tag.replace('/', '')
      }

      el.setAttribute('class', 'markdown-post-link')
      const author = tpostMatch![2].replace('@', '')
      const permlink = sanitizePermlink(tpostMatch![3])

      if (!isValidPermlink(permlink)) return;

      // Pass community tag if it starts with "hive-"
      const communityTag = tag.toLowerCase().startsWith('hive-') ? tag : undefined
      const inlineMeta = getInlineMeta(el, href, author, permlink, communityTag)
      if (inlineMeta.textMatches) {
        el.textContent = `@${author}/${permlink}`
      }
      const isInline = inlineMeta.isInline
      if (forApp) {
        el.removeAttribute('href')

        el.setAttribute('data-href', href)
        el.setAttribute('data-is-inline', '' + isInline)
        el.setAttribute('data-tag', tag)
        el.setAttribute('data-author', author)
        el.setAttribute('data-permlink', permlink)

      } else {
        const h = `/@${author}/${permlink}`
        el.setAttribute('href', h)
        el.setAttribute('data-is-inline', '' + isInline)
      }

      addLineBreakBeforePostLink(el, forApp, isInline)
      return
    }
  }

  // If a hive user with internal url
  const imentionMatch = href.match(INTERNAL_MENTION_REGEX)
  if (imentionMatch) {
    const _author = imentionMatch[0].replace('/@', '')
    if (!isValidUsername(_author)) return
    const author = _author.toLowerCase()

    el.setAttribute('class', 'markdown-author-link')
    if (author.indexOf('/')===-1) {
      if (el.textContent === href) {
        el.textContent = `@${author}`
      }
      if (forApp) {
        el.removeAttribute('href')

        el.setAttribute('data-author', author)
      } else {
        const h = `/@${author}`
        el.setAttribute('href', h)
      }
    }
    return
  }

  // If a copied post and profile section links
  const cpostMatch = href.match(INTERNAL_POST_REGEX)
  if (
    (cpostMatch && cpostMatch.length === 3 && cpostMatch[1].indexOf('@') === 0)
  ) {
    // Split on '?' first to get path segment
    const pathSegment2 = cpostMatch[2].split('?')[0]
    if (SECTION_LIST.some(v => pathSegment2 === v || pathSegment2.startsWith(v + '/'))) {
      el.setAttribute('class', 'markdown-profile-link')
      const author = cpostMatch[1].replace('@', '').toLowerCase()
      const section = cpostMatch[2]

      if (el.textContent === href) {
        el.textContent = `@${author}/${section}`
      }
      if (forApp) {
        const ha = `https://ecency.com/@${author}/${section}`
        el.setAttribute('href', ha)
      } else {
        const h = `/@${author}/${section}`
        el.setAttribute('href', h)
      }
      return
    } else {
      el.setAttribute('class', 'markdown-post-link')

      const tag = 'post'

      const author = cpostMatch[1].replace('@', '')
      const permlink = sanitizePermlink(cpostMatch[2])

      if (!isValidPermlink(permlink)) return;

      const inlineMeta = getInlineMeta(el, href, author, permlink)

      if (inlineMeta.textMatches) {
        el.textContent = `@${author}/${permlink}`
      }
      const isInline = inlineMeta.isInline
      if (forApp) {
        el.removeAttribute('href')

        el.setAttribute('data-href', href)
        el.setAttribute('data-is-inline', '' + isInline)
        el.setAttribute('data-tag', tag)
        el.setAttribute('data-author', author)
        el.setAttribute('data-permlink', permlink)
      } else {
        const h = `/@${author}/${permlink}`
        el.setAttribute('href', h)
        el.setAttribute('data-is-inline', '' + isInline)
      }

      addLineBreakBeforePostLink(el, forApp, isInline)
      return
    }
  }

  // If topic with filters url
  const topicMatch = href.match(TOPIC_REGEX)
  if (topicMatch && WHITE_LIST.includes(topicMatch[1].replace(/^www\./,'')) && topicMatch.length === 4) {
    el.setAttribute('class', 'markdown-tag-link')
    const filter = topicMatch[2]
    const tag = topicMatch[3]

    if (el.textContent === href) {
      el.textContent = `/${filter}/${tag}`
    }
    if (forApp) {
      el.removeAttribute('href')

      el.setAttribute('data-filter', filter)
      el.setAttribute('data-tag', tag)
    } else {
      const h = `/${filter}/${tag}`
      el.setAttribute('href', h)
    }
    return
  }

  // If topic with filters internal url
  const itopicMatch = href.match(INTERNAL_TOPIC_REGEX)
  if (itopicMatch && itopicMatch.length === 3) {
    el.setAttribute('class', 'markdown-tag-link')
    const filter = itopicMatch[1]
    const tag = itopicMatch[2]

    if (el.textContent === href) {
      el.textContent = `/${filter}/${tag}`
    }
    if (forApp) {
      el.removeAttribute('href')

      el.setAttribute('data-filter', filter)
      el.setAttribute('data-tag', tag)
    } else {
      const h = `/${filter}/${tag}`
      el.setAttribute('href', h)
    }
    return
  }

  // If a custom hive community link
  const comMatch = href.match(CUSTOM_COMMUNITY_REGEX)
  if (comMatch && WHITE_LIST.includes(comMatch[1].replace(/^www\./,''))) {
    el.setAttribute('class', 'markdown-community-link')

    const community = comMatch[2]
    let filter = comMatch[3].substring(1)
    if (!filter) filter = 'created'
    if (filter === 'about' || filter === 'discord') {
      filter = 'created'
    }
    if (el.textContent === href) {
      el.textContent = `${filter}/${community}`
    }

    if (forApp) {
      el.removeAttribute('href')

      el.setAttribute('data-community', community)
      el.setAttribute('data-filter', filter)
    } else {
      const h = `/${filter}/${community}`
      el.setAttribute('href', h)
    }
    return
  }

  // If a collections post
  const cccMatch = href.match(CCC_REGEX)
  if (cccMatch && WHITE_LIST.includes(cccMatch[1].replace(/^www\./,''))) {
    el.setAttribute('class', 'markdown-post-link')

    const tag = 'ccc'
    const author = cccMatch[2].replace('@', '')
    const permlink = sanitizePermlink(cccMatch[3])

    if (!isValidPermlink(permlink)) return;

    const inlineMeta = getInlineMeta(el, href, author, permlink)

    if (inlineMeta.textMatches) {
      el.textContent = `@${author}/${permlink}`
    }
    const isInline = inlineMeta.isInline
    if (forApp) {
      el.removeAttribute('href')

      el.setAttribute('data-href', href)
      el.setAttribute('data-is-inline', '' + isInline)
      el.setAttribute('data-tag', tag)
      el.setAttribute('data-author', author)
      el.setAttribute('data-permlink', permlink)
    } else {
      const h = `/@${author}/${permlink}`
      el.setAttribute('href', h)
      el.setAttribute('data-is-inline', '' + isInline)
    }
    addLineBreakBeforePostLink(el, forApp, isInline)
    return
  }


  const BCmatch = href.match(BITCHUTE_REGEX)
  if (BCmatch && BCmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, 'bitchute', `https://www.bitchute.com/embed/${BCmatch[1]}/`, renderOptions)
    return
  }

  const RBmatch = href.match(RUMBLE_REGEX)
  if (RBmatch && RBmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, 'rumble', `https://www.rumble.com/embed/${RBmatch[1]}/?pub=4`, renderOptions)
    return
  }

  const BNmatch = href.match(BRIGHTEON_REGEX)
  if (BNmatch && BNmatch[2] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, 'brighteon', `https://www.brighteon.com/embed/${BNmatch[2]}`, renderOptions)
    return
  }

  // Odysee watch links. Odysee mirrors the watch path under /$/embed/, so a
  // posted video URL maps to a playable embed with no network lookup.
  const ODmatch = href.match(ODYSEE_WATCH_REGEX)
  if (ODmatch && ODmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, 'odysee', `https://odysee.com/$/embed/${ODmatch[1]}`, renderOptions)
    return
  }

  // If a youtube video
  let match = href.match(YOUTUBE_REGEX)
  if (match && match[1] && el.textContent.trim() === href) {
    el.setAttribute('class', 'markdown-video-link markdown-video-link-youtube')
    el.removeAttribute('href')

    const vid = match[1]
    const thumbnail = proxifyImageSrc(`https://img.youtube.com/vi/${vid.split('?')[0]}/hqdefault.jpg`, 0, 0, 'match')
    const embedSrc = `https://www.youtube.com/embed/${vid}?autoplay=1`

    el.textContent = ''

    el.setAttribute('data-embed-src', embedSrc);
    el.setAttribute('data-youtube', vid);

    //extract start time if available
    const startTime = extractYtStartTime(href);
    if(startTime){
      el.setAttribute('data-start-time', startTime);
    }

    if (renderOptions?.embedVideosDirectly) {
      // Waves/thread feed: embed inline but never autoplay. A feed scrolling
      // past several videos that all start playing at once is disorienting, so
      // load the player paused (no autoplay=1, no autoplay permission). The
      // click-to-play path elsewhere keeps using embedSrc via data-embed-src.
      const directSrc = `https://www.youtube.com/embed/${vid}`
      const wrapper = el.ownerDocument.createElement('span')
      wrapper.setAttribute('class', 'er-youtube-frame')
      wrapper.setAttribute('style', 'display:block')
      const iframe = el.ownerDocument.createElement('iframe')
      iframe.setAttribute('class', 'youtube-player')
      iframe.setAttribute('src', directSrc)
      iframe.setAttribute('title', 'YouTube video')
      iframe.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share')
      iframe.setAttribute('allowfullscreen', '')
      wrapper.appendChild(iframe)
      el.appendChild(wrapper)
      el.setAttribute('class', 'markdown-video-link markdown-video-link-youtube er-youtube')
    } else {
      const thumbImg = el.ownerDocument.createElement('img')
      thumbImg.setAttribute('class', 'no-replace video-thumbnail')
      thumbImg.setAttribute('itemprop', 'thumbnailUrl')
      thumbImg.setAttribute('src', thumbnail)

      const play = el.ownerDocument.createElement('span')
      play.setAttribute('class', 'markdown-video-play')

      el.appendChild(thumbImg)
      el.appendChild(play)
    }

    return
  }

  // If vimeo video
  match = href.match(VIMEO_REGEX)
  if (match && match[3] && href === el.textContent) {
    el.setAttribute('class', 'markdown-video-link markdown-video-link-vimeo')
    el.removeAttribute('href')

    const embedSrc = `https://player.vimeo.com/video/${match[3]}`

    el.textContent = ''

    const ifr = el.ownerDocument.createElement('iframe')
    ifr.setAttribute('frameborder', '0')
    ifr.setAttribute('allowfullscreen', 'true')
    ifr.setAttribute('src', embedSrc)
    el.appendChild(ifr)

    return
  }

  // If twitch video
  match = href.match(TWITCH_REGEX)
  if (match && match[2] && href === el.textContent) {
    el.setAttribute('class', 'markdown-video-link markdown-video-link-twitch')
    el.removeAttribute('href')

    let embedSrc = ''
    const parent = parentDomain ? `&parent=${parentDomain}` : ''

    if (match[1] === undefined) {
      // No "videos" in URL, match[2] is the channel name
      embedSrc = `https://player.twitch.tv/?channel=${match[2]}${parent}`
    } else if (match[1] === 'videos') {
      // URL contains "videos/", match[2] is the video ID
      embedSrc = `https://player.twitch.tv/?video=${match[2]}${parent}`
    } else {
      // Fallback (shouldn't happen with current regex)
      embedSrc = `https://player.twitch.tv/?channel=${match[2]}${parent}`
    }

    el.textContent = ''

    const ifr = el.ownerDocument.createElement('iframe')
    ifr.setAttribute('frameborder', '0')
    ifr.setAttribute('allowfullscreen', 'true')
    ifr.setAttribute('src', embedSrc)
    el.appendChild(ifr)

    return
  }

  // If a spotify audio
  if (el.textContent.trim() === href) {
    SPOTIFY_REGEX.lastIndex = 0 // Reset regex state
    match = SPOTIFY_REGEX.exec(href)
    if (match && match[1]) {
      el.setAttribute('class', 'markdown-audio-link markdown-audio-link-spotify')
      el.removeAttribute('href')

      const embedSrc = `https://open.spotify.com/embed/playlist/${match[1]}`

      el.textContent = ''

      const ifr = el.ownerDocument.createElement('iframe')
      ifr.setAttribute('frameborder', '0')
      ifr.setAttribute('allowfullscreen', 'true')
      ifr.setAttribute('src', embedSrc)
      ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
      el.appendChild(ifr)

      return
    }
  }

  // If a Loom video
  match = href.match(LOOM_REGEX)
  if (match && match[2] && el.textContent.trim() === href) {
    el.setAttribute('class', 'markdown-video-link markdown-video-link-loom')
    el.removeAttribute('href')

    const embedSrc = `https://www.loom.com/embed/${match[2]}`

    el.textContent = ''

    const ifr = el.ownerDocument.createElement('iframe')
    ifr.setAttribute('frameborder', '0')
    ifr.setAttribute('allowfullscreen', 'true')
    ifr.setAttribute('src', embedSrc)
    ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
    el.appendChild(ifr)

    return
  }

  // If a d.tube video
  // Only d.tube links contains an image
  const imgEls = el.getElementsByTagName('img')

  if (imgEls.length === 1 || el.textContent.trim() === href) {
    D_TUBE_REGEX.lastIndex = 0 // Reset regex state
    match = D_TUBE_REGEX.exec(href)
    // match[2] = username, match[3] object id
    if (match && match[2] && match[3]) {
      el.setAttribute('class', 'markdown-video-link markdown-video-link-dtube')
      el.removeAttribute('href')

      const videoHref = `https://emb.d.tube/#!/${match[2]}/${match[3]}`

      // el.setAttribute('data-video-href', videoHref)
      el.setAttribute('data-embed-src', videoHref)

      //process thumb img element
      if (imgEls.length === 1) {
        const src = imgEls[0].getAttribute('src')
        if (src) {
          const thumbnail = proxifyImageSrc(src.replace(/\s+/g, ''), 0, 0, 'match')
          const thumbImg = el.ownerDocument.createElement('img')

          thumbImg.setAttribute('class', 'no-replace video-thumbnail')
          thumbImg.setAttribute('itemprop', 'thumbnailUrl')

          thumbImg.setAttribute('src', thumbnail)
          el.appendChild(thumbImg)

          // Remove image.
          el.removeChild(imgEls[0])
        }
      } else {
          el.textContent = '';
      }

      const play = el.ownerDocument.createElement('span')
      play.setAttribute('class', 'markdown-video-play')

      el.appendChild(play)

      return
    }
  }
  D_TUBE_REGEX2.lastIndex = 0 // Reset regex state
  match = D_TUBE_REGEX2.exec(href)
  if (match && match[2] && match[3]) {
    // match[2] = username, match[3] object id
    el.setAttribute('class', 'markdown-video-link markdown-video-link-dtube')
    el.removeAttribute('href')
    el.textContent = '';

    const videoHref = `https://emb.d.tube/#!/${match[2]}/${match[3]}`

    // el.setAttribute('data-video-href', videoHref);
    el.setAttribute('data-embed-src', videoHref)
    const play = el.ownerDocument.createElement('span')
    play.setAttribute('class', 'markdown-video-play')

    el.appendChild(play)

    return
  }

  // Detect 3Speak
  match = href.match(SPEAK_REGEX)
  if (match) {
    const imgEls = el.getElementsByTagName('img')
    if (imgEls.length === 1 || el.textContent.trim() === href) {
      // match[1] / match[2] = tld , match[3] = embed address
      if ((match[1] || match[2]) && match[3]) {
        const videoHref = `https://play.3speak.tv/watch?v=${match[3]}&mode=iframe`
        el.setAttribute('class', 'markdown-video-link markdown-video-link-speak')
        el.removeAttribute('href')
        el.setAttribute('data-embed-src', videoHref)
        if (el.textContent.trim() === href) {
          el.textContent = ''
        }

        if (renderOptions?.embedVideosDirectly) {
          // Waves/thread feed: embed inline but never autoplay. The 3Speak
          // player autoplays by default, which is disorienting in a feed of
          // many videos, so request autoplay=false explicitly. The
          // click-to-play path elsewhere keeps using videoHref via
          // data-embed-src (autoplay after the user clicks is fine).
          const directSrc = `${videoHref}&autoplay=false`
          // Use span (not div) to avoid invalid nesting inside <p> tags
          const wrapper = el.ownerDocument.createElement('span')
          wrapper.setAttribute('class', 'er-speak-frame')
          wrapper.setAttribute('style', 'display:block')
          const iframe = el.ownerDocument.createElement('iframe')
          iframe.setAttribute('class', 'speak-iframe')
          iframe.setAttribute('src', directSrc)
          iframe.setAttribute('title', '3Speak video')
          iframe.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share')
          iframe.setAttribute('allowfullscreen', '')
          wrapper.appendChild(iframe)
          el.appendChild(wrapper)
          el.setAttribute('class', 'markdown-video-link markdown-video-link-speak er-speak')
        } else {
          if (imgEls.length === 1) {
            const src = imgEls[0].getAttribute('src')
            if (src) {
              const thumbnail = proxifyImageSrc(src.replace(/\s+/g, ''), 0, 0, 'match')
              const thumbImg = el.ownerDocument.createElement('img')
              thumbImg.setAttribute('class', 'no-replace video-thumbnail')
              thumbImg.setAttribute('itemprop', 'thumbnailUrl')
              thumbImg.setAttribute('src', thumbnail)
              el.appendChild(thumbImg)
              // Remove image.
              el.removeChild(imgEls[0])
            }
          }

          const play = el.ownerDocument.createElement('span')
          play.setAttribute('class', 'markdown-video-play')
          el.appendChild(play)
        }
        return
      }
    }
  }

  // Detect 3Speak Audio
  if (href.match(SPEAK_AUDIO_REGEX) && el.textContent.trim() === href) {
    el.setAttribute('class', 'markdown-audio-link markdown-audio-link-speak')
    el.removeAttribute('href')

    const embedSrc = /[?&]iframe=/.test(href) ? href : `${href}&iframe=1`
    const finalSrc = /[?&]mode=/.test(embedSrc) ? embedSrc : `${embedSrc}&mode=compact`

    el.textContent = ''

    const ifr = el.ownerDocument.createElement('iframe')
    ifr.setAttribute('frameborder', '0')
    ifr.setAttribute('src', finalSrc)
    ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
    el.appendChild(ifr)

    return
  }

  // Detect Liketu Speak voice posts: render the cdn.liketu.com audio file as a
  // native player. The link text is descriptive ("Listen to the original
  // voice"), so match on the href only, not textContent.
  if (href.match(LIKETU_AUDIO_REGEX)) {
    el.setAttribute('class', 'markdown-audio-link markdown-audio-link-liketu')
    el.removeAttribute('href')
    el.textContent = ''

    const audio = el.ownerDocument.createElement('audio')
    audio.setAttribute('controls', '')
    audio.setAttribute('preload', 'metadata')
    audio.setAttribute('src', href)
    el.appendChild(audio)

    return
  }

  // If tweets
  const matchT = href.match(TWITTER_REGEX)
  if (matchT && el.textContent.trim() === href) {
    TWITTER_REGEX.lastIndex = 0 // Reset for exec() after match()
    const e = TWITTER_REGEX.exec(href)
    if (e) {
      const url = stripHtmlTags(e[0])
      const author = stripHtmlTags(e[1])

      // Use proper DOM construction to avoid XSS from unescaped url/author
      const blockquote = el.ownerDocument.createElement('blockquote')
      blockquote.setAttribute('class', 'twitter-tweet')

      const p = el.ownerDocument.createElement('p')
      p.textContent = url // textContent automatically escapes

      const textNode = el.ownerDocument.createTextNode('- ')

      const a = el.ownerDocument.createElement('a')
      a.setAttribute('href', url) // setAttribute escapes automatically
      a.textContent = author // textContent automatically escapes

      blockquote.appendChild(p)
      blockquote.appendChild(textNode)
      blockquote.appendChild(a)

      if (el.parentNode) {
        el.parentNode.replaceChild(blockquote, el)
      }
      return
    }
  }

  if (href.indexOf('https://hivesigner.com/sign/account-witness-vote?witness=') === 0 && forApp) {
    el.setAttribute('class', 'markdown-witnesses-link')
    el.setAttribute('data-href', href)
    el.removeAttribute('href')
    return
  }

  if (href.indexOf('hivesigner.com/sign/update-proposal-votes?proposal_ids') >= 0 && forApp) {
    try {
      const m = decodeURI(href).match(/proposal_ids=\[(\d+)]/)
      if (m) {
        el.setAttribute('class', 'markdown-proposal-link')
        el.setAttribute('data-href', href)
        el.setAttribute('data-proposal', m[1])
        el.removeAttribute('href')
        return
      }
    } catch (e) {
      // Invalid URI encoding, skip processing
    }
  }

  // If nothing matched element as external link so it will be opened in external window
  el.setAttribute('class', 'markdown-external-link')

  // Prepend https if no scheme provided.
  // Case-insensitive: schemes are case-insensitive per RFC 3986, so a
  // mixed-case `Https://` must not be treated as scheme-less (which would
  // double-prepend and yield `https://Https://...`).
  if (!(/^((#)|(mailto:)|(\/(?!\/))|(((steem|hive|esteem|ecency|https?):)?\/\/))/i.test(href))) {
    href = `https://${href}`
  }

  if (forApp) {
    el.setAttribute('data-href', href)
    const match = href.match(YOUTUBE_REGEX)
    if (match && match[1]) {
      const vid = match[1]
      el.setAttribute('data-youtube', vid);

      //extract start time if available
      const startTime = extractYtStartTime(href);
      if(startTime){
        el.setAttribute('data-start-time', startTime);
      }
    }
    el.removeAttribute('href')
  } else {
    // Same-document links only. This used to match a `#` anywhere in the URL, so any
    // external link ending in `/#anything` was treated as internal: it lost
    // `rel="nofollow ugc noopener"` and opened in the same tab, turning every rendered
    // page into a dofollow link farm for anyone appending a fragment.
    const matchS = href.trim().startsWith('#')
    if(matchS) {
      el.setAttribute('class', 'markdown-internal-link');
    } else {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', getExternalLinkRel(seoContext));
    }
    el.setAttribute('href', href)
  }
}



