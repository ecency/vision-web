import { createImageHTML } from './chunk-JJUDG2FE.js';
import { SECTION_LIST } from './chunk-P5HRQG6E.js';
import { getProxyBase } from './chunk-LT2KELO7.js';
import { isValidUsername, sanitizePermlink, isValidPermlink, imageUrlEnd } from './chunk-OEOVNYVL.js';

// src/methods/linkify.method.ts
var RUN_TAG = "#[-a-z\\d]+";
var RUN_MENTION = "[@\uFF20][a-z][-.a-z\\d^/]+[a-z\\d]";
var RUN_ITEM = new RegExp(`${RUN_TAG}|${RUN_MENTION}`, "gi");
var TAG_RUN = new RegExp(`(^|\\s|>|&gt;)(${RUN_TAG}(?:${RUN_TAG}|${RUN_MENTION})*)`, "gi");
var MENTION_RUN = new RegExp(
  `(^|[^a-zA-Z0-9_!#$%&*@\uFF20/]|(^|[^a-zA-Z0-9_+~.-/]))[@\uFF20]([a-z][-.a-z\\d^/]+[a-z\\d])((?:${RUN_MENTION}|${RUN_TAG})*)`,
  "gi"
);
function itemsLength(items, count) {
  let n = 0;
  for (let i = 0; i < count; i++) n += items[i].length;
  return n;
}
function replaceRuns(content, re, fn) {
  re.lastIndex = 0;
  let out = "";
  let last = 0;
  let match;
  while (match = re.exec(content)) {
    const [replacement, consumed] = fn(match);
    out += content.slice(last, match.index) + replacement;
    last = match.index + Math.max(consumed, 1);
    re.lastIndex = last;
  }
  return out + content.slice(last);
}
function isLinkableMention(mention) {
  const user = mention.substring(1);
  return user.indexOf("/") === -1 && isValidUsername(user);
}
var URL_TOKEN_RE = /https?:\/\/(?:[^\s<>"'&]|&(?!lt;|gt;))+/gi;
var attr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function linkify(content, forApp, renderOptions) {
  const authorPlaceholders = [];
  const tagHtml = (tag) => {
    const tagLower = tag.substring(1).toLowerCase();
    if (!forApp) {
      return renderOptions?.inertAuthorAndTagChips ? `<span class="er-tag er-tag-link">${tag}</span>` : `<a class="er-tag er-tag-link" href="/trending/${attr(tagLower)}">${tag}</a>`;
    }
    return `<a class="markdown-tag-link" data-tag="${attr(tagLower)}">${tag}</a>`;
  };
  const mentionHtml = (mention, before, placeholder) => {
    if (!isLinkableMention(mention)) return null;
    const user = mention.substring(1);
    const userLower = user.toLowerCase();
    let html;
    if (!forApp) {
      const avatarSrc = `${getProxyBase()}/u/${userLower}/avatar/small`;
      const inner = `<img class="er-author-link-image" src="${attr(avatarSrc)}" alt="${attr(userLower)}"/>@${userLower}`;
      html = renderOptions?.inertAuthorAndTagChips ? `${before}<span class="er-author er-author-link">${inner}</span>` : `${before}<a class="er-author er-author-link" href="/@${attr(userLower)}">${inner}</a>`;
    } else {
      html = `${before}<a class="markdown-author-link" data-author="${attr(userLower)}">@${user}</a>`;
      if (!placeholder) return html;
    }
    const token = `\u200C${authorPlaceholders.length}\u200C`;
    authorPlaceholders.push(html);
    return token;
  };
  const linkRun = (items, before, placeholder) => {
    let out = "";
    let pending = before;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const html = item[0] === "#" ? /^#\d+$/.test(item) ? null : pending + tagHtml(item) : mentionHtml(item, pending, placeholder);
      if (html === null) return [out, i];
      out += html;
      pending = "";
    }
    return [out, items.length];
  };
  content = replaceRuns(content, TAG_RUN, (match) => {
    const before = match[1];
    const items = match[2].match(RUN_ITEM);
    const preceding = before === ">" || before === "&gt;" || /^\s$/.test(before) ? before : "";
    const [html, linked] = linkRun(items, preceding, true);
    if (linked === 0) {
      const head = before.length + items[0].length;
      return [match[0].substring(0, head), head];
    }
    return [html, before.length + itemsLength(items, linked)];
  });
  content = replaceRuns(content, MENTION_RUN, (match) => {
    const preceedings = match[1] || "";
    const user = match[3];
    const rest = match[4];
    const head = match[0].length - rest.length;
    const first = match[0].substring(head - user.length - 1, head);
    const items = [first, ...rest.match(RUN_ITEM) ?? []];
    const [html, linked] = linkRun(items, preceedings, false);
    if (linked === 0) return [match[0].substring(0, head), head];
    return [html, head - first.length + itemsLength(items, linked)];
  });
  content = content.replace(
    /(^|\s)\/([a-z0-9-]+)\/@([\w.\d-]+)\/(\S+)/gi,
    (match, preceding, tag, author, p3) => {
      const authorLower = author.toLowerCase();
      if (!isValidUsername(authorLower)) return match;
      const permlink = sanitizePermlink(p3);
      if (!isValidPermlink(permlink)) return match;
      if (SECTION_LIST.includes(permlink)) {
        const external = renderOptions?.externalProfileBase;
        const attrs = forApp || external ? `href="${external ?? "https://ecency.com"}/@${authorLower}/${permlink}"` : `href="/@${authorLower}/${permlink}"`;
        return `${preceding}<a class="markdown-profile-link" ${attrs}>@${authorLower}/${permlink}</a>`;
      } else {
        const attrs = forApp ? `data-author="${authorLower}" data-tag="${tag}" data-permlink="${permlink}"` : `href="/@${authorLower}/${permlink}"`;
        return `${preceding}<a class="markdown-post-link" ${attrs}>@${authorLower}/${permlink}</a>`;
      }
    }
  );
  content = content.replace(
    /((^|\s)\/@[\w.\d-]+)\/(\S+)/gi,
    (match, u, _p1, p3) => {
      const uu = u.trim().toLowerCase().replace("/@", "").replace("@", "");
      const permlink = sanitizePermlink(p3);
      if (!isValidPermlink(permlink)) return match;
      if (SECTION_LIST.includes(permlink)) {
        const external = renderOptions?.externalProfileBase;
        const attrs = forApp || external ? `href="${external ?? "https://ecency.com"}/@${uu}/${permlink}"` : `href="/@${uu}/${permlink}"`;
        return ` <a class="markdown-profile-link" ${attrs}>@${uu}/${permlink}</a>`;
      } else {
        const attrs = forApp ? `data-author="${uu}" data-tag="post" data-permlink="${permlink}"` : `href="/@${uu}/${permlink}"`;
        return ` <a class="markdown-post-link" ${attrs}>@${uu}/${permlink}</a>`;
      }
    }
  );
  let firstImageUsed = false;
  content = content.replace(URL_TOKEN_RE, (token) => {
    const end = imageUrlEnd(token);
    if (end === -1) return token;
    const isLCP = !firstImageUsed;
    firstImageUsed = true;
    return createImageHTML(token.slice(0, end), isLCP, forApp) + token.slice(end);
  });
  if (authorPlaceholders.length > 0) {
    const restored = /* @__PURE__ */ new Set();
    const token = /\u200C(\d+)(?=\u200C)/g;
    let out = "";
    let last = 0;
    let match;
    while (match = token.exec(content)) {
      const index = Number(match[1]);
      if (index >= authorPlaceholders.length || restored.has(index)) continue;
      restored.add(index);
      const end = match.index + match[0].length + 1;
      out += content.slice(last, match.index) + authorPlaceholders[index];
      last = end;
      token.lastIndex = end;
    }
    content = out + content.slice(last);
  }
  return content;
}

export { linkify };
//# sourceMappingURL=chunk-EXMICESB.js.map
//# sourceMappingURL=chunk-EXMICESB.js.map