import { linkify } from './chunk-CQKBUXBU.js';
import { markInternalThumbnail } from './chunk-NQZM6AV2.js';
import { WHITE_LIST } from './chunk-4J745Z46.js';
import { YOUTUBE_REGEX, POST_REGEX } from './chunk-AS65CVY3.js';
import { proxifyImageSrc } from './chunk-LT2KELO7.js';
import { DOMParser } from './chunk-DBKALPTB.js';
import { extractYtStartTime, youtubeVideoLinkClass, sanitizePermlink, isValidUsername, isValidPermlink } from './chunk-QVFPA3RG.js';

// src/methods/text.method.ts
function hasAncestor(node, tagNames) {
  let current = node.parentNode;
  while (current) {
    if (tagNames.includes(current.nodeName.toLowerCase())) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}
var CHIP_CLASSES = ["er-author-link", "er-tag-link"];
function hasChipAncestor(node) {
  let current = node.parentNode;
  while (current) {
    const el = current;
    const className = typeof el.getAttribute === "function" ? el.getAttribute("class") : null;
    if (className && className.split(/\s+/).some((token) => CHIP_CLASSES.includes(token))) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}
function text(node, forApp, renderOptions) {
  if (!node || !node.parentNode) {
    return;
  }
  if (hasAncestor(node, ["a", "code", "pre"])) {
    return;
  }
  if (renderOptions?.inertAuthorAndTagChips && hasChipAncestor(node)) {
    return;
  }
  const nodeValue = node.nodeValue || "";
  const escaped = nodeValue.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linkified = linkify(escaped, forApp, renderOptions);
  if (linkified !== escaped) {
    const doc = DOMParser.parseFromString(
      `<span class="wr">${linkified}</span>`,
      "text/html"
    );
    const replaceNode = doc.body?.firstChild || doc.firstChild;
    if (replaceNode) {
      node.parentNode.insertBefore(replaceNode, node);
      node.parentNode.removeChild(node);
    }
    return;
  }
  if (nodeValue.match(YOUTUBE_REGEX)) {
    const e = YOUTUBE_REGEX.exec(nodeValue);
    if (e && e[1]) {
      const vid = e[1];
      const thumbnail = proxifyImageSrc(`https://img.youtube.com/vi/${vid.split("?")[0]}/hqdefault.jpg`, 0, 0, "match");
      const embedSrc = `https://www.youtube.com/embed/${vid}?autoplay=1`;
      const startTime = extractYtStartTime(nodeValue);
      const container = node.ownerDocument.createElement("p");
      const anchor = node.ownerDocument.createElement("a");
      anchor.setAttribute("class", youtubeVideoLinkClass(e[0]));
      anchor.setAttribute("data-embed-src", embedSrc);
      anchor.setAttribute("data-youtube", vid);
      if (startTime) {
        anchor.setAttribute("data-start-time", startTime);
      }
      const thumbImg = node.ownerDocument.createElement("img");
      thumbImg.setAttribute("class", "no-replace video-thumbnail");
      markInternalThumbnail(thumbImg);
      thumbImg.setAttribute("src", thumbnail);
      anchor.appendChild(thumbImg);
      const play = node.ownerDocument.createElement("span");
      play.setAttribute("class", "markdown-video-play");
      anchor.appendChild(play);
      container.appendChild(anchor);
      let start = e.index;
      while (start > 0 && !/\s/.test(nodeValue[start - 1])) start--;
      let end = e.index + e[0].length;
      while (end < nodeValue.length && !/\s/.test(nodeValue[end])) end++;
      const before = nodeValue.slice(0, start);
      const after = nodeValue.slice(end);
      const parent = node.parentNode;
      if (before) parent.insertBefore(node.ownerDocument.createTextNode(before), node);
      if (after) parent.insertBefore(node.ownerDocument.createTextNode(after), node.nextSibling);
      parent.replaceChild(container, node);
      return;
    }
  }
  if (nodeValue && typeof nodeValue === "string") {
    const postMatch = nodeValue.trim().match(POST_REGEX);
    if (postMatch && WHITE_LIST.includes(postMatch[1].replace(/^www\./, ""))) {
      const tag = postMatch[2];
      const author = postMatch[3].replace("@", "");
      const permlink = sanitizePermlink(postMatch[4]);
      if (!tag || !/^[a-z0-9_-]+$/i.test(tag)) return;
      if (!isValidUsername(author)) return;
      if (!isValidPermlink(permlink)) return;
      const attrs = forApp ? `data-tag="${tag}" data-author="${author}" data-permlink="${permlink}" class="markdown-post-link"` : `class="markdown-post-link" href="/@${author}/${permlink}"`;
      const doc = DOMParser.parseFromString(
        `<a ${attrs}>/@${author}/${permlink}</a>`,
        "text/html"
      );
      const replaceNode = doc.body?.firstChild || doc.firstChild;
      if (replaceNode) {
        node.parentNode.replaceChild(replaceNode, node);
      }
    }
  }
}

export { text };
//# sourceMappingURL=chunk-2E4P5LYV.js.map
//# sourceMappingURL=chunk-2E4P5LYV.js.map