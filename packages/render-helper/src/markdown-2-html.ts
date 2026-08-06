import { makeEntryCacheKey } from './helper'
import { cleanReply, markdownToHTML } from './methods'
import { cacheGet, cacheSet } from './cache'
import { Entry, RenderOptions, SeoContext } from './types'

// Warn when a single markdown render exceeds this threshold. Surfaces both
// pathological inputs (e.g. ReDoS-prone tag attributes) and merely-slow ones
// (huge bodies hitting the xmldom fallback) so they can be triaged from
// container logs without waiting for the SSR watchdog to kill a replica.
//
// Default is **Node-on, everything-else-off**. The string overload of
// `markdown2Html` is called from comment/reply preview paths with
// unpublished user input — warnings firing on the client would (a) leak
// draft content into the console and any client telemetry pipeline, and
// (b) repeat on every keystroke (the string path is uncached). Restricting
// the default to Node specifically also keeps React Native bundles
// (Metro/Hermes), edge runtimes (Workers, Deno, Bun) and arbitrary
// downstream consumers silent unless they opt in.
//
// Opt in from any non-Node runtime by calling `setSlowRenderThresholdMs(500)`
// during init; pass 0 to disable everywhere.
const isNodeRuntime =
  typeof process !== 'undefined' && typeof process?.versions?.node === 'string'
let slowRenderThresholdMs = isNodeRuntime ? 500 : 0

export function setSlowRenderThresholdMs(ms: number): void {
  slowRenderThresholdMs = Math.max(0, ms)
}

function logIfSlow(durationMs: number, context: string): void {
  if (slowRenderThresholdMs > 0 && durationMs >= slowRenderThresholdMs) {
    // Grep-friendly prefix: "[render-helper] slow markdown render" is a
    // unique substring that doesn't collide with anything else in the code
    // base. We intentionally do not include a content excerpt — the
    // body_len + (when available) author/permlink is enough to triage, and
    // the string overload can carry unpublished user-authored text from
    // comment/draft preview paths.
    // eslint-disable-next-line no-console
    console.warn(
      `[render-helper] slow markdown render: ${durationMs.toFixed(0)}ms ${context}`
    )
  }
}

/**
 * @param obj - Entry object or raw markdown string
 * @param forApp - Whether rendering for app context
 * @param _webp - @deprecated Ignored. Format is now handled server-side via Accept header content negotiation.
 * @param parentDomain - Parent domain for iframe embed parameters
 * @param seoContext - Optional SEO context for structured data
 * @param renderOptions - Optional rendering options (e.g. embedVideosDirectly)
 */
export function markdown2Html(obj: Entry | string, forApp = true, _webp = false, parentDomain: string = 'ecency.com', seoContext?: SeoContext, renderOptions?: RenderOptions): string {
  if (typeof obj === 'string') {
    const cleanedStr = cleanReply(obj)
    const t0 = performance.now()
    const res = markdownToHTML(cleanedStr, forApp, parentDomain, seoContext, renderOptions)
    logIfSlow(performance.now() - t0, `body_len=${obj.length}`)
    return res
  }

  // Every RenderOptions flag that changes the output must appear in the key, or
  // two callers rendering the same entry with different options serve each
  // other's HTML from cache.
  const key = `${makeEntryCacheKey(obj)}-md-${forApp ? 'app' : 'site'}-${parentDomain}${seoContext ? `-seo${seoContext.authorReputation ?? ''}-${seoContext.postPayout ?? ''}` : ''}${renderOptions?.embedVideosDirectly ? '-embed' : ''}${renderOptions?.inertAuthorAndTagChips ? '-inert' : ''}${renderOptions?.externalProfileBase ? '-ext' + renderOptions.externalProfileBase : ''}`

  const item = cacheGet<string>(key)
  if (item) {
    return item
  }

  const cleanBody = cleanReply(obj.body)

  const t0 = performance.now()
  const res = markdownToHTML(cleanBody, forApp, parentDomain, seoContext, renderOptions)
  logIfSlow(
    performance.now() - t0,
    `author=@${obj.author} permlink=${obj.permlink} body_len=${obj.body?.length ?? 0}`
  )
  cacheSet(key, res)

  return res
}
