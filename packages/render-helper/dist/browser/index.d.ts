/**
 * Entry interface for Hive post data
 */
interface Entry {
    author?: string;
    permlink?: string;
    last_update?: string;
    body: any;
    json_metadata?: any;
}

interface RenderOptions {
    /** When true, video embeds (3Speak, YouTube, etc.) render as iframes directly without a play button overlay. */
    embedVideosDirectly?: boolean;
}

/**
 * SEO context for controlling rel attributes on external links in user-generated content.
 *
 * By default, all external links get rel="nofollow ugc noopener" to prevent link spam.
 * High-quality content (high author reputation + meaningful post rewards) earns followed links.
 */
interface SeoContext {
    /** Human-readable author reputation score (after accountReputation() conversion) */
    authorReputation?: number;
    /** Total post payout in USD */
    postPayout?: number;
}

declare function setSlowRenderThresholdMs(ms: number): void;
/**
 * @param obj - Entry object or raw markdown string
 * @param forApp - Whether rendering for app context
 * @param _webp - @deprecated Ignored. Format is now handled server-side via Accept header content negotiation.
 * @param parentDomain - Parent domain for iframe embed parameters
 * @param seoContext - Optional SEO context for structured data
 * @param renderOptions - Optional rendering options (e.g. embedVideosDirectly)
 */
declare function markdown2Html(obj: Entry | string, forApp?: boolean, _webp?: boolean, parentDomain?: string, seoContext?: SeoContext, renderOptions?: RenderOptions): string;

/**
 * The RAW (pre-proxify) URL of an entry's primary image, using the same
 * discovery order as catchPostImage (json_metadata.image, then the first body
 * image). Unlike catchPostImage it does NOT proxify — callers need the original
 * URL (e.g. to test picture-eligibility for an LCP preload, since catchPostImage
 * returns an already-proxified /p/ URL). Returns null when the fast path finds
 * no unambiguous image (the caller can fall back to catchPostImage).
 */
declare function getEntryImageRawUrl(obj: Entry | string): string | null;
declare function catchPostImage(obj: Entry | string, width?: number, height?: number, format?: string): string | null;

/**
 * Generate a text summary from an Entry object or raw string
 * @param obj - Entry object or raw post body string
 * @param length - Maximum length of the summary (default: 200, use 0 for no truncation)
 * @param platform - Target platform: 'web' for browser/Node.js, 'ios'/'android' for React Native (default: 'web')
 *                   Controls entity/placeholder handling - 'web' skips placeholder substitution, other values enable it
 * @returns Text summary of the post body
 */
declare function getPostBodySummary(obj: Entry | string, length?: number, platform?: 'ios' | 'android' | 'web'): string;

declare function setProxyBase(p: string): void;
/**
 * A legacy foreign SIZED proxy URL: `images.hive.blog/<WxH>/<inner>` or the
 * steemitimages equivalent — the only shape that carries a nested source URL
 * for getLatestUrl to unwrap.
 *
 * Deliberately narrower than {@link isLegacyForeignProxyUrl}: other non-`/D`
 * paths on those hosts (notably their own `/p/<hash>` proxy route) name a hash
 * in a foreign hash space, so routing them through our `/p/` would proxy a
 * proxy, and their content type is genuinely unknown.
 *
 * Shared by the proxify routing and the `<picture>` eligibility gate so the two
 * cannot disagree about which URLs reach the /p/ route.
 */
declare function isLegacySizedProxyUrl(url?: string): boolean;
interface ProxifyOptions {
    /**
     * Request a tiny blurred LQIP placeholder. The proxy resizes to ~20px and
     * gaussian-blurs it (a few hundred bytes), for use behind the real image
     * while it loads.
     */
    blur?: boolean;
    /**
     * Route on-host uploads through the /p/ proxy even when no width/height is
     * requested, so the server still negotiates WebP/AVIF via the Accept header
     * (instead of streaming the original bytes from direct-serve). Use for
     * displayed `<img>` sources; leave off for OG/social images, where the
     * original format is safest.
     */
    forceProxy?: boolean;
}
/**
 * @param _format - @deprecated Ignored. The public API always requests 'match'
 * so the origin negotiates WebP/AVIF via the Accept header. Explicit per-format
 * renditions (for `<picture>`) are built via buildSrcSetForFormat /
 * buildPictureSources, which keep the format in the URL (cache-safe behind a CDN
 * that ignores Accept).
 */
declare function proxifyImageSrc(url?: string, width?: number, height?: number, _format?: string, opts?: ProxifyOptions): string;
/**
 * Builds a srcset string with multiple width variants for responsive images.
 * Uses the image proxy's width parameter to serve appropriately sized images.
 * Format is locked to 'match' (Accept-negotiated) — see buildSrcSetForFormat
 * for explicit per-format renditions.
 */
declare function buildSrcSet(url?: string): string;
/**
 * Like buildSrcSet but pins an explicit output format in the URL (avif/webp/
 * match). Used to build the per-format `<source>` srcsets of a `<picture>`: a
 * format baked into the URL is cache-safe behind a CDN that ignores the Accept
 * header, whereas a single 'match' URL gets one negotiated variant cached and
 * cross-served to every client. Byte-identical to buildSrcSet when format is
 * 'match'.
 */
declare function buildSrcSetForFormat(url?: string, format?: 'avif' | 'webp' | 'match'): string;
/**
 * Whether a RAW (pre-proxify) image URL is safe to offer avif/webp `<source>`
 * renditions for. Requires an http(s) URL whose PATHNAME ends in a static-raster
 * extension and that is NOT already proxified — already-proxified routes (`/p/`
 * base58 hash, `/u/` avatars, `WxH` sized) have the original extension stripped,
 * so we can't prove the underlying bytes aren't an animated gif and must fall
 * back to a bare img. URL parsing (not string regex on the host) keeps the host
 * comparison exact and avoids an interpolated-hostname regex.
 */
declare function isPictureEligibleRawUrl(rawUrl?: string): boolean;
/**
 * Build the avif + webp `<source>` srcsets for a `<picture>` around a RAW image
 * URL, or null when the URL is ineligible (non-raster, animated, already
 * proxified, or a legacy host that bypasses the /p/ transform). Single
 * eligibility gate shared by the renderer so the decision can't diverge.
 */
declare function buildPictureSources(rawUrl?: string): {
    avif: string;
    webp: string;
} | null;

/**
 * The `sizes` value the renderer applies to in-body post images (see `img()`
 * and `createImageHTML()`). Exported as the single source of truth so consumers
 * preloading the LCP image (`<link rel="preload" as="image" imagesizes>`) can
 * match the exact srcset candidate the rendered <img> selects.
 */
declare const IMAGE_SIZES = "(max-width: 768px) 100vw, 700px";

declare function setCacheSize(size: number): void;

declare const SECTION_LIST: string[];

/**
 * True iff `value` is an absolute https:// URL whose host is one the renderer
 * is permitted to embed AND (for hosts with a known embed-path shape) whose
 * path matches that shape. Used to validate data-embed-src / data-video-href in
 * the sanitizer and the iframe `src` the client video extensions assign.
 *
 * Defensive: never throws (a malformed URL returns false), rejects every
 * non-https scheme (javascript:, data:, http:, protocol-relative //host),
 * compares the parsed hostname so an attacker can't smuggle an allowed host as
 * a path/query/userinfo/subdomain-suffix segment, and constrains the path so an
 * allowed host can't be aimed at a non-embed route.
 */
declare function isAllowedEmbedSrc(value?: string | null): boolean;

declare function isValidPermlink(permlink: string): boolean;

/**
 * Lightweight markdown-to-HTML conversion with sanitization.
 * Unlike the full `markdownToHTML`, this skips Hive-specific transforms
 * (image proxying, link internalizing, DOM traversal, etc.).
 *
 * Intended for editor input (TipTap), chat messages, and other contexts
 * where simple markdown rendering is sufficient.
 */
declare function simpleMarkdownToHTML(input: string): string;

export { type Entry, IMAGE_SIZES, type ProxifyOptions, type RenderOptions, SECTION_LIST, type SeoContext, buildPictureSources, buildSrcSet, buildSrcSetForFormat, catchPostImage, getEntryImageRawUrl, isAllowedEmbedSrc, isLegacySizedProxyUrl, isPictureEligibleRawUrl, isValidPermlink, getPostBodySummary as postBodySummary, proxifyImageSrc, markdown2Html as renderPostBody, setCacheSize, setProxyBase, setSlowRenderThresholdMs, simpleMarkdownToHTML };
