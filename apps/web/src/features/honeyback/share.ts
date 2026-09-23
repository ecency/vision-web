import { cache } from "react";
import defaults from "@/defaults.json";

// A share card from the Honeyback game: a score, best run, garden stage or
// streak the games API vouches for, frozen with the player's name at the time
// it was made. The landing page and its preview image read it here.

export const HONEYBACK_API = "https://games-api.ecency.com";
export const HONEYBACK_SHARE_BASE = `${defaults.base}/honeyback-share`;

// The id alphabet the games API issues: ten characters, no 0/O/1/I/l.
export const HONEYBACK_SHARE_ID = /^[a-km-zA-HJ-NP-Z2-9]{10}$/;

export type HoneybackShareKind = "score" | "best" | "stage" | "streak";

export interface HoneybackShare {
  id: string;
  kind: HoneybackShareKind;
  value: number;
  name: string;
  createdAt: string;
}

const KINDS: HoneybackShareKind[] = ["score", "best", "stage", "streak"];

export function isHoneybackShareId(id: string | undefined): id is string {
  return typeof id === "string" && HONEYBACK_SHARE_ID.test(id);
}

// Accepts only the shape the API documents, for the id that was asked for;
// anything else is refused so a changed or broken response never renders a
// half card, or someone else's.
export function parseHoneybackShare(input: unknown, expectedId?: string): HoneybackShare | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!isHoneybackShareId(raw.id as string | undefined)) return null;
  if (expectedId !== undefined && raw.id !== expectedId) return null;
  if (!KINDS.includes(raw.kind as HoneybackShareKind)) return null;
  if (typeof raw.value !== "number" || !Number.isInteger(raw.value) || raw.value < 1) return null;
  if (typeof raw.name !== "string" || raw.name.trim().length === 0) return null;
  if (typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) return null;
  return {
    id: raw.id as string,
    kind: raw.kind as HoneybackShareKind,
    value: raw.value,
    name: raw.name.trim(),
    createdAt: raw.createdAt
  };
}

export type HoneybackShareLookup =
  | { status: "found"; share: HoneybackShare }
  | { status: "missing" }
  | { status: "unavailable" };

export const REQUEST_TIMEOUT_MS = 5000;
export const RETRY_DELAY_MS = 300;

// "missing" only for a bad id or the API's own 404, which never changes; a
// rate limit, a server error, a timeout or a response that does not parse is
// "unavailable", so the caller can fail in a way that is asked again rather
// than show a valid share as gone. One retry, only for a rate limit, a server
// error or a dropped connection: a timeout means the API is slow and a second
// wait would only push the page toward the edge's own limit, and a response
// that did not parse will not parse next time either. Next caches only 200
// responses in its data cache, so an error answer is never kept for the day.
//
// Wrapped in React's cache because the metadata and the page of one request
// both ask, and a fetch with a signal opts out of Next's own per-request
// dedupe (server/lib/dedupe-fetch.js).
export const fetchHoneybackShare = cache(async (id: string): Promise<HoneybackShareLookup> => {
  if (!isHoneybackShareId(id)) return { status: "missing" };
  const first = await requestShare(id);
  if (!first.retry) return first.lookup;
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return (await requestShare(id)).lookup;
});

const UNAVAILABLE: HoneybackShareLookup = { status: "unavailable" };

async function requestShare(id: string): Promise<{ lookup: HoneybackShareLookup; retry: boolean }> {
  try {
    const response = await fetch(`${HONEYBACK_API}/v1/shares/${id}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 86400 }
    });
    if (response.status === 404) return { lookup: { status: "missing" }, retry: false };
    if (response.status === 429 || response.status >= 500)
      return { lookup: UNAVAILABLE, retry: true };
    if (!response.ok) return { lookup: UNAVAILABLE, retry: false };
    const share = parseHoneybackShare(await response.json(), id);
    return { lookup: share ? { status: "found", share } : UNAVAILABLE, retry: false };
  } catch (error) {
    // AbortSignal.timeout rejects with a DOMException, which is not an Error
    // in every realm; the name is what identifies it.
    const timedOut = (error as { name?: string } | null)?.name === "TimeoutError";
    return { lookup: UNAVAILABLE, retry: !timedOut };
  }
}

export type Translate = (key: string, values?: Record<string, string | number>) => string;

// The one sentence a share is about, for the title, the card and the wave.
export function honeybackShareHeadline(share: HoneybackShare, t: Translate): string {
  return t(`static.honeyback.share.headline.${share.kind}`, {
    name: share.name,
    value: share.value.toLocaleString("en-US")
  });
}

export function honeybackShareUrl(id: string): string {
  return `${HONEYBACK_SHARE_BASE}/${id}`;
}

// The compose link the web and app composers open with the text filled in.
export function honeybackWaveComposeUrl(share: HoneybackShare, t: Translate): string {
  const text = `${honeybackShareHeadline(share, t)} ${honeybackShareUrl(share.id)}`;
  return `/waves?text=${encodeURIComponent(text)}`;
}
