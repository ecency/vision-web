// One idempotency key per (user, action, text) until its result has been shown.
// A request that finished, or is still running, after its dialog closed keeps its
// key here, so asking again for the same thing gets that charged result back as a
// free replay instead of a second charge. Held for the page's lifetime only.
const unseenKeys = new Map<string, string>();

const slot = (username: string, action: string, text: string) =>
  JSON.stringify([username, action, text]);

export function assistRequestKey(username: string, action: string, text: string): string {
  const id = slot(username, action, text);
  let key = unseenKeys.get(id);
  if (!key) {
    key = crypto.randomUUID();
    unseenKeys.set(id, key);
  }
  return key;
}

// Call once the result is on screen: asking again after that is a new request.
export function forgetAssistRequestKey(username: string, action: string, text: string): void {
  unseenKeys.delete(slot(username, action, text));
}
