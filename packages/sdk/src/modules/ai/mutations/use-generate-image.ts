import { CONFIG, getBoundFetch, getQueryClient, QueryKeys } from "@/modules/core";
import { useMutation } from "@tanstack/react-query";
import type { AiGenerationResponse } from "../types";

export interface GenerateImageParams {
  prompt: string;
  aspect_ratio?: string;
  power?: number;
  // Pass a stable key to make a retry recover the same paid generation. If omitted a
  // fresh key is generated per call (only dedupes edge/proxy retries, not user retries).
  idempotency_key?: string;
}

// Generates a key matching the eepoints validator [A-Za-z0-9_-]{8,64}.
function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const arr = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useGenerateImage(
  username: string | undefined,
  accessToken: string | undefined,
) {
  return useMutation({
    mutationKey: ["ai", "generate-image"],
    mutationFn: async (params: GenerateImageParams): Promise<AiGenerationResponse> => {
      if (!username) {
        throw new Error(
          "[SDK][AI][GenerateImage] – username wasn't provided"
        );
      }

      if (!accessToken) {
        throw new Error(
          "[SDK][AI][GenerateImage] – access token wasn't found"
        );
      }

      const fetchApi = getBoundFetch();
      const response = await fetchApi(
        CONFIG.privateApiHost + "/private-api/ai-generate-image",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: accessToken,
            us: username,
            prompt: params.prompt,
            aspect_ratio: params.aspect_ratio ?? "1:1",
            power: params.power ?? 1,
            idempotency_key: params.idempotency_key ?? makeIdempotencyKey(),
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          // not JSON
        }

        const err = new Error(
          `[SDK][AI][GenerateImage] – failed with status ${response.status}${body ? `: ${body}` : ""}`
        );
        (err as any).status = response.status;
        (err as any).data = parsed;
        throw err;
      }

      // 202 = the prediction is paid for and captured but not yet delivered to our image
      // host. Detect it by HTTP status BEFORE parsing (the body may be present or empty)
      // and surface it as a typed error so the caller can retry with the SAME
      // idempotency_key to fetch it — no second prediction, no second charge.
      if (response.status === 202) {
        let pendingData: Record<string, unknown> = {};
        try {
          pendingData = await response.json();
        } catch {
          // empty / non-JSON 202 body is fine — the status alone drives recovery
        }
        const err = new Error("[SDK][AI][GenerateImage] – delivery pending");
        (err as any).status = 202;
        (err as any).data = pendingData;
        throw err;
      }

      const data = (await response.json()) as AiGenerationResponse;

      return data;
    },
    onSuccess: () => {
      // Invalidate points cache since balance changed
      if (username) {
        getQueryClient().invalidateQueries({
          queryKey: QueryKeys.points._prefix(username),
        });
        // The new image belongs in the user's generation history right away.
        getQueryClient().invalidateQueries({
          queryKey: QueryKeys.ai.images(username),
        });
      }
    },
  });
}
