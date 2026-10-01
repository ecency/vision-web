import { makeIdempotencyKey } from "@ecency/sdk";

// One idempotency key per (user, action, text) until its result has been shown.
// A request that finished, or is still running, after its dialog closed keeps its
// key here, so asking again for the same thing gets that charged result back as a
// free replay instead of a second charge. Held for the page's lifetime only.
const unseenKeys = new Map<string, { key: string; at: number }>();

// Well inside the backend's replay window: an older key would no longer replay, and
// could even be refused as still in progress, so start over with a fresh one.
const KEY_TTL_MS = 12 * 60 * 60 * 1000;

const slot = (username: string, action: string, text: string) =>
  JSON.stringify([username, action, text]);

export function assistRequestKey(username: string, action: string, text: string): string {
  const id = slot(username, action, text);
  const kept = unseenKeys.get(id);
  if (kept && Date.now() - kept.at < KEY_TTL_MS) return kept.key;
  const key = makeIdempotencyKey();
  unseenKeys.set(id, { key, at: Date.now() });
  return key;
}

// Call once the result is on screen: asking again after that is a new request.
export function forgetAssistRequestKey(username: string, action: string, text: string): void {
  unseenKeys.delete(slot(username, action, text));
}
