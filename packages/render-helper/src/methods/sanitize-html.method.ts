import xss, { type SafeAttrValueHandler } from 'xss'
import {ALLOWED_ATTRIBUTES, ID_WHITELIST, IFRAME_SANDBOX_GRANTS, RENDER_HELPER_DATA_ATTRIBUTES, authorClasses, canonicalEmbedSrc, isAllowedEmbedSrc, namespacedId, stripMarkdownClasses} from '../consts'
import { getProxyBase, proxifyImageSrc } from '../proxify-image-src'
import { isStrictTag } from './render-boundary.method'
import { decodeAttributeEntities, trimTrailingSlash } from '../helper'
import { authorPixelSize, parsePixelDimension } from './image-dimensions'
import type { XSSWhiteList } from '../types'
import { regexMatches } from '../regex-matches'

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
// srcset is parsed the way browsers do: candidates split on commas, URL and
// descriptors on ASCII whitespace only. String.trim() and \s also eat NBSP,
// BOM and U+2028, which a browser keeps inside the URL (and then resolves it
// as a relative path on the page, not on the proxy).
const ASCII_WS = /[\t\n\f\r ]+/
const srcsetCandidates = (srcset: string): string[][] =>
  srcset
    .split(',')
    .map(candidate => candidate.split(ASCII_WS).filter(Boolean))
    .filter(parts => parts.length > 0) // a stray or trailing comma is fine

// A srcset render-helper would write: each candidate a URL with at most one
// width or density descriptor (`320w`, `1.5x`, `.5x`). Anything else (a
// descriptor that is not one, a second URL inside a candidate whose comma was
// hidden in a reference) is dropped whole rather than left to each browser's
// error handling.
const isWellFormedSrcset = (srcset: string): boolean =>
  srcsetCandidates(srcset).every(parts =>
    parts.length === 1 || (parts.length === 2 && /^(?:\d+(?:\.\d+)?|\.\d+)[wx]$/i.test(parts[1]))
  )

const isProxyPSrcset = (srcset: string): boolean => {
  const base = trimTrailingSlash(getProxyBase());
  const candidates = srcsetCandidates(srcset).map(parts => parts[0]);
  return candidates.length > 0 && candidates.every(url => url.startsWith(`${base}/p/`));
};

// Attribute value escaping for the values onTagAttr rebuilds itself. A local
// copy: xss is CommonJS, and plain Node's ESM loader cannot see its
// escapeAttrValue as a named export (test/dist-loads-in-plain-node.spec.ts).
const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const hasQuotedAttr = (attrs: string, wanted: string): boolean => {
  for (const m of regexMatches(attrs, /\s([^\s"'>\/=]+)="[^"]*"/g)) {
    if (m[1].toLowerCase() === wanted) return true
  }
  return false
}

// An iframe opening tag (group 1: its attributes) or closing tag. xss writes
// every close as `</iframe>`.
const IFRAME_TAG = /<iframe\b((?:[^>"']|"[^"]*"|'[^']*')*)>|<\/iframe\s*>/gi
const IFRAME_START = /<iframe\b/gi
const IFRAME_CLOSE = /<\/iframe\s*>/gi

// Drops each iframe whose src was refused, with its `</iframe>` (#2155). The
// close is its own only when no other iframe opens first; an unclosed one
// loses only its opening tag, so it cannot swallow what follows. Plain text
// between the two is the author's fallback, which a browser never shows and
// the DOM path drops with the element, so it goes too; markup there stays, so
// a refused iframe never unbalances the tags around it (`<p>` opened inside,
// closed outside). A close left over, which closes no kept iframe (an opening
// xss dropped, `<iframe/src=..>`), goes as well. Linear: the next close and
// the next opening are each looked up again only once the scan passed them.
function dropRefusedIframes(html: string): string {
  const find = (re: RegExp, from: number): [number, number] => {
    re.lastIndex = from
    const m = re.exec(html)
    return m ? [m.index, re.lastIndex] : [-1, 0]
  }
  let out = ''
  let last = 0
  let kept = 0 // 1 while a kept iframe is open at the scan position
  let inner = 0 // kept openings inside it, whose closes are theirs
  let surplus = 0 // those closes still to come
  let close: [number, number] = [-2, 0] // -2: not looked up yet, -1: none left
  let next: [number, number] = [-2, 0]
  IFRAME_TAG.lastIndex = 0
  let tag: RegExpExecArray | null
  while ((tag = IFRAME_TAG.exec(html)) !== null) {
    // A kept iframe's content runs to the next close, as a browser reads it
    // (raw text): an iframe tag inside is left as it is.
    if (kept > 0 && tag[1] !== undefined) {
      // A kept opening in there still has its own close to come.
      if (hasQuotedAttr(tag[1], 'src')) inner++
      continue
    }
    if (tag[1] === undefined) {
      // A close tag. The first one ends a kept iframe, as a browser reads it;
      // the closes of kept iframes nested in it are kept too, so the markup
      // stays balanced for a tree parser. A refused iframe takes its own close
      // through the lookahead below, never one of these.
      if (kept > 0) {
        kept = 0
        surplus += inner
        inner = 0
        continue
      }
      if (surplus > 0) {
        surplus--
        continue
      }
      out += html.slice(last, tag.index)
      last = IFRAME_TAG.lastIndex
      continue
    }
    if (hasQuotedAttr(tag[1], 'src')) {
      kept = 1
      continue
    }
    out += html.slice(last, tag.index)
    last = IFRAME_TAG.lastIndex
    if (close[0] !== -1 && close[0] < last) close = find(IFRAME_CLOSE, last)
    if (close[0] === -1) continue
    if (next[0] !== -1 && next[0] < last) next = find(IFRAME_START, last)
    if (next[0] !== -1 && next[0] < close[0]) continue
    const content = html.slice(last, close[0])
    if (content.includes('<')) out += content
    last = close[1]
    IFRAME_TAG.lastIndex = last
  }
  return out + html.slice(last)
}

// Attributes whose value is a URL the checks above validate.
const isUrlAttribute = (tag: string, name: string): boolean =>
  (name === 'src' && tag !== 'a') ||
  name === 'srcset' ||
  name === 'poster' ||
  name === 'data-href' ||
  EMBED_SRC_DATA_ATTRS.has(name)

const RENDER_HELPER_RELS = new Set(['nofollow ugc noopener', 'noopener'])

// xss is CommonJS: its helpers hang off the default export at runtime, and a named
// import breaks the ESM build under Node (`Named export 'safeAttrValue' not found`).
const xssSafeAttrValue = (xss as unknown as { safeAttrValue: SafeAttrValueHandler }).safeAttrValue

// The schemes a() writes on a link (a.method.ts), including tel: and web+
// handlers, which a()'s scheme check accepts and keeps as written (#2107).
const HREF_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'hive', 'steem', 'esteem', 'ecency'])
const isHrefScheme = (scheme: string): boolean => {
  const lower = scheme.toLowerCase()
  return HREF_SCHEMES.has(lower) || /^web\+[a-z0-9.+-]+$/.test(lower)
}

export interface SanitizeHtmlOptions {
  /**
   * Keep a validated pixel width/height pair on `<img>`. Off by default: the
   * attributes stay off the whitelist, which is what every existing caller
   * depends on. See `RenderOptions.preserveImageDimensions`.
   */
  preserveImageDimensions?: boolean
  /**
   * The HTML never went through the DOM transforms (the sanitize-only
   * fallback): nothing in it is trusted. Image sources and posters go through
   * the proxy or are dropped, a srcset must be all proxy URLs, author
   * `target`/`rel` are dropped, and `markdown-*` class tokens and
   * render-helper's `data-*` link markers are removed (#1919).
   */
  untransformed?: boolean
  /**
   * Pre-sanitize ahead of the htmlparser2 repair and a full DOM transform.
   * Iframes are left to iframe(), which normalises provider page URLs
   * (BitChute /video/, Brighteon pages, /EMBED/, /shorts/<id>) and shows the
   * unsupported placeholder for the rest; the final pass enforces the allow
   * list on what it emits.
   */
  beforeTransform?: boolean
  /**
   * The final pass of a full render. Tags carrying this per-render nonce were
   * emitted by the transformed DOM and keep render-helper's markers and link
   * policy; every other tag gets the untransformed rules. Images and posters
   * are held to the proxy either way. See render-boundary.method.ts.
   */
  renderNonce?: string
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
      attrs.push({ name: match[1].toLowerCase(), value: decodeAttributeEntities(match[2]) })
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
  const untransformed = !!options?.untransformed
  const beforeTransform = !!options?.beforeTransform
  const renderNonce = options?.renderNonce
  // Output of a full render (or its untransformed fallback).
  const enforce = untransformed || !!renderNonce
  const proxyBase = `${trimTrailingSlash(getProxyBase())}/`
  const whiteList: XSSWhiteList = preserveImageDimensions
    ? {
        ...ALLOWED_ATTRIBUTES,
        img: [...(ALLOWED_ATTRIBUTES.img ?? []), 'width', 'height'],
      }
    : ALLOWED_ATTRIBUTES

  // Set by onTag for the tag whose attributes onTagAttr sees next: xss calls
  // onTag with the raw tag source right before walking its attributes.
  let trusted = false

  // The ids this input declares, as written (decoded). A `#fragment` link to
  // one of them follows it to its namespaced id; any other fragment (a
  // `data-id` anchor, which the web resolves by script) is left alone. A
  // false hit only points a link at a name nothing has.
  const declaredIds = new Set<string>()
  const declaredFragment = (fragment: string): string | null => {
    let candidates = [fragment];
    try {
      candidates = [fragment, decodeURIComponent(fragment)];
    } catch {
      // a malformed escape: only the fragment as written can match
    }
    return candidates.find((id) => declaredIds.has(id) && ID_WHITELIST.test(id)) ?? null;
  };
  for (const m of regexMatches(html, /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    declaredIds.add(decodeAttributeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim()))
  }

  const cleaned = xss(html, {
    whiteList,
    onTag: (_tag, rawTag) => {
      // A stamped tag is trusted only in the exact shape xmldom serializes:
      // otherwise xss may read attributes the transforms never saw.
      trusted = !!renderNonce && rawTag.indexOf(renderNonce) !== -1 && isStrictTag(rawTag)
      return undefined
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['style'],
    css: false, // block style attrs entirely for safety
    onTagAttr: (tag, name, value, isWhiteAttr) => {
      // Shared with helper.ts rather than decoded here: this pass runs on
      // chain-authored HTML, and the private copy that used to live in this
      // file called String.fromCodePoint on the raw numeric reference. One
      // crafted attribute (`<div title="&#x110000;">`) therefore threw a
      // RangeError straight out of sanitizeHtml — which is the last-resort
      // pass inside renderPostBody, and runs on every catchPostImage body —
      // taking an SSR feed render down. helper.decodeEntities maps overlong
      // and out-of-range references to U+FFFD (what the HTML spec asks for)
      // and never throws.
      const decoded = decodeAttributeEntities(value.trim());
      const decodedLower = decoded.toLowerCase();

      if (name.startsWith('on')) return ''; // 🛡 event handlers
      // An href keeps only the schemes a() itself writes. xss's own check lets
      // `data:image/` through, and on the sanitize-only fallback no a() pass ran,
      // so an entity-written scheme (`data&colon;image/svg+xml,...`) would ship
      // live (#2099). Read the way a browser reads it: leading whitespace
      // (Unicode included, as xss trims it), controls and U+FFFD dropped,
      // tab/LF/CR removed anywhere. The value is then written out below exactly
      // as checked, never re-read by xss (it decodes `&colon` without a
      // semicolon, and decodes a second time).
      let hrefSchemeAllowed = false;
      if (name === 'href') {
        const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(
          decoded.replace(/^[\s\u0000-\u0020\ufffd]+/, '').replace(/[\t\n\r]/g, '')
        );
        // A bare `href`, as xss writes a refused one: the link keeps its look, goes nowhere.
        if (scheme && !isHrefScheme(scheme[1])) return isWhiteAttr ? 'href' : '';
        // Only tel:, mailto: and web+ handlers skip xss's rule below (#2107). http(s)
        // still goes through it: it wants `//`, and a slash-less `http:host` would
        // ship live with none of the link rel policy. So do the app deep-link
        // schemes, which stay dead in a body as before: `hive://sign/...` is a
        // one-click wallet signing request.
        hrefSchemeAllowed = !!scheme && /^(?:tel|mailto|web\+[a-z0-9.+-]+)$/i.test(scheme[1]);
      }
      // Positive-whitelist: only http(s) is accepted. Any other scheme
      // (javascript:, data:, vbscript:, file:, etc.) is rejected by the
      // negation. We don't need an explicit blocklist alongside.
      if (tag === 'img' && name === 'src' && !/^https?:\/\//.test(decodedLower)) return '';
      // Validate srcset: reject if any candidate URL uses a non-http(s) protocol
      if ((tag === 'img' || tag === 'source') && name === 'srcset' && !beforeTransform && !isWellFormedSrcset(decoded)) return '';
      if (tag === 'img' && name === 'srcset') {
        const candidates = srcsetCandidates(decoded).map(parts => parts[0]);
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
      // A class the render did not stamp is the author's, on every path
      // (full render, its fallback, simple markdown for chat and paste): only
      // the classes an author may write survive (authorClasses).
      if (isWhiteAttr && name === 'class' && !trusted) {
        const kept = authorClasses(decoded);
        return kept ? `class="${escapeAttr(kept)}"` : '';
      }
      // The embed allow list holds on every path, including bodies that never
      // reached iframe() (#1919). iframe() only emits sources it accepts.
      // A src that is refused as written gets the spelling iframe() would
      // have given it (https, canonical host) one more try.
      // A legit embed URL never holds a raw TAB/LF/CR. The URL parser drops
      // them, so a check on the parsed URL and the string a browser or xss
      // ends up with can disagree; refuse them outright.
      if (!beforeTransform && (tag === 'iframe' && name === 'src' || EMBED_SRC_DATA_ATTRS.has(name)) && /[\t\n\r]/.test(decoded)) return '';
      if (tag === 'iframe' && name === 'src' && !beforeTransform && !isAllowedEmbedSrc(decoded)) {
        const canonical = canonicalEmbedSrc(decoded);
        return isAllowedEmbedSrc(canonical) ? `src="${escapeAttr(canonical)}"` : '';
      }
      // An author's sandbox keeps only the tokens iframe() itself grants.
      if (tag === 'iframe' && name === 'sandbox') {
        const tokens = decodedLower.split(/\s+/).filter(Boolean);
        const kept = tokens.filter(token => IFRAME_SANDBOX_GRANTS.has(token));
        if (kept.length !== tokens.length) return `sandbox="${kept.join(' ')}"`;
      }
      // Full-render output: images and posters only ever load through the
      // image proxy, whichever path produced them.
      if (enforce) {
        if (tag === 'img' && name === 'src' && !decoded.startsWith(proxyBase)) {
          // Non-http(s) sources were already refused above.
          const proxied = proxifyImageSrc(decoded, 0, 0, 'match', { forceProxy: true });
          return proxied ? `src="${escapeAttr(proxied)}"` : '';
        }
        if (tag === 'img' && name === 'srcset' && srcsetCandidates(decoded).some(parts => !parts[0].startsWith(proxyBase))) return '';
        // A poster loads like an image; the video() transform proxies it on
        // the transformed path.
        if (tag === 'video' && name === 'poster' && !decoded.startsWith(proxyBase)) {
          const proxied = /^https?:\/\//i.test(decoded)
            ? proxifyImageSrc(decoded, 0, 0, 'match', { forceProxy: true })
            : '';
          return proxied ? `poster="${escapeAttr(proxied)}"` : '';
        }
      }
      if (enforce) {
        // render-helper never writes a character reference or a control
        // character into a class value, so one there is the author's, hiding
        // a marker from stripAuthorMarkers until xss decodes it
        // (`markdown&#45;post-link`). Holds on trusted tags too. Control
        // characters separate tokens, as xss's own decoding does (it keeps
        // U+007F inside a token). App-mode entity placeholders are restored
        // to their references before this pass, so the `&` test covers them.
        if (isWhiteAttr && name === 'class' && /[&\u0000-\u001f\u007f]/.test(value)) {
          const kept = decoded
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .split(/\s+/)
            .filter(token => token && !/markdown/i.test(token))
            .join(' ');
          return kept ? `class="${escapeAttr(kept)}"` : '';
        }
        // The only link policy render-helper writes (a.method.ts
        // getExternalLinkRel and the untrusted-link rule below).
        if (tag === 'a' && name === 'rel' && !RENDER_HELPER_RELS.has(decodedLower.replace(/\s+/g, ' '))) return '';
        if (tag === 'a' && name === 'target' && decodedLower !== '_blank') return '';
      }
      // Tags the render did not stamp were hidden from the transforms (or no
      // transform ran): render-helper's markers and the link policy on them
      // are the author's, so they go.
      if (enforce && !trusted) {
        if (tag === 'a' && (name === 'target' || name === 'rel')) return '';
        // No a() pass ran on this link, so give an external href the policy
        // a() would have (the author's own rel/target were dropped above).
        // Read the way a browser reads it: leading spaces and controls dropped
        // (and U+FFFD, which `&#0;` decodes to and xss strips), tab/LF/CR
        // removed anywhere, `\` as `/` (`/\evil.example` is off-site). The link
        // is emitted in that reading, so no raw control or backslash form ships.
        const navigable = tag === 'a' && name === 'href'
          ? decoded.replace(/^[\u0000- �]+/, '').replace(/[\t\n\r]/g, '').replace(/\\/g, '/')
          : '';
        if (navigable && /^(?:https?:)?\/\//i.test(navigable)) {
          return `href="${escapeAttr(navigable)}" rel="nofollow ugc noopener"`;
        }
        if (RENDER_HELPER_DATA_ATTRIBUTES.has(name)) return '';
        if (isWhiteAttr && name === 'class') {
          const kept = stripMarkdownClasses(decoded);
          if (kept !== decoded) return kept ? `class="${escapeAttr(kept)}"` : '';
        }
      }
      // iframe-src data-* attrs: must resolve to an https:// allowed-embed-host
      // URL or they are blanked (stored HTML/iframe injection — CVE class).
      if (EMBED_SRC_DATA_ATTRS.has(name) && !isAllowedEmbedSrc(decoded)) return '';
      // data-href is a navigation target; block dangerous schemes only.
      if (name === 'data-href' && !isSafeNavValue(decoded)) return '';
      if (name === 'id') {
        if (!ID_WHITELIST.test(decoded)) return '';
        // render-helper writes no id of its own: every one is the author's (or
        // the markdown stage's footnotes), namespaced away from the page's.
        // Not in the pass before the transforms nor in the sanitize-only
        // fallback: the final pass always follows both, and the prefix must be
        // applied exactly once.
        if (isWhiteAttr && !beforeTransform && !untransformed) return `id="${escapeAttr(namespacedId(decoded))}"`;
      }
      // A same-document link follows the namespaced id it points at (the
      // app render carries it as data-href), matched as a browser matches a
      // fragment: as written, or percent-decoded.
      if (isWhiteAttr && !beforeTransform && !untransformed && tag === 'a' && (name === 'href' || name === 'data-href') && decoded.startsWith('#')) {
        const target = declaredFragment(decoded.slice(1));
        if (target !== null) return `${name}="#${escapeAttr(namespacedId(target))}"`;
      }
      // Every URL check above ran on the value decoded once. Left to itself,
      // xss would emit its own reading of the raw value: decoded again by the
      // browser (`&#38;#47;` passed as the text `&#47;` and loaded as `/`), or
      // with control characters turned into spaces (`.\n.` validated as `..`
      // and loaded as `.%20.`). Always emit exactly the string that was
      // validated.
      // A tel:, mailto: or web+ href is kept as checked above: xss's rule is
      // case-sensitive and does not know web+ (#2107: `TEL:` and `web+foo:` came
      // out as a bare href). Any other passes xss's own link rule too (it refuses
      // `java script:`, `%6a...:` and other non-links).
      if (isWhiteAttr && name === 'href') {
        // xss's rule is case-sensitive about http(s) too: `HTTPS://A.com/p` came
        // out as a bare href (#2159). The scheme is case-insensitive, so it is
        // checked and written lower-cased.
        const href = decoded.replace(/^https?:/i, (scheme) => scheme.toLowerCase());
        return hrefSchemeAllowed || xssSafeAttrValue(tag, name, href, undefined as never)
          ? `href="${escapeAttr(href)}"`
          : 'href';
      }
      if (!beforeTransform && isWhiteAttr && isUrlAttribute(tag, name)) {
        return `${name}="${escapeAttr(decoded)}"`;
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
  // An iframe whose src was refused above would render an empty frame; drop
  // it (dropRefusedIframes). xss writes every kept attribute as name="value",
  // so walk those rather than search the raw text, where `src=` could sit
  // inside another attribute's value.
  //
  // Repeated until nothing more is removed, so dropping one tag can never join
  // its neighbours into a new `<iframe`. On xss output a stray `<` is always
  // escaped, so in practice the second pass finds nothing.
  let withoutBareIframe = withoutBareSource;
  if (!beforeTransform) {
    let previous: string;
    do {
      previous = withoutBareIframe;
      withoutBareIframe = dropRefusedIframes(withoutBareIframe);
    } while (withoutBareIframe !== previous);
  }
  return preserveImageDimensions ? enforceImageDimensionPair(withoutBareIframe) : withoutBareIframe;
}
