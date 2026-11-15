import { NextRequest, NextResponse } from "next/server";
import { EcencyConfigManager } from "@/config";
import { resolveUser, unauthorizedResponse } from "../threespeak/resolve-user";

// Server-side private API host. Mirrors core/sdk-init: on the server prefer the
// internal route (skips the Cloudflare round-trip) and otherwise the public origin.
const PRIVATE_API_HOST = process.env.INTERNAL_API_HOST || "https://ecency.com";

/**
 * Whether `realUser` (already lowercased) is on the Ecency Pro roster. Returns a
 * boolean when the roster is known, or `null` when it could not be fetched so the
 * caller fails with a retryable 503 instead of wrongly denying a real Pro member.
 */
async function isRosterProMember(realUser: string): Promise<boolean | null> {
  let res: Response;
  try {
    res = await fetch(`${PRIVATE_API_HOST}/private-api/pro-members`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return null;
  }

  if (!res.ok) {
    return null;
  }

  try {
    const data = await res.json();
    const members: unknown = data?.members;
    if (!Array.isArray(members)) {
      return null;
    }
    const roster = new Set(
      members.filter((m): m is string => typeof m === "string").map((m) => m.toLowerCase())
    );
    return roster.has(realUser);
  } catch {
    return null;
  }
}

/**
 * Gated profile-insights proxy. Unlike the public `/api/stats` route, this one
 * requires a server-verified viewer identity: the numbers for a profile are only
 * returned to that profile's owner or to an Ecency Pro member. Identity is
 * established from a HiveSigner access token (non-forgeable), never from the
 * `username` in the body.
 */
export async function POST(request: NextRequest) {
  const isEnabled = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.plausible.enabled
  );
  if (!isEnabled) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const dateRange =
    typeof body.dateRange === "string" && body.dateRange.length > 0 ? body.dateRange : "all";

  if (!username) {
    return Response.json({ error: "username is required" }, { status: 400 });
  }

  // Resolve the real viewer from the HiveSigner token (body.code or X-HS-Token).
  const auth = await resolveUser(request, body);
  if (!auth.ok) {
    return unauthorizedResponse(auth.reason);
  }
  const realUser = auth.username.toLowerCase();

  // Authorize: own profile, or an active Ecency Pro member.
  if (username.toLowerCase() !== realUser) {
    const isPro = await isRosterProMember(realUser);
    if (isPro === null) {
      return Response.json({ error: "Authorization service unavailable" }, { status: 503 });
    }
    if (!isPro) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // From here the Plausible call mirrors `api/stats/route.ts` exactly, but the
  // page prefix, metrics and dimensions are fixed server-side (not client input).
  // A `/@author/` prefix always ends in a slash, so it is a `contains` (substring)
  // query pulling every page recorded under that author. `contains` is not a regex,
  // so the author needs no escaping.
  const page = `/@${username}/`;
  const pageFilter = ["contains", "event:page", [page]];

  const statsHost = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.plausible.host
  );

  let response: Response;
  try {
    response = await fetch(`${statsHost}/api/v2/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${EcencyConfigManager.getConfigValue(
          ({ visionFeatures }) => visionFeatures.plausible.apiKey
        )}`
      },
      body: JSON.stringify({
        site_id: EcencyConfigManager.getConfigValue(
          ({ visionFeatures }) => visionFeatures.plausible.siteId
        ),
        metrics: ["pageviews", "visitors", "visit_duration"],
        filters: [pageFilter],
        dimensions: ["event:page"],
        date_range: dateRange
      }),
      cache: "default",
      // Plausible's /api/v2/query has historically blocked on its DB pool; a hung
      // fetch here would pile up Node connection slots, so bound it.
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json({}, { status: isTimeout ? 504 : 502 });
  }

  try {
    const payload = await response.json();
    // Forward Plausible's status instead of always returning 200 so the client's
    // `response.ok` guard can surface/retry errors the same way the stats route does.
    return NextResponse.json(payload, { status: response.ok ? 200 : response.status });
  } catch (e) {
    // The AbortSignal that bounds the fetch also bounds the body read, so a
    // mid-stream cap fire throws TimeoutError/AbortError — classify those as 504,
    // anything else as a transport failure (502).
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return NextResponse.json({}, { status: 504 });
    }
    return NextResponse.json({}, { status: 502 });
  }
}
