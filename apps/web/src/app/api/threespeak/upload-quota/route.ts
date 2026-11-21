import { NextRequest } from "next/server";
import { EcencyConfigManager } from "@/config";
import { parseThreeSpeakUploadQuota } from "@/api/threespeak-embed/upload-limits";
import { resolveUser, unauthorizedResponse } from "../resolve-user";

function getConfig() {
  const embedEndpoint = EcencyConfigManager.getConfigValue(
    ({ thirdPartyFeatures }) => thirdPartyFeatures.threeSpeak.uploading.embedEndpoint
  ) as string;
  const apiKey = EcencyConfigManager.getConfigValue(
    ({ thirdPartyFeatures }) => thirdPartyFeatures.threeSpeak.uploading.serverApiKey
  ) as string | undefined;
  return { embedEndpoint, apiKey };
}

/**
 * The logged-in user's 3Speak daily upload allowance (free accounts get 1
 * video and 3 shorts per rolling 24 hours), so the upload dialog can warn
 * before a file is picked. Read-only, and the client treats any error here as
 * "no limit known": the token request stays the source of truth.
 */
export async function POST(req: NextRequest) {
  const { embedEndpoint, apiKey } = getConfig();

  if (!apiKey) {
    return Response.json({ error: "3Speak integration not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const { owner } = body;

    const auth = await resolveUser(req, body);
    if (!auth.ok) {
      return unauthorizedResponse(auth.reason);
    }

    if (!owner || typeof owner !== "string" || owner !== auth.username) {
      return Response.json({ error: "owner must match the logged-in user" }, { status: 403 });
    }

    const res = await fetch(`${embedEndpoint}/uploads/quota?owner=${encodeURIComponent(owner)}`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000)
    });

    if (!res.ok) {
      // A 3Speak server without upload limits answers 404 here.
      return Response.json({ error: "Upload quota unavailable" }, { status: res.status });
    }

    const quota = parseThreeSpeakUploadQuota(await res.json().catch(() => null));
    if (!quota) {
      return Response.json({ error: "Upload quota unavailable" }, { status: 502 });
    }

    const kind = (k: typeof quota.video) =>
      k && { limit: k.limit, used: k.used, remaining: k.remaining, next_at: k.nextAt };

    return Response.json(
      {
        enabled: quota.enabled,
        exempt: quota.exempt,
        video: kind(quota.video),
        short: kind(quota.short)
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[3Speak] Quota endpoint error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
