import { markdownToHTML } from './chunk-6KX7T4T3.js';
import { cleanReply } from './chunk-QWYT3YOI.js';
import { entryMemoGet, MEMO_MISS, entryMemoSet } from './chunk-2SC5I7QY.js';
import { makeEntryCacheKey } from './chunk-OEOVNYVL.js';

// src/markdown-2-html.ts
var isNodeRuntime = typeof process !== "undefined" && typeof process?.versions?.node === "string";
var slowRenderThresholdMs = isNodeRuntime ? 500 : 0;
function setSlowRenderThresholdMs(ms) {
  slowRenderThresholdMs = Math.max(0, ms);
}
function logIfSlow(durationMs, context) {
  if (slowRenderThresholdMs > 0 && durationMs >= slowRenderThresholdMs) {
    console.warn(
      `[render-helper] slow markdown render: ${durationMs.toFixed(0)}ms ${context}`
    );
  }
}
function markdown2Html(obj, forApp = true, _webp = false, parentDomain = "ecency.com", seoContext, renderOptions) {
  if (typeof obj === "string") {
    const cleanedStr = cleanReply(obj);
    const t02 = performance.now();
    const res2 = markdownToHTML(cleanedStr, forApp, parentDomain, seoContext, renderOptions);
    logIfSlow(performance.now() - t02, `body_len=${obj.length}`);
    return res2;
  }
  const key = `${makeEntryCacheKey(obj)}-md-${forApp ? "app" : "site"}-${parentDomain}${seoContext ? `-seo${seoContext.authorReputation ?? ""}-${seoContext.postPayout ?? ""}` : ""}${renderOptions?.embedVideosDirectly ? "-embed" : ""}${renderOptions?.inertAuthorAndTagChips ? "-inert" : ""}${renderOptions?.externalProfileBase ? "-ext" + renderOptions.externalProfileBase : ""}${renderOptions?.preserveImageDimensions ? "-imgdim" : ""}`;
  const item = entryMemoGet(key, obj.body);
  if (item !== MEMO_MISS) {
    return item;
  }
  const cleanBody = cleanReply(obj.body);
  const t0 = performance.now();
  const res = markdownToHTML(cleanBody, forApp, parentDomain, seoContext, renderOptions);
  logIfSlow(
    performance.now() - t0,
    `author=@${obj.author} permlink=${obj.permlink} body_len=${obj.body?.length ?? 0}`
  );
  entryMemoSet(key, obj.body, void 0, res);
  return res;
}

export { markdown2Html, setSlowRenderThresholdMs };
//# sourceMappingURL=chunk-7BBSYAFH.js.map
//# sourceMappingURL=chunk-7BBSYAFH.js.map