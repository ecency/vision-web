import { DOMParser as DOMParser$1 } from '@xmldom/xmldom';
export { XMLSerializer as XMLDOMSerializer } from '@xmldom/xmldom';

// src/consts/dom-parser.const.ts
function createParser() {
  return new DOMParser$1({
    onError(level, msg) {
    }
  });
}
var DOMParser = createParser();

export { DOMParser };
//# sourceMappingURL=chunk-LAYY6CL4.js.map
//# sourceMappingURL=chunk-LAYY6CL4.js.map