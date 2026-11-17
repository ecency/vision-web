// src/methods/render-boundary.method.ts
var RENDER_NONCE_ATTRIBUTE = "data-rh";
var VALID_ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9:_.-]*$/;
var VALID_ATTRIBUTE_NAME = /^[A-Za-z0-9_:.-]+$/;
var STRICT_STAMPED_TAG = /^<[A-Za-z][A-Za-z0-9:_.-]*(?:\s+[A-Za-z0-9_:.-]+="[^"]*")*\s*\/?>$/;
function isStrictTag(rawTag) {
  return STRICT_STAMPED_TAG.test(rawTag);
}
var WRAPPER_ELEMENTS = /* @__PURE__ */ new Set(["html", "head", "body"]);
function isHiddenElement(node) {
  const name = node.nodeName;
  if (!VALID_ELEMENT_NAME.test(name)) return true;
  const local = name.toLowerCase().replace(/^.*:/, "");
  return local === "script" || local === "style";
}
function createRenderNonce() {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : void 0;
  const words = new Uint32Array(4);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(words);
  } else {
    for (let i = 0; i < words.length; i++) words[i] = Math.floor(Math.random() * 4294967296);
  }
  return `rh${Array.from(words, (w) => w.toString(36)).join("")}`;
}
var DROPPED = "<!---->";
var escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function xmldomNodeFilter(nonce) {
  return renderNodeFilter(nonce);
}
function renderNodeFilter(nonce) {
  return (node) => {
    switch (node.nodeType) {
      case 1: {
        if (isHiddenElement(node)) return DROPPED;
        const el = node;
        for (const attr of Array.from(el.attributes)) {
          if (!VALID_ATTRIBUTE_NAME.test(attr.name)) el.removeAttributeNode(attr);
        }
        if (!WRAPPER_ELEMENTS.has(node.nodeName.toLowerCase())) {
          node.setAttribute(RENDER_NONCE_ATTRIBUTE, nonce);
        }
        return node;
      }
      case 4:
        return escapeText(node.nodeValue || "");
      case 7:
      // processing instruction
      case 8:
      // comment
      case 10:
        return DROPPED;
      default:
        return node;
    }
  };
}

export { RENDER_NONCE_ATTRIBUTE, VALID_ATTRIBUTE_NAME, createRenderNonce, isHiddenElement, isStrictTag, renderNodeFilter, xmldomNodeFilter };
//# sourceMappingURL=chunk-YYHKRTAC.js.map
//# sourceMappingURL=chunk-YYHKRTAC.js.map