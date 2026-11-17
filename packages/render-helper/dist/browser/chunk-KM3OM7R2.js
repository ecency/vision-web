import { XMLDOMSerializer } from './chunk-LAYY6CL4.js';

// src/methods/get-inner-html.method.ts
function getSerializedInnerHTML(node) {
  const serializer = new XMLDOMSerializer();
  if (node.childNodes[0]) {
    return serializer.serializeToString(node.childNodes[0]);
  }
  return "";
}

export { getSerializedInnerHTML };
//# sourceMappingURL=chunk-KM3OM7R2.js.map
//# sourceMappingURL=chunk-KM3OM7R2.js.map