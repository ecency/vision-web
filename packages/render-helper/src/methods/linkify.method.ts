import { IMG_REGEX, SECTION_LIST } from '../consts'
import { proxifyImageSrc, getProxyBase } from '../proxify-image-src'
import { isValidPermlink, isValidUsername, sanitizePermlink } from "../helper";
import { createImageHTML } from "./img.method";
import { RenderOptions } from "../types";

export function linkify(content: string, forApp: boolean, renderOptions?: RenderOptions): string {
  // Tags
  content = content.replace(/(^|\s|>)(#[-a-z\d]+)/gi, tag => {
    if (/#[\d]+$/.test(tag)) return tag // do not allow only numbers (like #1)
    const preceding = /^\s|>/.test(tag) ? tag[0] : '' // space or closing tag (>)
    tag = tag.replace(/^>/, '') // strip the leading > we captured as the precursor
    const tag2 = tag.trim().substring(1)
    const tagLower = tag2.toLowerCase()

    if (!forApp) {
      // No tag route to land on -> inert span rather than a dead, crawlable /trending link.
      if (renderOptions?.inertAuthorAndTagChips) {
        return `${preceding}<span class="er-tag er-tag-link">${tag.trim()}</span>`
      }
      return `${preceding}<a class="er-tag er-tag-link" href="/trending/${tagLower}">${tag.trim()}</a>`
    }
    return `${preceding}<a class="markdown-tag-link" data-tag="${tagLower}">${tag.trim()}</a>`
  })

  // User mentions - use placeholders for enhanced HTML to prevent image regex
  // from matching URLs inside the avatar <img src="..."> attribute
  const authorPlaceholders: { placeholder: string; html: string }[] = []

  content = content.replace(
    /(^|[^a-zA-Z0-9_!#$%&*@＠/]|(^|[^a-zA-Z0-9_+~.-/]))[@＠]([a-z][-.a-z\d^/]+[a-z\d])/gi,
    (match, preceeding1, preceeding2, user) => {
      const userLower = user.toLowerCase()
      const preceedings = (preceeding1 || '') + (preceeding2 || '')
      if (userLower.indexOf('/') === -1 && isValidUsername(user)) {
        if (!forApp) {
          const avatarSrc = `${getProxyBase()}/u/${userLower}/avatar/small`
          const inner = `<img class="er-author-link-image" src="${avatarSrc}" alt="${userLower}"/>@${userLower}`
          // No profile route to land on -> inert span rather than a dead, crawlable /@user link.
          const html = renderOptions?.inertAuthorAndTagChips
            ? `${preceedings}<span class="er-author er-author-link">${inner}</span>`
            : `${preceedings}<a class="er-author er-author-link" href="/@${userLower}">${inner}</a>`
          const placeholder = `\u200C${authorPlaceholders.length}\u200C`
          authorPlaceholders.push({ placeholder, html })
          return placeholder
        }
        return `${preceedings}<a class="markdown-author-link" data-author="${userLower}">@${user}</a>`
      } else {
        return match
      }
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
        const attrs = forApp ? `href="https://ecency.com/@${authorLower}/${permlink}"` : `href="/@${authorLower}/${permlink}"`
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
        const attrs = forApp ? `href="https://ecency.com/@${uu}/${permlink}"` : `href="/@${uu}/${permlink}"`
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

  // Restore author placeholders
  authorPlaceholders.forEach(({ placeholder, html }) => {
    content = content.replace(placeholder, html);
  });

  return content
}
