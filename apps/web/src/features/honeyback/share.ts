// A share card from the Honeyback game: a score, best run, garden stage or
// streak the games API vouches for, frozen with the player's name at the time
// it was made. The landing page and its preview image read it here.

export const HONEYBACK_API = "https://games-api.ecency.com";
export const HONEYBACK_SHARE_BASE = "https://ecency.com/honeyback-share";

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

// Accepts only the shape the API documents; anything else is treated as
// missing so a changed or broken response never renders a half card.
export function parseHoneybackShare(input: unknown): HoneybackShare | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!isHoneybackShareId(raw.id as string | undefined)) return null;
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

// Null for an unknown id, a bad id or an API that is down: the page shows
// not found rather than an error, and the response is cached for a day the
// way the API itself caches it.
export async function fetchHoneybackShare(id: string): Promise<HoneybackShare | null> {
  if (!isHoneybackShareId(id)) return null;
  try {
    const response = await fetch(`${HONEYBACK_API}/v1/shares/${id}`, {
      next: { revalidate: 86400 }
    });
    if (!response.ok) return null;
    return parseHoneybackShare(await response.json());
  } catch {
    return null;
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
