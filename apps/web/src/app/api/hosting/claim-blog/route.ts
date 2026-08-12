import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "../../threespeak/resolve-user";
import { callHostingInternal, hostingInternalSecret } from "@/server/hosting-internal";
import { isProRosterMember } from "@/server/pro-members";

/**
 * Claim the free blog that comes with Ecency Pro. Identity comes from a HiveSigner access token
 * (`body.code`); the caller must be an active Ecency Pro member (checked server-side against the
 * pro-members roster). The internal secret guards the hosting endpoint. Idempotent: an existing
 * tenant is returned unchanged by the hosting service.
 */
export async function POST(request: NextRequest) {
  const secret = hostingInternalSecret();
  if (!secret) {
    return Response.json({ error: "Hosting is not configured" }, { status: 503 });
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

  const auth = await resolveUser(request, body);
  if (!auth.ok) {
    return unauthorizedResponse(auth.reason);
  }
  const username = auth.username.toLowerCase();

  // The free blog is an Ecency Pro perk, so gate on Pro membership (case-insensitive roster).
  const isPro = await isProRosterMember(username);
  if (isPro === null) {
    return Response.json({ error: "Authorization service unavailable" }, { status: 503 });
  }
  if (!isPro) {
    return Response.json({ error: "Ecency Pro membership required" }, { status: 403 });
  }

  const title = typeof body.title === "string" ? body.title : undefined;
  const description = typeof body.description === "string" ? body.description : undefined;
  // The customize step from the paid signup applies to the claim too. Passed
  // through as-is; the hosting service validates them against its rosters.
  const styleTemplate = typeof body.styleTemplate === "string" ? body.styleTemplate : undefined;
  const accent = typeof body.accent === "string" ? body.accent : undefined;
  const fontPreset = typeof body.fontPreset === "string" ? body.fontPreset : undefined;

  let upstream: Response;
  try {
    upstream = await callHostingInternal("/v1/internal/claim-blog", secret, {
      username,
      title,
      description,
      styleTemplate,
      accent,
      fontPreset
    });
  } catch {
    return Response.json({ error: "Hosting service unavailable" }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({}));
  return Response.json(data, { status: upstream.status });
}
