// src/methods/placeholder-delimiter.ts
var active = null;
var activePlaceholderDelimiter = () => active;
function withPlaceholderDelimiter(delimiter, render) {
  const previous = active;
  active = delimiter;
  try {
    return render();
  } finally {
    active = previous;
  }
}

export { activePlaceholderDelimiter, withPlaceholderDelimiter };
//# sourceMappingURL=chunk-NJPAOL3G.js.map
//# sourceMappingURL=chunk-NJPAOL3G.js.map