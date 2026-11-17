import { XSSWhiteList } from '../types'

export const ALLOWED_ATTRIBUTES: XSSWhiteList = {
  'a': [
    'href',
    'target',
    'rel',
    'data-permlink',
    'data-tag',
    'data-author',
    'data-href',
    'data-community',
    'data-filter',
    'data-embed-src',
    'data-youtube',
    'data-start-time',
    'data-video-href',
    'data-proposal',
    'data-is-inline',
    'class',
    'title',
    'data-id',
    'id'
  ],
  'img': [
    'src',
    'srcset',
    'sizes',
    'alt',
    'class',
    'loading',
    'fetchpriority',
    'decoding',
    'itemprop'
  ],
  // Responsive image content-negotiation wrapper emitted for web/self-hosted
  // (forApp === false). Without these entries `xss` silently collapses the
  // <picture>/<source> to a bare <img>. `source` attrs are further constrained
  // in sanitize-html (srcset must be a proxy /p/ URL; type must be avif/webp;
  // a type-less <source> is dropped post-pass).
  'picture': [],
  'source': ['type', 'srcset', 'sizes'],
  'span': ['class', 'id', 'data-align'],
  'iframe': ['src', 'class', 'frameborder', 'allowfullscreen', 'webkitallowfullscreen', 'mozallowfullscreen', 'sandbox'],
  'video': ['src', 'controls', 'poster'],
  'audio': ['src', 'controls', 'preload'],
  'div': ['class', 'id', 'data-align'],
  'strong': [],
  'b': [],
  'i': [],
  'strike': [],
  'em': [],
  'code': [],
  'pre': [],
  'blockquote': ['class'],
  'sup': [],
  'sub': [],
  'h1': ['dir', 'id', 'data-align'],
  'h2': ['dir', 'id', 'data-align'],
  'h3': ['dir', 'id', 'data-align'],
  'h4': ['dir', 'id', 'data-align'],
  'h5': ['dir', 'id', 'data-align'],
  'h6': ['dir', 'id', 'data-align'],
  'p': ['dir', 'id', 'data-align'],
  'center': [],
  'ul': [],
  'ol': [],
  'li': [],
  'table': [],
  'thead': [],
  'tbody': [],
  'tr': [],
  'td': [],
  'th': [],
  'hr': [],
  'br': [],
  'del': [],
  'ins': []
}

// data-* attributes the DOM transforms set to mark links they built (post
// cards, mentions, tags, communities, proposals, click-to-play embeds).
// Clients route taps on them, so the author-written copies are stripped
// before the transforms run and on the sanitize-only path (#1919).
export const RENDER_HELPER_DATA_ATTRIBUTES: ReadonlySet<string> = new Set([
  'data-author',
  'data-community',
  'data-embed-src',
  'data-filter',
  'data-href',
  'data-is-inline',
  'data-permlink',
  'data-proposal',
  'data-start-time',
  'data-tag',
  'data-video-href',
  'data-youtube'
])

/**
 * A class value without render-helper's `markdown-*` marker tokens. A token
 * that merely contains `markdown-` (`\`markdown-x\``, `]]>markdown-x`) goes
 * too: render-helper never emits one, and a client matching class names by
 * substring would read it as a marker.
 */
export function stripMarkdownClasses(value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean)
  const kept = tokens.filter((token) => !/markdown-/i.test(token))
  return kept.length === tokens.length ? value : kept.join(' ')
}

// The classes an author may write: the formatting classes Hive posts have
// always been written with (the list condenser allowed), nothing the page's own
// stylesheet would apply. The page's utility classes (`fixed inset-0 z-[...]`)
// would otherwise let a post cover the whole viewport or hide parts of the app.
const AUTHOR_CLASSES: ReadonlySet<string> = new Set([
  'pull-right', 'pull-left', 'text-justify', 'text-rtl', 'text-center', 'text-right', 'videoWrapper', 'phishy'
])
// What the markdown stage writes before the DOM pass sees the body, so it
// reaches the author-class filter too: footnotes, code highlighting (ll-*) and
// a fenced block's language.
const MARKDOWN_STAGE_CLASSES: ReadonlySet<string> = new Set([
  'footnote-backref', 'footnote-item', 'footnote-ref', 'footnotes', 'footnotes-list', 'footnotes-sep'
])
const MARKDOWN_STAGE_CLASS_RE = /^(?:ll-[a-z]+|language-[A-Za-z0-9_+#.-]+)$/

/**
 * An author-written class value reduced to the classes an author may use.
 * Control characters separate tokens, as xss reads them. Returns the value
 * unchanged when every token is kept.
 */
export function authorClasses(value: string): string {
  const tokens = value.replace(/[\u0000-\u001f\u007f]/g, ' ').split(/\s+/).filter(Boolean)
  const kept = tokens.filter(
    (token) =>
      !/markdown-/i.test(token) &&
      (AUTHOR_CLASSES.has(token) || MARKDOWN_STAGE_CLASSES.has(token) || MARKDOWN_STAGE_CLASS_RE.test(token))
  )
  return kept.length === tokens.length && !/[\u0000-\u001f\u007f]/.test(value) ? value : kept.join(' ')
}

/**
 * An author-written id, namespaced so it can never equal an id the page uses
 * (`modal-dialog-container`) or a window global it reads by name (`nws`).
 * Same-document `#fragment` links get the same prefix (namespacedFragment).
 */
export const AUTHOR_ID_PREFIX = 'user-content-'
export function namespacedId(id: string): string {
  return id.startsWith(AUTHOR_ID_PREFIX) ? id : AUTHOR_ID_PREFIX + id
}

// The only sandbox tokens iframe() and a() ever grant an embed. An author's
// sandbox keeps these and loses everything else (allow-top-navigation,
// allow-forms, allow-modals, ...).
export const IFRAME_SANDBOX_GRANTS: ReadonlySet<string> = new Set([
  'allow-scripts',
  'allow-same-origin',
  'allow-popups'
])
