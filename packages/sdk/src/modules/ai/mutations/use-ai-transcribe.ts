import { CONFIG, getBoundFetch, getQueryClient, QueryKeys } from "@/modules/core";
import { useMutation } from "@tanstack/react-query";
import { makeIdempotencyKey } from "./make-idempotency-key";
import type { AiTranscribeParams, AiTranscribeResponse } from "../types";

/**
 * Transcribe an audio clip to text, charged per 30 seconds.
 *
 * Sends multipart/form-data rather than JSON because it carries a file. Unlike the
 * other AI mutations the charge is BURNED rather than moved to the treasury, so the
 * points transaction shows up as PointTransactionType.BURNED (997).
 */
export function useAiTranscribe(username: string | undefined, accessToken: string | undefined) {
  return useMutation({
    mutationKey: ["ai", "transcribe"],
    mutationFn: async (params: AiTranscribeParams): Promise<AiTranscribeResponse> => {
      if (!username) {
        throw new Error("[SDK][AI][Transcribe] – username wasn't provided");
      }

      // Validate the token actually being sent, not just the bound one. A caller
      // that resolves a fresh token per call (because the bound one can expire
      // during a long recording) legitimately has nothing at hook construction.
      const code = params.code ?? accessToken;
      if (!code) {
        throw new Error("[SDK][AI][Transcribe] – access token wasn't found");
      }

      const form = new FormData();
      form.append("code", code);
      // `us` is resolved from the code server-side and is deliberately not sent:
      // upstream burns from whoever it names.
      form.append("duration_ms", String(Math.round(params.durationMs)));
      // Caller-supplied key when there is one. Generating a fresh key per attempt
      // would defeat the dedupe in the one case it exists for: a POST that reached
      // the server whose response was lost. Retrying then would transcribe and
      // charge a second time. Same contract as useGenerateImage.
      form.append("idempotency_key", params.idempotency_key ?? makeIdempotencyKey());
      form.append("audio", params.audio, params.fileName ?? "clip.webm");

      const fetchApi = getBoundFetch();
      // No Content-Type header: fetch sets it, including the multipart boundary.
      // Setting it by hand drops the boundary and the body becomes unparseable.
      const response = await fetchApi(CONFIG.privateApiHost + "/private-api/ai-transcribe", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        const body = await response.text();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          // not JSON
        }

        // Object.assign rather than `as any` casts: callers need `status` to tell a
        // 402 (out of Points) from a 429 (rate limited) from a 400 (clip too long),
        // and this keeps that shape typed.
        throw Object.assign(
          new Error(
            `[SDK][AI][Transcribe] – failed with status ${response.status}${body ? `: ${body}` : ""}`
          ),
          { status: response.status, data: parsed }
        );
      }

      return (await response.json()) as AiTranscribeResponse;
    },
    onSuccess: (data) => {
      if (username) {
        if (data.cost > 0) {
          getQueryClient().invalidateQueries({
            queryKey: QueryKeys.points._prefix(username)
          });
        }
        // Refresh free_remaining, which only Pro members ever have above zero.
        getQueryClient().invalidateQueries({
          queryKey: QueryKeys.ai.transcribePrice(username)
        });
      }
    }
  });
}
