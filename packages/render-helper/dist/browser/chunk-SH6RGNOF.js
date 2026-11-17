// src/regex-matches.ts
function* regexMatches(text, re) {
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const unicode = copy.unicode || copy.flags.includes("v");
  let match;
  while ((match = copy.exec(text)) !== null) {
    if (match[0] === "") {
      const code = text.charCodeAt(copy.lastIndex);
      const next = text.charCodeAt(copy.lastIndex + 1);
      const pair = unicode && code >= 55296 && code <= 56319 && next >= 56320 && next <= 57343;
      copy.lastIndex += pair ? 2 : 1;
    }
    yield match;
  }
}

export { regexMatches };
//# sourceMappingURL=chunk-SH6RGNOF.js.map
//# sourceMappingURL=chunk-SH6RGNOF.js.map