import { DOMParser } from './chunk-DBKALPTB.js';
import { removeDuplicateAttributes } from './chunk-OEOVNYVL.js';

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
//# sourceMappingURL=chunk-OU4P2ED6.js.map
//# sourceMappingURL=chunk-OU4P2ED6.js.map