import { NextRequest } from "next/server";
import { EcencyConfigManager } from "@/config";
import {
  parseThreeSpeakUploadLimitText,
  toThreeSpeakUploadLimitBody
} from "@/api/threespeak-embed/upload-limits";
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
    const { owner, isShort } = body;

    // Resolve authenticated user via HiveSigner /api/me
    const auth = await resolveUser(req, body);
    if (!auth.ok) {
      return unauthorizedResponse(auth.reason);
    }

    if (!owner || typeof owner !== "string" || owner !== auth.username) {
      return Response.json({ error: "owner must match the logged-in user" }, { status: 403 });
    }

    // Mobile native clients don't send a browser Origin header; web fetches
    // always do. Use Origin presence to decide whether to lock the upload URL
    // to ecency.com origins. Origin can be spoofed by non-browser callers,
    // but that's harmless: a forged Origin only changes which set of origins
    // the upload URL accepts, which a real browser still enforces via CORS.
    const isWebClient = Boolean(req.headers.get("origin"));

    const res = await fetch(`${embedEndpoint}/uploads/token`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        owner,
        frontend_app: "ecency",
        short: !!isShort,
        allowed_origins: isWebClient
          ? ["https://ecency.com", "https://alpha.ecency.com"]
          : []
      }),
      signal: AbortSignal.timeout(10_000)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");

      // Daily upload limit for free accounts: hand the refusal on, so web and
      // mobile clients can show 3Speak's message, the next upload time and the
      // upgrade link instead of a generic "try again".
      const limit = res.status === 429 ? parseThreeSpeakUploadLimitText(text) : null;
      if (limit) {
        console.warn(`[3Speak] Daily ${limit.kind ?? "upload"} limit reached for ${owner}`);
        const retryAfter = res.headers.get("retry-after");
        return Response.json(toThreeSpeakUploadLimitBody(limit), {
          status: 429,
          headers: retryAfter && /^\d+$/.test(retryAfter) ? { "Retry-After": retryAfter } : {}
        });
      }

      console.error(`[3Speak] Token request failed: ${res.status} ${text}`);
      return Response.json({ error: "Failed to obtain upload token" }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data, { status: 201 });
  } catch (e) {
    console.error("[3Speak] Token endpoint error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
