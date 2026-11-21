import { isHiddenElement } from './chunk-YYHKRTAC.js';
import { text } from './chunk-5VDJ37UC.js';
import { video } from './chunk-HDLK5II7.js';
import { p } from './chunk-S6DHLIVP.js';
import { a } from './chunk-4T7PWG5Y.js';
import { iframe } from './chunk-MOZHYORO.js';
import { img } from './chunk-Z6GSTPSM.js';

// src/methods/traverse.method.ts
var MAX_TRAVERSE_DEPTH = 2e3;
function flattenToText(node) {
  if (node.nodeType !== 1) return;
  const text2 = node.textContent || "";
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  if (text2 && node.ownerDocument) {
    node.appendChild(node.ownerDocument.createTextNode(text2));
  }
}
function traverse(node, forApp, depth = 0, state = { firstImageFound: false }, parentDomain = "ecency.com", seoContext, renderOptions) {
  if (!node || !node.childNodes) {
    return;
  }
  if (depth > MAX_TRAVERSE_DEPTH) {
    flattenToText(node);
    return;
  }
  let child = node.firstChild;
  while (child) {
    const next = child.nextSibling;
    const prev = child.previousSibling;
    if (child.nodeType === 1 && isHiddenElement(child)) {
      child = next;
      continue;
    }
    if (child.nodeName.toLowerCase() === "a") {
      a(child, forApp, parentDomain, seoContext, renderOptions);
    }
    if (child.nodeName.toLowerCase() === "iframe") {
      iframe(child, parentDomain, forApp, renderOptions);
    }
    if (child.nodeName === "#text") {
      text(child, forApp, renderOptions);
    }
    if (child.nodeName.toLowerCase() === "img") {
      img(child, state, forApp, renderOptions);
    }
    if (child.nodeName.toLowerCase() === "p") {
      p(child);
    }
    if (child.nodeName.toLowerCase() === "video") {
      video(child);
    }
    if (child.parentNode) {
      traverse(child, forApp, depth + 1, state, parentDomain, seoContext, renderOptions);
    } else {
      const possibleReplacement = next ? next.previousSibling : node.lastChild;
      const isRefusedIframePlaceholder = possibleReplacement?.nodeType === 1 && child.nodeName.toLowerCase() === "iframe" && possibleReplacement.getAttribute("class") === "unsupported-iframe";
      if (possibleReplacement && !isRefusedIframePlaceholder && possibleReplacement !== prev && possibleReplacement.parentNode === node) {
        traverse(possibleReplacement, forApp, depth + 1, state, parentDomain, seoContext, renderOptions);
      }
    }
    child = next;
  }
}

export { MAX_TRAVERSE_DEPTH, traverse };
//# sourceMappingURL=chunk-XVNLHQ44.js.map
//# sourceMappingURL=chunk-XVNLHQ44.js.map