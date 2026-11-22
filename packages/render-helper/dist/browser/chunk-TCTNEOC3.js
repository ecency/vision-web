import { DOMParser } from './chunk-DBKALPTB.js';
import { removeDuplicateAttributes } from './chunk-EHL62ZCR.js';

// src/create-doc.ts
function createDoc(html) {
  if (html.trim() === "") {
    return null;
  }
  const cleanedHtml = removeDuplicateAttributes(html);
  try {
    return DOMParser.parseFromString(`<body>${cleanedHtml}</body>`, "text/html");
  } catch {
    return null;
  }
}

export { createDoc };
//# sourceMappingURL=chunk-TCTNEOC3.js.map
//# sourceMappingURL=chunk-TCTNEOC3.js.map