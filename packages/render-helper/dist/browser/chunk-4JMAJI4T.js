import { DOMParser } from './chunk-DBKALPTB.js';
import { removeDuplicateAttributes } from './chunk-QVFPA3RG.js';

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
//# sourceMappingURL=chunk-4JMAJI4T.js.map
//# sourceMappingURL=chunk-4JMAJI4T.js.map