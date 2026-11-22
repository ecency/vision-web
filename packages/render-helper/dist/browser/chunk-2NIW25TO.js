// src/methods/linear-linkify.ts
var LINK_SCAN_RE = /www|@|:\/\//;
var isLinkOpen = (str) => /^<a[>\s]/i.test(str);
var isLinkClose = (str) => /^<\/a\s*>/i.test(str);
function linearLinkify(md) {
  const ruler = md.core.ruler;
  const rule = ruler.__rules__.find((r) => r.name === "linkify");
  if (!rule) return;
  const original = rule.fn;
  ruler.at("linkify", (state) => {
    const picked = [];
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      const tokens = block.children;
      let htmlLinkLevel = 0;
      for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (token.type === "link_close") {
          i--;
          while (tokens[i].level !== token.level && tokens[i].type !== "link_open") i--;
          continue;
        }
        if (token.type === "htmltag") {
          if (isLinkOpen(token.content ?? "") && htmlLinkLevel > 0) htmlLinkLevel--;
          if (isLinkClose(token.content ?? "")) htmlLinkLevel++;
        }
        if (htmlLinkLevel > 0) continue;
        if (token.type === "text" && LINK_SCAN_RE.test(token.content ?? "")) {
          picked.push({ block, at: i, single: { type: "inline", children: [token] } });
        }
      }
    }
    if (picked.length === 0) return;
    original({ ...state, tokens: picked.map((p) => p.single) });
    const byBlock = /* @__PURE__ */ new Map();
    for (const p of picked) {
      const nodes = p.single.children ?? [];
      if (nodes.length === 1 && nodes[0] === p.block.children[p.at]) continue;
      let replacements = byBlock.get(p.block);
      if (!replacements) byBlock.set(p.block, replacements = /* @__PURE__ */ new Map());
      replacements.set(p.at, nodes);
    }
    for (const [block, replacements] of byBlock) {
      const rebuilt = [];
      const children = block.children;
      for (let i = 0; i < children.length; i++) {
        const nodes = replacements.get(i);
        if (nodes) {
          for (const node of nodes) rebuilt.push(node);
        } else {
          rebuilt.push(children[i]);
        }
      }
      block.children = rebuilt;
    }
  });
}

export { linearLinkify };
//# sourceMappingURL=chunk-2NIW25TO.js.map
//# sourceMappingURL=chunk-2NIW25TO.js.map