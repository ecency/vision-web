import { cleanReply } from './chunk-QWYT3YOI.js';
import { ENTITY_REGEX } from './chunk-AS65CVY3.js';
import { entryMemoGet, MEMO_MISS, entryMemoSet } from './chunk-2SC5I7QY.js';
import { makeEntryCacheKey, stripHtmlTags, decodeEntities } from './chunk-QVFPA3RG.js';
import { Remarkable } from 'remarkable';

var summaryRenderer = new Remarkable({
  html: true,
  breaks: true,
  typographer: false
});
summaryRenderer.core.ruler.enable(["abbr"]);
summaryRenderer.block.ruler.enable(["footnote", "deflist"]);
summaryRenderer.inline.ruler.enable([
  "footnote_inline",
  "ins",
  "mark",
  "sub",
  "sup"
]);
var joint = (arr, limit = 200) => {
  let result = "";
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      if (result) {
        result += " ";
      }
      if (result.length > limit) {
        break;
      } else {
        if ((result + arr[i]).length < limit + 10) {
          result += arr[i];
        } else {
          break;
        }
      }
    }
  }
  return result.trim();
};
function postBodySummary(entryBody, length = 200, platform = "web") {
  if (!entryBody) {
    return "";
  }
  entryBody = cleanReply(entryBody);
  const entities = entryBody.match(ENTITY_REGEX);
  const entityPlaceholders = [];
  if (entities && platform !== "web") {
    const uniqueEntities = [...new Set(entities)];
    uniqueEntities.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      entityPlaceholders.push(entity);
      entryBody = entryBody.split(entity).join(placeholder);
    });
  }
  let text = "";
  try {
    text = summaryRenderer.render(entryBody);
  } catch (err) {
    console.error("[postBodySummary] Failed to render markdown:", {
      error: err instanceof Error ? err.message : String(err),
      entryBodyLength: entryBody?.length || 0,
      platform
    });
    text = "";
  }
  if (platform !== "web" && entityPlaceholders.length > 0) {
    entityPlaceholders.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      text = text.split(placeholder).join(entity);
    });
  }
  text = stripHtmlTags(text).replace(/\r?\n|\r/g, " ").replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim().replace(/ {2,}/g, " ");
  if (length > 0) {
    text = joint(text.split(" "), length);
  }
  if (text) {
    text = decodeEntities(text);
  }
  return text;
}
function getPostBodySummary(obj, length, platform) {
  const normalizedLength = length ?? 200;
  const normalizedPlatform = platform || "web";
  if (typeof obj === "string") {
    return postBodySummary(obj, normalizedLength, normalizedPlatform);
  }
  const key = `${makeEntryCacheKey(obj)}-sum-${normalizedLength}-${normalizedPlatform}`;
  const item = entryMemoGet(key, obj.body);
  if (item !== MEMO_MISS) {
    return item;
  }
  const res = postBodySummary(obj.body, normalizedLength, normalizedPlatform);
  entryMemoSet(key, obj.body, void 0, res);
  return res;
}

export { getPostBodySummary };
//# sourceMappingURL=chunk-LYUWQK2R.js.map
//# sourceMappingURL=chunk-LYUWQK2R.js.map