import { lookupPostImage } from './chunk-EXMSUEK2.js';
import { createDoc } from './chunk-TCTNEOC3.js';
import { markdown2Html } from './chunk-E3DM3JVO.js';

// src/catch-post-image.ts
function firstRenderedImageSrc(obj) {
  const doc = createDoc(markdown2Html(obj));
  if (!doc) {
    return null;
  }
  const imgEls = doc.getElementsByTagName("img");
  for (let i = 0; i < imgEls.length; i++) {
    const src = imgEls[i].getAttribute("src");
    if (src) return src;
  }
  return null;
}
function catchPostImage(obj, width = 0, height = 0, format = "match", options = {}) {
  return lookupPostImage(obj, width, height, format, options.fast === true ? null : firstRenderedImageSrc);
}

export { catchPostImage };
//# sourceMappingURL=chunk-2ESFHJB2.js.map
//# sourceMappingURL=chunk-2ESFHJB2.js.map