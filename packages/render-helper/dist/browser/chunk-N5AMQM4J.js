import { DOMParser } from './chunk-DBKALPTB.js';
import { removeDuplicateAttributes } from './chunk-6SZO54KO.js';

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
//# sourceMappingURL=chunk-N5AMQM4J.js.map
//# sourceMappingURL=chunk-N5AMQM4J.js.map