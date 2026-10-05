/// A limit of `max` per minute for each key, kept in this process. Returns the
/// question to ask before each use: true when the key may go ahead, which
/// counts as one use.
export function minuteLimit(max: number): (key: string) => boolean {
  const uses = new Map<string, number[]>();
  return (key) => {
    // the running time of this process: unlike the clock, it never steps back
    const now = performance.now();
    const since = now - 60_000;
    const recent = (uses.get(key) ?? []).filter((at) => at > since);
    const ok = recent.length < max;
    if (ok) recent.push(now);
    uses.set(key, recent);
    // keys not used for a minute are forgotten, so the map stays small
    if (uses.size > 1000) {
      for (const [k, at] of uses) if (!at.some((t) => t > since)) uses.delete(k);
    }
    return ok;
  };
}
