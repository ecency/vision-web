/**
 * Trade a one-time handoff code for the carried session. The code arrives in
 * the Customize link's fragment from ecency.com's signup and is worthless
 * after this single exchange or a few minutes, which is exactly why it is a
 * code and not the bearer itself. Only managed instances ever receive one
 * (the link is minted by the managed signup), so the managed API base is the
 * right and only place to ask.
 */

const HANDOFF_EXCHANGE_URL =
  'https://api.blogs.ecency.com/hosting/v1/auth/handoff/exchange';
const EXCHANGE_TIMEOUT_MS = 15_000;

export async function exchangeHandoffCode(
  code: string,
): Promise<{ accessToken: string; username: string } | null> {
  try {
    const response = await fetch(HANDOFF_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      accessToken?: unknown;
      username?: unknown;
    };
    if (
      typeof data.accessToken !== 'string' ||
      !data.accessToken ||
      typeof data.username !== 'string' ||
      !/^[a-z][a-z0-9.-]{2,15}$/.test(data.username)
    ) {
      return null;
    }
    return { accessToken: data.accessToken, username: data.username };
  } catch {
    // Unreachable API or timeout: the owner lands logged out with the setup
    // intent still pending, same as every other failed handoff.
    return null;
  }
}
