/**
 * Cover image for a BitChute video.
 *
 * YouTube posters are `img.youtube.com/vi/<id>/hqdefault.jpg`. BitChute stores
 * the file under a channel id the video URL does not carry, so the renderer
 * points `<img>` and the post cover at this route instead. The image proxy
 * fetches it the same way it fetches a YouTube poster, and the response is
 * the jpeg itself.
 *
 * The id is taken from the path and checked before it is placed in a URL.
 * The thumbnail host is checked again after oEmbed, so a response cannot
 * send this route at an arbitrary address.
 */

const ID_RE = /^[A-Za-z0-9]{1,64}$/
const MAX_BYTES = 2_000_000
const TTL_MS = 60 * 60 * 1000
const CACHE_MAX = 200

interface CachedThumb {
  bytes: Uint8Array
  type: string
  at: number
}

const cache = new Map<string, CachedThumb>()

function isBitchuteImageUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== "https:") return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return host === "bitchute.com" || host.endsWith(".bitchute.com")
}

function remember(id: string, bytes: Uint8Array, type: string): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(id, { bytes, type, at: Date.now() })
}

function cached(id: string): CachedThumb | undefined {
  const hit = cache.get(id)
  if (!hit) return undefined
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(id)
    return undefined
  }
  return hit
}

async function resolveThumbnailUrl(id: string, signal: AbortSignal): Promise<string | null> {
  const endpoint = new URL("https://api.bitchute.com/oembed/")
  endpoint.searchParams.set("url", `https://www.bitchute.com/video/${id}/`)
  endpoint.searchParams.set("format", "json")
  const res = await fetch(endpoint, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "Ecency/bitchute-thumbnail" }
  })
  if (!res.ok) return null
  const data = (await res.json()) as { thumbnail_url?: unknown }
  const thumb = typeof data.thumbnail_url === "string" ? data.thumbnail_url.trim() : ""
  return thumb && isBitchuteImageUrl(thumb) ? thumb : null
}

async function fetchImage(start: string, signal: AbortSignal): Promise<{ bytes: Uint8Array; type: string } | null> {
  let current = start
  for (let hop = 0; hop < 3; hop++) {
    if (!isBitchuteImageUrl(current)) return null
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { Accept: "image/*", "User-Agent": "Ecency/bitchute-thumbnail" }
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return null
      current = new URL(loc, current).toString()
      continue
    }
    if (!res.ok) return null
    const length = Number(res.headers.get("content-length"))
    if (Number.isFinite(length) && length > MAX_BYTES) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null
    // The file is served from this origin. An SVG (or anything labeled
    // image/* that is not a raster) would execute as a page if a browser
    // opened the route directly, so the type comes from the bytes.
    const type = rasterType(bytes)
    if (!type) return null
    return { bytes, type }
  }
  return null
}

/** JPEG, PNG, GIF, or WebP. Anything else, including SVG, is refused. */
function rasterType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif"
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  return null
}

function imageResponse(bytes: Uint8Array, type: string): Response {
  // A bare Uint8Array is Uint8Array<ArrayBufferLike>, which this app's DOM
  // lib does not accept as a Response body. Copying yields an ArrayBuffer view.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "X-Content-Type-Options": "nosniff"
    }
  })
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params
  if (!ID_RE.test(id)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  }

  const hit = cached(id)
  if (hit) return imageResponse(hit.bytes, hit.type)

  try {
    const signal = AbortSignal.timeout(5000)
    const thumbUrl = await resolveThumbnailUrl(id, signal)
    if (!thumbUrl) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
    }
    const image = await fetchImage(thumbUrl, signal)
    if (!image) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
    }
    remember(id, image.bytes, image.type)
    return imageResponse(image.bytes, image.type)
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  }
}
