/**
 * A profile's website field as a safe href, or null. The field is authored
 * on-chain and entirely untrusted: only http(s) survives, everything else
 * (javascript:, data:, unparseable text) renders as nothing rather than as a
 * link. A bare domain gets https:// so "example.com" keeps working.
 */
export function safeWebsiteUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const candidate = raw.trim();
  const url =
    candidate.startsWith('http://') || candidate.startsWith('https://')
      ? candidate
      : `https://${candidate}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}
