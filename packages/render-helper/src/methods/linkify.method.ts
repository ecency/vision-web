import { IMG_REGEX, SECTION_LIST } from '../consts'
import { proxifyImageSrc, getProxyBase } from '../proxify-image-src'
import { isValidPermlink, isValidUsername, sanitizePermlink } from "../helper";
import { createImageHTML } from "./img.method";
import { RenderOptions } from "../types";

// One item of an adjacent run: a tag or a mention, written exactly as the tag
// and mention patterns below match them.
const RUN_TAG = '#[-a-z\\d]+'
const RUN_MENTION = '[@＠][a-z][-.a-z\\d^/]+[a-z\\d]'
const RUN_ITEM = new RegExp(`${RUN_TAG}|${RUN_MENTION}`, 'gi')
const TAG_RUN = new RegExp(`(^|\\s|>|&gt;)(${RUN_TAG}(?:${RUN_TAG}|${RUN_MENTION})*)`, 'gi')
const MENTION_RUN = new RegExp(
  `(^|[^a-zA-Z0-9_!#$%&*@＠/]|(^|[^a-zA-Z0-9_+~.-/]))[@＠]([a-z][-.a-z\\d^/]+[a-z\\d])((?:${RUN_MENTION}|${RUN_TAG})*)`,
  'gi'
)

function itemsLength(items: string[], count: number): number {
  let n = 0
  for (let i = 0; i < count; i++) n += items[i].length
  return n
}

/**
 * `String.replace` with a global regex, except the callback says how much of
 * the match it consumed. Scanning resumes right after that, so the unlinked
 * tail of a run is matched again exactly as if the run had ended there.
 */
function replaceRuns(
  content: string,
  re: RegExp,
  fn: (match: RegExpExecArray) => [string, number]
): string {
  re.lastIndex = 0
  let out = ''
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(content))) {
    const [replacement, consumed] = fn(match)
    out += content.slice(last, match.index) + replacement
    last = match.index + Math.max(consumed, 1)
    re.lastIndex = last
  }
  return out + content.slice(last)
}

function isLinkableMention(mention: string): boolean {
  const user = mention.substring(1)
  return user.indexOf('/') === -1 && isValidUsername(user)
}

export function linkify(content: string, forApp: boolean, renderOptions?: RenderOptions): string {
  // User mentions - use placeholders for enhanced HTML to prevent image regex
  // from matching URLs inside the avatar <img src="..."> attribute
  const authorPlaceholders: string[] = []

  const tagHtml = (tag: string): string => {
    const tagLower = tag.substring(1).toLowerCase()
    if (!forApp) {
      // No tag route to land on -> inert span rather than a dead, crawlable /trending link.
      return renderOptions?.inertAuthorAndTagChips
        ? `<span class="er-tag er-tag-link">${tag}</span>`
        : `<a class="er-tag er-tag-link" href="/trending/${tagLower}">${tag}</a>`
    }
    return `<a class="markdown-tag-link" data-tag="${tagLower}">${tag}</a>`
  }

  // `before` is the text ahead of the mention; it travels inside the
  // placeholder, as it always has, so the internal link pass sees the same
  // string. App mentions are placeholders only when `placeholder` is set: the
  // mention pass must not re-match one the tag pass already built.
  const mentionHtml = (mention: string, before: string, placeholder: boolean): string | null => {
    if (!isLinkableMention(mention)) return null
    const user = mention.substring(1)
    const userLower = user.toLowerCase()
    let html: string
    if (!forApp) {
      const avatarSrc = `${getProxyBase()}/u/${userLower}/avatar/small`
      const inner = `<img class="er-author-link-image" src="${avatarSrc}" alt="${userLower}"/>@${userLower}`
      // No profile route to land on -> inert span rather than a dead, crawlable /@user link.
      html = renderOptions?.inertAuthorAndTagChips
        ? `${before}<span class="er-author er-author-link">${inner}</span>`
        : `${before}<a class="er-author er-author-link" href="/@${userLower}">${inner}</a>`
    } else {
      html = `${before}<a class="markdown-author-link" data-author="${userLower}">@${user}</a>`
      if (!placeholder) return html
    }
    const token = `\u200C${authorPlaceholders.length}\u200C`
    authorPlaceholders.push(html)
    return token
  }

  // Links the items of an adjacent run of tags and mentions (`#a#b`,
  // `@alice@bob`, `#a@alice#b`) in one pass (#1920). Each item used to be
  // picked up by its own nested traverse() level, with the rest of the text
  // re-parsed every time: quadratic, and out of stack around a few thousand.
  // The run stops at the first item that would not be linked (a numbers-only
  // tag, an invalid mention), which is where the nested passes stopped too.
  // Returns the markup and how many items it linked.
  const linkRun = (items: string[], before: string, placeholder: boolean): [string, number] => {
    let out = ''
    let pending = before
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const html = item[0] === '#'
        ? (/^#\d+$/.test(item) ? null : pending + tagHtml(item)) // do not allow only numbers (like #1)
        : mentionHtml(item, pending, placeholder)
      if (html === null) return [out, i]
      out += html
      pending = ''
    }
    return [out, items.length]
  }

  // Tags, and any mentions glued to them.
  content = replaceRuns(content, TAG_RUN, (match) => {
    const before = match[1]
    const items = match[2].match(RUN_ITEM) as string[]
    // `&gt;` is a `>` from the text, escaped by text() before linkify runs.
    const preceding = before === '>' || before === '&gt;' || /^\s$/.test(before) ? before : ''
    const [html, linked] = linkRun(items, preceding, true)
    if (linked === 0) {
      const head = before.length + items[0].length
      return [match[0].substring(0, head), head]
    }
    return [html, before.length + itemsLength(items, linked)]
  })

  // Mentions, and any tags glued to them.
  content = replaceRuns(content, MENTION_RUN, (match) => {
    // Group 2 is nested inside group 1, so it repeats the same character;
    // adding both doubled the character before the mention (`$@alice`).
    const preceedings = match[1] || ''
    const user = match[3]
    const rest = match[4]
    const head = match[0].length - rest.length // text before the first mention, plus the mention
    const first = match[0].substring(head - user.length - 1, head)
    const items = [first, ...((rest.match(RUN_ITEM) as string[] | null) ?? [])]
    const [html, linked] = linkRun(items, preceedings, false)
    if (linked === 0) return [match[0].substring(0, head), head]
    return [html, head - first.length + itemsLength(items, linked)]
  })

  // internal links with category: /category/@user/permlink
  content = content.replace(
    /(^|\s)\/([a-z0-9-]+)\/@([\w.\d-]+)\/(\S+)/gi, (match, preceding, tag, author, p3) => {
      const authorLower = author.toLowerCase();
      if (!isValidUsername(authorLower)) return match;
      const permlink = sanitizePermlink(p3);
      if (!isValidPermlink(permlink)) return match;

      if (SECTION_LIST.includes(permlink)) {
        // A profile section, not a post. A consumer with no profile route sends
        // it to `/:author/:permlink` and tries to load a post called `wallet`.
        const external = renderOptions?.externalProfileBase
        const attrs = forApp || external
          ? `href="${external ?? 'https://ecency.com'}/@${authorLower}/${permlink}"`
          : `href="/@${authorLower}/${permlink}"`
        return `${preceding}<a class="markdown-profile-link" ${attrs}>@${authorLower}/${permlink}</a>`
      } else {
        const attrs = forApp ? `data-author="${authorLower}" data-tag="${tag}" data-permlink="${permlink}"` : `href="/@${authorLower}/${permlink}"`
        return `${preceding}<a class="markdown-post-link" ${attrs}>@${authorLower}/${permlink}</a>`
      }
    }
  )

  // internal links — require leading / to distinguish /@user/permlink (Hive links)
  // from @scope/package (npm packages, GitHub orgs, etc.)
  content = content.replace(
    /((^|\s)\/@[\w.\d-]+)\/(\S+)/gi, (match, u, _p1, p3) => {
      const uu = u.trim().toLowerCase().replace('/@', '').replace('@', '');
      const permlink = sanitizePermlink(p3);
      if (!isValidPermlink(permlink)) return match;

      if (SECTION_LIST.includes(permlink)) {
        // Same as above: a section name, routed as a permlink by any consumer
        // whose only match is `/:author/:permlink`.
        const external = renderOptions?.externalProfileBase
        const attrs = forApp || external
          ? `href="${external ?? 'https://ecency.com'}/@${uu}/${permlink}"`
          : `href="/@${uu}/${permlink}"`
        return ` <a class="markdown-profile-link" ${attrs}>@${uu}/${permlink}</a>`
      } else {
        const attrs = forApp ? `data-author="${uu}" data-tag="post" data-permlink="${permlink}"` : `href="/@${uu}/${permlink}"`
        return ` <a class="markdown-post-link" ${attrs}>@${uu}/${permlink}</a>`
      }
    }
  )

  // Image links
  // Process images before restoring author placeholders to avoid
  // the image regex matching URLs inside enhanced author HTML
  let firstImageUsed = false;

  content = content.replace(IMG_REGEX, (imglink) => {
    const isLCP = !firstImageUsed;
    firstImageUsed = true;
    return createImageHTML(imglink, isLCP, forApp);
  });

  // Restore author placeholders in one scan. One replace() per placeholder
  // rescanned the whole string each time, quadratic on long mention lists.
  // Only the first occurrence of each is restored, as before, so a look-alike
  // typed into the body cannot duplicate a mention. The closing U+200C is
  // matched by lookahead and consumed only for a real placeholder, so a
  // typed look-alike that runs straight into one (`\u200C5` + `\u200C0\u200C`)
  // cannot eat its opening delimiter.
  if (authorPlaceholders.length > 0) {
    const restored = new Set<number>()
    const token = /\u200C(\d+)(?=\u200C)/g
    let out = ''
    let last = 0
    let match: RegExpExecArray | null
    while ((match = token.exec(content))) {
      const index = Number(match[1])
      if (index >= authorPlaceholders.length || restored.has(index)) continue
      restored.add(index)
      const end = match.index + match[0].length + 1 // the closing U+200C
      out += content.slice(last, match.index) + authorPlaceholders[index]
      last = end
      token.lastIndex = end
    }
    content = out + content.slice(last)
  }

  return content
}
