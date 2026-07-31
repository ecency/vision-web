export interface AiGenerationPrice {
  aspect_ratio: string;
  cost: number;
}

export interface AiImagePowerTier {
  power: number;
  multiplier: number;
}

export interface AiImagePriceResponse {
  prices: AiGenerationPrice[];
  power: AiImagePowerTier[];
}

export interface AiGenerationRequest {
  prompt: string;
  aspect_ratio?: string;
  power?: number;
  // Reused across retries so the backend recovers a paid-but-undelivered generation
  // instead of creating (and billing) a second prediction.
  idempotency_key?: string;
}

export interface AiGenerationResponse {
  url: string;
  prompt: string;
  aspect_ratio: string;
  power: number;
  cost: number;
  generation_id: string;
  // True when the backend replayed a previously-generated image for this idempotency_key
  // (no new charge, no new vendor call).
  idempotent_replay?: boolean;
}

export interface AiAssistPrice {
  action: string;
  cost: number;
  free_limit: number;
  free_remaining?: number;
}

export interface AiAssistResponse {
  action: string;
  output: string;
  cost: number;
  is_free: boolean;
  request_id: string;
  // true when the backend deduped a duplicate POST against an earlier
  // successful request with the same idempotency_key. Cost is 0 in that case.
  idempotent_replay?: boolean;
}

/**
 * Dictation pricing. Deliberately NOT part of AiAssistPrice[]: assist actions are a
 * list of flat-cost items and every shipped client renders each entry as a selectable
 * action, so a metered entry there would appear in older clients as a pickable action
 * they cannot perform.
 */
export interface AiTranscribePrice {
  // Billing granularity. Duration is rounded UP to a whole unit, so a 5s clip and a
  // 30s clip cost the same.
  unit_seconds: number;
  unit_cost: number;
  // Free units per day. Zero for regular members; Ecency Pro is the only way to get any.
  free_limit: number;
  free_remaining?: number;
  max_seconds: number;
  max_bytes: number;
}

export interface AiTranscribeParams {
  audio: Blob;
  // Clip length the client measured. Used to price the request before any vendor
  // money is spent; the duration the vendor reports is authoritative and the charge
  // is trued up against it, so a wrong value here does not change what you pay.
  durationMs: number;
  fileName?: string;
  // Reused across retries so the backend replays a completed transcription instead
  // of transcribing (and charging) a second time. Generating one per attempt would
  // defeat the dedupe in exactly the case it exists for: a request that reached the
  // server whose response was lost. Same contract as AiGenerationRequest.
  idempotency_key?: string;
}

export interface AiTranscribeResponse {
  text: string;
  // Authoritative duration from the vendor, which is what the charge is based on.
  duration: number;
  units: number;
  free_units: number;
  cost: number;
  request_id: string;
  idempotent_replay?: boolean;
}
