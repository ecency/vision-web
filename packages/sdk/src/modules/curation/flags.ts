import type { CurationFlags } from "./types";

/**
 * The desk shows the moderation flags the backend materialized from the bot's
 * config and from external abuse lists. The web reads them through this helper
 * so the list's name stays a wire detail of the payload: it is a warning the
 * desk displays, never a verdict and never an input to indexability.
 */
export function isOnAbuseList(flags: CurationFlags | null | undefined): boolean {
  return !!flags?.spaminator || !!flags?.abuser;
}

/** Any flag that keeps a row out of the public queue. */
export function isExcludedByFlags(flags: CurationFlags | null | undefined): boolean {
  return !!flags?.ignorelist || !!flags?.abuser || !!flags?.blocked_tag || !!flags?.patch_body || !!flags?.deleted;
}
