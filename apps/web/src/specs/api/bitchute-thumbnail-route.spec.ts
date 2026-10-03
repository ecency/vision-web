// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/bitchute-thumbnail/[id]/route";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function call(id: string) {
  return GET(new Request(`https://ecency.com/api/bitchute-thumbnail/${id}`), {
    params: Promise.resolve({ id })
  })
}

describe("GET /api/bitchute-thumbnail/[id]", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("returns the oEmbed thumbnail bytes for a video id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("https://api.bitchute.com/oembed/")) {
        expect(url).toContain(encodeURIComponent("https://www.bitchute.com/video/1abYMl7gW68/"))
        return new Response(
          JSON.stringify({
            thumbnail_url:
              "https://static-3.bitchute.com/live/cover_images/odYcCWj22TZC/1abYMl7gW68_640x360.jpg"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      expect(url).toBe(
        "https://static-3.bitchute.com/live/cover_images/odYcCWj22TZC/1abYMl7gW68_640x360.jpg"
      )
      return new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const res = await call("1abYMl7gW68")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/jpeg")
    expect(res.headers.get("cache-control")).toContain("public")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG)
  })

  it("does not fetch a thumbnail URL that leaves BitChute", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ thumbnail_url: "https://evil.example/x.jpg" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const res = await call("evilthumb1")
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.bitchute.com/oembed/")
  })

  it("rejects an id that is not a BitChute video id", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const res = await call("../etc/passwd")
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
