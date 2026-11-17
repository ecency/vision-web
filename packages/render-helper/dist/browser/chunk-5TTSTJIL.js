import { isHiddenElement, VALID_ATTRIBUTE_NAME } from './chunk-YYHKRTAC.js';
import { RENDER_HELPER_DATA_ATTRIBUTES, stripMarkdownClasses } from './chunk-XGVZLBT6.js';

// src/methods/strip-author-markers.method.ts
var ELEMENT_NODE = 1;
function normalizeElement(el) {
  const attrs = Array.from(el.attributes);
  const seen = /* @__PURE__ */ new Set();
  for (const attr of attrs) {
    const name = attr.name;
    if (!VALID_ATTRIBUTE_NAME.test(name)) {
      el.removeAttributeNode(attr);
      continue;
    }
    const lower = name.toLowerCase();
    if (seen.has(lower) || RENDER_HELPER_DATA_ATTRIBUTES.has(lower)) {
      seen.add(lower);
      el.removeAttributeNode(attr);
      continue;
    }
    seen.add(lower);
    let value = attr.value;
    if (lower === "class") {
      value = stripMarkdownClasses(value);
      if (!value) {
        el.removeAttributeNode(attr);
        continue;
      }
    }
    if (name !== lower) {
      el.removeAttributeNode(attr);
      el.setAttribute(lower, value);
    } else if (value !== attr.value) {
      el.setAttribute(lower, value);
    }
  }
}
function stripAuthorMarkers(doc) {
  const stack = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    const children = Array.from(node.childNodes || []);
    for (const child of children) {
      if (child.nodeType !== ELEMENT_NODE || isHiddenElement(child)) continue;
      normalizeElement(child);
      stack.push(child);
    }
  }
}

export { stripAuthorMarkers };
//# sourceMappingURL=chunk-5TTSTJIL.js.map
//# sourceMappingURL=chunk-5TTSTJIL.js.map