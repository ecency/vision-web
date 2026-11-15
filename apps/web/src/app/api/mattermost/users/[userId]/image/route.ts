import { NextRequest, NextResponse } from "next/server";
import { getMattermostTokenFromCookies } from "@/server/mattermost";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  // Read only: this response is publicly cacheable, so it must not carry the
  // chat session cookies an ownerless session check would write (#2023).
  const token = await getMattermostTokenFromCookies({ readOnly: true });
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.MATTERMOST_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "MATTERMOST_BASE_URL not configured" }, { status: 500 });
  }

  try {
    // Avatar fetches that hang would tie up Node connection slots and
    // contribute to the same kind of pile-up we saw on the Plausible
    // proxy path. 8s matches the CF Worker primary timeout — anything
    // slower has already been cut off at the edge.
    const res = await fetch(`${baseUrl}/users/${encodeURIComponent(userId)}/image`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      const message = await res.text();
      return NextResponse.json({ error: message || "unable to load avatar" }, { status: res.status });
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    return new NextResponse(buffer, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/png",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (err) {
    // AbortSignal.timeout fires as TimeoutError during the initial fetch;
    // an abort during streaming body reads (res.text() / res.arrayBuffer())
    // surfaces as AbortError. Treat both as timeout.
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return NextResponse.json({ error: "avatar fetch timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "avatar fetch failed" }, { status: 502 });
  }
}
