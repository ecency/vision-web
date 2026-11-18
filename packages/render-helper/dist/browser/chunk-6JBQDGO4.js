import { XMLDOMSerializer } from './chunk-DBKALPTB.js';

// src/methods/get-inner-html.method.ts
function getSerializedInnerHTML(node) {
  const serializer = new XMLDOMSerializer();
  if (node.childNodes[0]) {
    return serializer.serializeToString(node.childNodes[0]);
  }
  return "";
}

export { getSerializedInnerHTML };
//# sourceMappingURL=chunk-6JBQDGO4.js.map
//# sourceMappingURL=chunk-6JBQDGO4.js.map