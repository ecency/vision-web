import { cleanReply } from './chunk-QWYT3YOI.js';
import { entryMemoGet, MEMO_MISS, entryMemoSet } from './chunk-2SC5I7QY.js';
import { makeEntryCacheKey, decodeEntities } from './chunk-OEOVNYVL.js';

// src/post-body-text.ts
var ESCAPED = /\\([\\`*_{}[\]()#+\-.!>~|])/g;
var ESCAPE_SLOT = /\uE000(\d+)\uE001/g;
function markdownToText(source) {
  const escaped = [];
  const md = /[\uE000\uE001]/.test(source) ? source : source.replace(ESCAPED, (_m, c) => `\uE000${escaped.push(c) - 1}\uE001`);
  return md.replace(/\r\n?/g, "\n").replace(/^ {0,3}(?:```|~~~)[^\n]*$/gm, "").replace(/^ {0,3}\[[^\]\n]+\]:[ \t]*\S[^\n]*$/gm, "").replace(/!\[[^[\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)/g, "").replace(/!\[[^[\]\n]*\]\[[^[\]\n]*\]/g, "").replace(/\[([^[\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, "$1").replace(/\[([^[\]\n]*)\]\[[^[\]\n]*\]/g, "$1").replace(/<((?:https?|ftp):\/\/[^<>\s]+)>/gi, "$1").replace(/^[ \t]*(?:>[ \t]?)+/gm, "").replace(/^[ \t]*#{1,6}(?:[ \t]+|$)/gm, "").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "").replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/gm, "").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "").replace(/^[ \t]*=+[ \t]*$/gm, "").replace(/^[ \t|:-]+$/gm, (row) => row.includes("---") || /^[ \t]*\|/.test(row) && row.includes("-") ? "" : row).replace(/^[ \t]*\|[^\n]*$/gm, (row) => row.replace(/\|/g, " ")).replace(/(^|[^\w*_~])(?:[*_]{1,3}|~~)(?=[^\s*_~])/gm, "$1").replace(/([^\s*_~])(?:[*_]{1,3}|~~)(?=$|[^\w*_~])/gm, "$1").replace(/`+/g, "").replace(ESCAPE_SLOT, (_m, i) => escaped[Number(i)] ?? "");
}
function stripTags(text) {
  let out = "";
  let at = 0;
  for (; ; ) {
    const open = text.indexOf("<!--", at);
    if (open === -1) {
      out += text.slice(at);
      break;
    }
    out += text.slice(at, open);
    const close = text.indexOf("-->", open + 4);
    if (close === -1) break;
    at = close + 3;
  }
  return dropTags(out);
}
var isLetter = (c) => c >= "a" && c <= "z" || c >= "A" && c <= "Z";
function dropTags(text) {
  const out = [];
  const lastGt = text.lastIndexOf(">");
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c !== "<") {
      if (isLetter(c) || c === "/" || c === "!") {
        while (out[out.length - 1] === "<") out.pop();
      }
      out.push(c);
      i++;
      continue;
    }
    const next = text[i + 1] ?? "";
    const opensTag = isLetter(next) || next === "/" && isLetter(text[i + 2] ?? "");
    if (opensTag && i > lastGt) {
      out.push("&lt;");
      i++;
      continue;
    }
    if (opensTag) {
      let j = i + 1;
      while (j < text.length && text[j] !== ">" && text[j] !== "<") j++;
      i = text[j] === ">" ? j + 1 : i + 1;
      continue;
    }
    if (i > lastGt) {
      out.push("&lt;");
    } else if (next !== "/" && next !== "!") {
      out.push(c);
    }
    i++;
  }
  return out.join("");
}
var joint = (arr, limit = 200) => {
  let result = "";
  for (let i = 0; i < arr.length; i++) {
    if (result) {
      result += " ";
    }
    if (result.length > limit) {
      break;
    }
    if ((result + arr[i]).length < limit + 10) {
      result += arr[i];
    } else {
      break;
    }
  }
  return result.trim();
};
function postBodyText(body, length) {
  if (!body) {
    return "";
  }
  const escaped = markdownToText(cleanReply(body)).replace(/&(?!#?[A-Za-z0-9]+;)/g, "&amp;").replace(/"/g, "&quot;");
  let text = stripTags(escaped).replace(/\r?\n|\r/g, " ").replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim().replace(/[ \t]{2,}|\t/g, " ");
  if (length > 0) {
    text = joint(text.split(" "), length);
  }
  return text ? decodeEntities(text) : text;
}
function getPostBodyText(obj, length = 200) {
  if (typeof obj === "string") {
    return postBodyText(obj, length);
  }
  const key = `${makeEntryCacheKey(obj)}-text-${length}`;
  const item = entryMemoGet(key, obj.body);
  if (item !== MEMO_MISS) {
    return item;
  }
  const res = postBodyText(obj.body, length);
  entryMemoSet(key, obj.body, void 0, res);
  return res;
}

export { getPostBodyText };
//# sourceMappingURL=chunk-DOMWPVHC.js.map
//# sourceMappingURL=chunk-DOMWPVHC.js.map