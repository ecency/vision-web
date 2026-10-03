import xss from 'xss'
import {ALLOWED_ATTRIBUTES, ID_WHITELIST, isAllowedEmbedSrc} from '../consts'
import { getProxyBase } from '../proxify-image-src'
import { decodeEntities, trimTrailingSlash } from '../helper'
import { authorPixelSize, parsePixelDimension } from './image-dimensions'
import type { XSSWhiteList } from '../types'

// data-* attributes whose value is later consumed as an <iframe> src by the
// client video extensions (dataset.embedSrc / dataset.videoHref). They MUST be
// an absolute https:// URL on an allowed embed host — anything else (a
// javascript:/data: same-origin XSS, or an arbitrary off-allowlist origin used
// for phishing/redirect inside a non-sandboxed frame) is blanked here, the
// authoritative layer. The renderer only ever emits allowlisted https values
// (see a.method.ts), so legitimate embeds are unaffected.
const EMBED_SRC_DATA_ATTRS = new Set(['data-embed-src', 'data-video-href'])

// data-href carries a navigation target (mobile post/community/hivesigner links
// and arbitrary external links), NOT an iframe src, so it is held to the same
// scheme policy a.method.ts already applies to href — block javascript:, data:,
// vbscript:, file:, etc. while allowing http(s)/mailto/hive/tel/relative.
// Whitespace/control chars browsers ignore inside the scheme are stripped first.
const isSafeNavValue = (value: string): boolean => {
  const trimmed = value.trim().replace(/[\t\n\r\f\v\0]/g, '').toLowerCase()
  if (!trimmed) return false
  const isSafeScheme = /^(https?|mailto|hive|tel|web\+[a-z0-9.+-]+):/i.test(trimmed)
  const isRelative = /^(\/\/|\/[^/]?|#|\?|[a-z0-9._\-]+(\/|$))/i.test(trimmed)
  return isSafeScheme || isRelative
}

// A <source> in a <picture> may only point at the image proxy's /p/ route. This
// blocks a malicious on-chain <source srcset="..."> from beaconing to an
// external host or using a non-http scheme (the <img> src/srcset already get
// the http(s) check below). Our renderer only ever emits proxyBase /p/ srcsets.
const isProxyPSrcset = (srcset: string): boolean => {
  const base = trimTrailingSlash(getProxyBase());
  const candidates = srcset.split(',').map(c => c.trim().split(/\s+/)[0]).filter(Boolean);
  return candidates.length > 0 && candidates.every(url => url.startsWith(`${base}/p/`));
};

export interface SanitizeHtmlOptions {
  /**
   * Keep a validated pixel width/height pair on `<img>`. Off by default: the
   * attributes stay off the whitelist, which is what every existing caller
   * depends on. See `RenderOptions.preserveImageDimensions`.
   */
  preserveImageDimensions?: boolean
}

/**
 * An img tag xss has already emitted, always as `name="value"`. Width and
 * height are kept only as a pair that `authorPixelSize` accepts, and only
 * when the tag still has a src. `onTagAttr` sees one attribute at a time, so
 * the pair and the "src was dropped" decision happen here.
 *
 * Attributes are walked in order. A search for `width=` would also match
 * inside another value (`alt="Set width="`) and the following replace would
 * fold src into that value. Runs only when the option is on, so the default
 * pass never walks image tags a second time.
 */
const QUOTED_ATTR = /\s([^\s"'>\/=]+)="([^"]*)"/g

function enforceImageDimensionPair(html: string): string {
  return html.replace(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
    QUOTED_ATTR.lastIndex = 0
    const attrs: { name: string; value: string }[] = []
    let match: RegExpExecArray | null
    while ((match = QUOTED_ATTR.exec(tag))) {
      attrs.push({ name: match[1].toLowerCase(), value: decodeEntities(match[2]) })
    }
    const width = attrs.find((attr) => attr.name === 'width')?.value
    const height = attrs.find((attr) => attr.name === 'height')?.value
    const src = (attrs.find((attr) => attr.name === 'src')?.value ?? '').trim()
    if (src && authorPixelSize(width, height)) return tag
    // replace() resets lastIndex, but a prior exec on this tag has already
    // moved it, and a later tag must not start mid-string either.
    QUOTED_ATTR.lastIndex = 0
    return tag.replace(QUOTED_ATTR, (full, name: string) =>
      name.toLowerCase() === 'width' || name.toLowerCase() === 'height' ? '' : full
    )
  })
}

export function sanitizeHtml(html: string, options?: SanitizeHtmlOptions): string {
  const preserveImageDimensions = !!options?.preserveImageDimensions
  const whiteList: XSSWhiteList = preserveImageDimensions
    ? {
        ...ALLOWED_ATTRIBUTES,
        img: [...(ALLOWED_ATTRIBUTES.img ?? []), 'width', 'height'],
      }
    : ALLOWED_ATTRIBUTES

  const cleaned = xss(html, {
    whiteList,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['style'],
    css: false, // block style attrs entirely for safety
    onTagAttr: (tag, name, value) => {
      // Shared with helper.ts rather than decoded here: this pass runs on
      // chain-authored HTML, and the private copy that used to live in this
      // file called String.fromCodePoint on the raw numeric reference. One
      // crafted attribute (`<div title="&#x110000;">`) therefore threw a
      // RangeError straight out of sanitizeHtml — which is the last-resort
      // pass inside renderPostBody, and runs on every catchPostImage body —
      // taking an SSR feed render down. helper.decodeEntities maps overlong
      // and out-of-range references to U+FFFD (what the HTML spec asks for)
      // and never throws.
      const decoded = decodeEntities(value.trim());
      const decodedLower = decoded.toLowerCase();

      if (name.startsWith('on')) return ''; // 🛡 event handlers
      // Positive-whitelist: only http(s) is accepted. Any other scheme
      // (javascript:, data:, vbscript:, file:, etc.) is rejected by the
      // negation. We don't need an explicit blocklist alongside.
      if (tag === 'img' && name === 'src' && !/^https?:\/\//.test(decodedLower)) return '';
      // Validate srcset: reject if any candidate URL uses a non-http(s) protocol
      if (tag === 'img' && name === 'srcset') {
        const candidates = decoded.split(',').map(c => c.trim().split(/\s+/)[0]);
        if (candidates.some(url => !/^https?:\/\//i.test(url))) return '';
      }
      // <picture><source>: srcset is restricted to the proxy /p/ route, and type
      // to the two formats we emit. Anything else is blanked (and a then
      // type-less <source> is dropped wholesale in the post-pass below).
      if (tag === 'source' && name === 'srcset' && !isProxyPSrcset(decoded)) return '';
      if (tag === 'source' && name === 'type' && decodedLower !== 'image/avif' && decodedLower !== 'image/webp') return '';
      if (
        (tag === 'video' || tag === 'audio') && ['src', 'poster'].includes(name) &&
        !/^https?:\/\//.test(decodedLower)
      ) return '';
      // Clamp audio preload to a lightweight hint: our player emits
      // preload="metadata", and an author-supplied preload="auto" on untrusted
      // posts would eagerly fetch large third-party audio before any click.
      if (tag === 'audio' && name === 'preload' &&
        decodedLower !== 'metadata' && decodedLower !== 'none') return '';
      if (tag === 'img' && ['dynsrc', 'lowsrc'].includes(name)) return '';
      // Pixel length only. A percentage or a `px` suffix is not an aspect
      // ratio, and returning '' strips it even though the option added the
      // name to the whitelist. The pair and the ratio are checked afterwards,
      // once both attributes are visible.
      if (tag === 'img' && (name === 'width' || name === 'height')) {
        if (!preserveImageDimensions || parsePixelDimension(decoded) == null) return '';
      }
      if (tag === 'span' && name === 'class' && decoded.toLowerCase().trim() === 'wr') return '';
      // iframe-src data-* attrs: must resolve to an https:// allowed-embed-host
      // URL or they are blanked (stored HTML/iframe injection — CVE class).
      if (EMBED_SRC_DATA_ATTRS.has(name) && !isAllowedEmbedSrc(decoded)) return '';
      // data-href is a navigation target; block dangerous schemes only.
      if (name === 'data-href' && !isSafeNavValue(decoded)) return '';
      if (name === 'id') {
        if (!ID_WHITELIST.test(decoded)) return '';
      }
      return undefined;
    }
  });

  // Drop any <source> that lacks a valid avif/webp type. onTagAttr can blank an
  // attribute but can't remove an element, and a type-less <source> with a
  // surviving srcset would match ALL browsers (overriding the <img>). Our
  // renderer always emits a typed <source>, so this only fires on hostile input.
  // The tag matcher tolerates a literal '>' inside a quoted attribute value
  // (xss escapes '>' to '&gt;' in output, so this is belt-and-suspenders) by
  // consuming quoted spans whole rather than stopping at the first '>'.
  const withoutBareSource = cleaned.replace(/<source\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (t) =>
    /\btype\s*=\s*["'](?:image\/avif|image\/webp)["']/i.test(t) ? t : ''
  );
  return preserveImageDimensions ? enforceImageDimensionPair(withoutBareSource) : withoutBareSource;
}
