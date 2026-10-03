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
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
    if (!type.startsWith("image/")) return null
    const length = Number(res.headers.get("content-length"))
    if (Number.isFinite(length) && length > MAX_BYTES) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null
    return { bytes, type }
  }
  return null
}

function imageResponse(bytes: Uint8Array, type: string): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400, s-maxage=86400"
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
