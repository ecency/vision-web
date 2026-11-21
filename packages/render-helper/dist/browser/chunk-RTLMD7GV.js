import { DOMParser } from './chunk-DBKALPTB.js';
import { removeDuplicateAttributes } from './chunk-HMTAYKJC.js';

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
//# sourceMappingURL=chunk-RTLMD7GV.js.map
//# sourceMappingURL=chunk-RTLMD7GV.js.map