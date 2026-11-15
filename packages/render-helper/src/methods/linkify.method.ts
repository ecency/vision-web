import { IMG_REGEX, SECTION_LIST } from '../consts'
import { proxifyImageSrc, getProxyBase } from '../proxify-image-src'
import { isValidPermlink, isValidUsername, sanitizePermlink } from "../helper";
import { createImageHTML } from "./img.method";
import { RenderOptions } from "../types";

export function linkify(content: string, forApp: boolean, renderOptions?: RenderOptions): string {
  // Tags. A run of adjacent tags (`#a#b#c`) is linked in this one pass. The
  // old single-tag pattern linked only the first tag of a run; traverse() then
  // re-linkified the rest of the text in a new nested node, once per tag, which
  // made long runs quadratic and blew the stack around a few thousand (#1920).
  // A numbers-only tag is never linked and still ends the run, exactly where
  // the nested passes used to stop.
  content = content.replace(/(^|\s|>)(#[-a-z\d]+(?:#[-a-z\d]+)*)/gi, (match, before: string, run: string) => {
    let out = before === '>' || /^\s$/.test(before) ? before : ''
    const tags = run.match(/#[-a-z\d]+/gi) as string[]
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i]
      if (/^#\d+$/.test(tag)) return out + tags.slice(i).join('') // do not allow only numbers (like #1)
      const tagLower = tag.substring(1).toLowerCase()
      if (!forApp) {
        // No tag route to land on -> inert span rather than a dead, crawlable /trending link.
        out += renderOptions?.inertAuthorAndTagChips
          ? `<span class="er-tag er-tag-link">${tag}</span>`
          : `<a class="er-tag er-tag-link" href="/trending/${tagLower}">${tag}</a>`
      } else {
        out += `<a class="markdown-tag-link" data-tag="${tagLower}">${tag}</a>`
      }
    }
    return out
  })

  // User mentions - use placeholders for enhanced HTML to prevent image regex
  // from matching URLs inside the avatar <img src="..."> attribute
  const authorPlaceholders: string[] = []

  // A run of adjacent mentions (`@alice@bob`) is handled in this one pass for
  // the same reason as tag runs above: the rest of the run used to be picked up
  // one mention per nested traverse() level (#1920). The run stops at the first
  // mention that would not be linked, which is where the nested passes stopped.
  content = content.replace(
    /(^|[^a-zA-Z0-9_!#$%&*@＠/]|(^|[^a-zA-Z0-9_+~.-/]))[@＠]([a-z][-.a-z\d^/]+[a-z\d])((?:[@＠][a-z][-.a-z\d^/]+[a-z\d])*)/gi,
    (match, preceeding1, preceeding2, user, rest) => {
      const preceedings = (preceeding1 || '') + (preceeding2 || '')
      const mentions = [user as string]
      const raws = [match.substring(match.length - rest.length - user.length - 1, match.length - rest.length)]
      if (rest) {
        for (const m of (rest as string).matchAll(/[@＠]([a-z][-.a-z\d^/]+[a-z\d])/gi)) {
          mentions.push(m[1])
          raws.push(m[0])
        }
      }
      // The text before the first mention travels inside its placeholder, as
      // it always has: the internal link pass below must see the same string.
      let pending = preceedings
      let out = ''
      for (let i = 0; i < mentions.length; i++) {
        const mention = mentions[i]
        const userLower = mention.toLowerCase()
        if (userLower.indexOf('/') !== -1 || !isValidUsername(mention)) {
          return i === 0 ? match : out + raws.slice(i).join('')
        }
        if (!forApp) {
          const avatarSrc = `${getProxyBase()}/u/${userLower}/avatar/small`
          const inner = `<img class="er-author-link-image" src="${avatarSrc}" alt="${userLower}"/>@${userLower}`
          // No profile route to land on -> inert span rather than a dead, crawlable /@user link.
          const html = renderOptions?.inertAuthorAndTagChips
            ? `${pending}<span class="er-author er-author-link">${inner}</span>`
            : `${pending}<a class="er-author er-author-link" href="/@${userLower}">${inner}</a>`
          const placeholder = `\u200C${authorPlaceholders.length}\u200C`
          authorPlaceholders.push(html)
          out += placeholder
        } else {
          out += `${pending}<a class="markdown-author-link" data-author="${userLower}">@${mention}</a>`
        }
        pending = ''
      }
      return out
    }
  )

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
  // typed into the body cannot duplicate a mention.
  if (authorPlaceholders.length > 0) {
    const restored = new Set<number>()
    content = content.replace(/\u200C(\d+)\u200C/g, (placeholder, digits: string) => {
      const index = Number(digits)
      if (index >= authorPlaceholders.length || restored.has(index)) return placeholder
      restored.add(index)
      return authorPlaceholders[index]
    })
  }

  return content
}
