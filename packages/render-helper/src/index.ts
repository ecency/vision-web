import { markdown2Html as renderPostBody, setSlowRenderThresholdMs } from './markdown-2-html'
import { catchPostImage, getEntryImageRawUrl } from './catch-post-image'
import { getPostBodySummary as postBodySummary } from './post-body-summary'
import { setProxyBase, proxifyImageSrc, buildSrcSet, buildSrcSetForFormat, buildPictureSources, isPictureEligibleRawUrl, isLegacySizedProxyUrl } from './proxify-image-src'
import type { ProxifyOptions } from './proxify-image-src'
import { IMAGE_SIZES } from './methods/img.method'
import { setCacheSize } from './cache'
import { SECTION_LIST, isAllowedEmbedSrc } from './consts'
import { isValidPermlink } from "./helper";
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'
import type { Entry } from './types/entry.interface'
import type { RenderOptions } from './types/render-options.interface'
import type { SeoContext } from './types/seo-context.interface'

export {
  renderPostBody,
  catchPostImage,
  getEntryImageRawUrl,
  postBodySummary,
  proxifyImageSrc,
  buildSrcSet,
  buildSrcSetForFormat,
  isLegacySizedProxyUrl,
  buildPictureSources,
  isPictureEligibleRawUrl,
  IMAGE_SIZES,
  setProxyBase,
  setCacheSize,
  setSlowRenderThresholdMs,
  SECTION_LIST,
  isValidPermlink,
  isAllowedEmbedSrc,
  simpleMarkdownToHTML
}

export type { Entry, RenderOptions, SeoContext, ProxifyOptions }
