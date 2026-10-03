/**
 * BitChute does not publish a thumbnail URL that is a function of the video id
 * the way YouTube does (`img.youtube.com/vi/<id>/hqdefault.jpg`). The real file
 * lives under a channel id (`static-3.bitchute.com/live/cover_images/<channel>/<id>_640x360.jpg`),
 * which only the video page or oEmbed response knows.
 *
 * The host app can point us at an endpoint that resolves that file. The
 * renderer and the cover lookup then treat
 * `<origin>/api/bitchute-thumbnail/<id>` exactly like the YouTube poster URL:
 * a synchronous https image address the image proxy can fetch. Unset (the
 * default) leaves BitChute posts without a poster, which is what self-hosted
 * blogs and every existing fixture expect.
 */
let origin = ''

const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i
const ID_RE = /^[A-Za-z0-9]{1,64}$/

export function setBitchuteThumbnailOrigin(next: string): void {
  if (typeof next !== 'string') {
    origin = ''
    return
  }
  const trimmed = next.trim().replace(/\/+$/, '')
  origin = ORIGIN_RE.test(trimmed) ? trimmed : ''
}

export function getBitchuteThumbnailOrigin(): string {
  return origin
}

/** Absolute cover URL for a BitChute video id, or null when no origin is configured. */
export function bitchuteThumbnailUrl(id: string): string | null {
  if (!origin || !ID_RE.test(id)) return null
  return `${origin}/api/bitchute-thumbnail/${id}`
}
