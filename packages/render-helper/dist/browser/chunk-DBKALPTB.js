import { DOMParser as DOMParser$1 } from '@xmldom/xmldom';
export { XMLSerializer as XMLDOMSerializer } from '@xmldom/xmldom';

// src/consts/dom-parser.const.ts
function createParser() {
  return new DOMParser$1({
    onError(level, msg) {
    }
  });
}
var DOMParser = /* @__PURE__ */ createParser();

export { DOMParser };
//# sourceMappingURL=chunk-DBKALPTB.js.map
//# sourceMappingURL=chunk-DBKALPTB.js.map