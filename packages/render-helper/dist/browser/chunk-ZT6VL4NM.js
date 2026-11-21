import { lookupPostImage } from './chunk-CP2L6EZI.js';
import { createDoc } from './chunk-N5AMQM4J.js';
import { markdown2Html } from './chunk-H6VTKFUZ.js';

// src/catch-post-image.ts
function firstRenderedImageSrc(obj) {
  const doc = createDoc(markdown2Html(obj));
  if (!doc) {
    return null;
  }
  const imgEls = doc.getElementsByTagName("img");
  return imgEls.length >= 1 ? imgEls[0].getAttribute("src") || null : null;
}
function catchPostImage(obj, width = 0, height = 0, format = "match", options = {}) {
  return lookupPostImage(obj, width, height, format, options.fast === true ? null : firstRenderedImageSrc);
}

export { catchPostImage };
//# sourceMappingURL=chunk-ZT6VL4NM.js.map
//# sourceMappingURL=chunk-ZT6VL4NM.js.map