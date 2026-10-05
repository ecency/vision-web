import { EcencyConfigManager } from "@/config";
import { RAIDSTEAD_API } from "@/features/raidstead/api-base";
import { signedByHivesigner } from "@/server/hivesigner-signature";
import { verifyHsAccessToken } from "@/server/hivesigner-verify";
import { minuteLimit } from "@/server/minute-limit";
import { decodeToken } from "@/utils/hs-token";

// A game session for an Ecency login that cannot sign the game's own login
// message (HiveSigner, or any login whose key is not in this browser). The
// page sends the access token it already uses on ecency.com. This server
// checks it with HiveSigner, then vouches for the account to the games API
// with a secret the two share. The token itself never leaves ecency.com.

export const dynamic = "force-dynamic";

const NAME = /^[a-z][a-z0-9.-]{2,15}$/;
// what a HiveSigner token is written in; anything else is not sent on in a header
const TOKEN = /^[A-Za-z0-9+/=_.-]+$/;
// HiveSigner never expires a token by itself: whoever reads one checks its
// age. An access token is issued for a week, then the page renews it.
const TOKEN_MAX_AGE_S = 7 * 24 * 60 * 60;
const TOKEN_MAX_SKEW_S = 300;
// the answer carries a bearer token: nothing in between may keep it
const answer = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

// a name and a token: nothing this route is sent needs more room
const BODY_MAX_BYTES = 8 * 1024;
// how often one account may ask HiveSigner through here; a visit asks once
const askedTooOften = (() => {
  const mayAsk = minuteLimit(6);
  return (account: string) => !mayAsk(account);
})();

/// The request's body as text, or null once it is longer than `max` bytes.
/// Read in pieces and stopped there: anyone may call this route. The length
/// a caller declares proves nothing.
async function readBody(req: Request, max: number): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      // not waited for: the answer does not depend on it
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function POST(req: Request) {
  // trimmed as a pasted value may end in a newline; a value that cannot go in
  // a header is no secret at all. A 404, not a 5xx: the page must be able to
  // tell "not set up here" from "down". A 5xx does not reach it as sent.
  const secret = process.env.RAIDSTEAD_VOUCH_SECRET?.trim();
  if (!secret || /[^\x21-\x7e]/.test(secret)) return answer({ error: "not_configured" }, 404);

  let body: { username?: unknown; code?: unknown } | null;
  try {
    const text = await readBody(req, BODY_MAX_BYTES);
    if (text === null) return answer({ error: "too_large" }, 413);
    body = JSON.parse(text);
  } catch {
    return answer({ error: "bad_request" }, 400);
  }
  const username = body?.username;
  const code = body?.code;
  if (
    typeof username !== "string" ||
    !NAME.test(username) ||
    typeof code !== "string" ||
    code.length > 4096
  ) {
    return answer({ error: "bad_request" }, 400);
  }
  if (!TOKEN.test(code)) return answer({ error: "unauthorized" }, 401);

  // Only an access token issued for this app to this account. HiveSigner's
  // own check also passes a login message made for someone else to read, a
  // code or another app's token: none of those may open a game session.
  const message = decodeToken(code);
  if (
    message?.signed_message?.type !== "posting" ||
    message.signed_message.app !== EcencyConfigManager.CONFIG.service.hsClientId ||
    !Array.isArray(message.authors) ||
    message.authors.length !== 1 ||
    message.authors[0] !== username
  ) {
    return answer({ error: "unauthorized" }, 401);
  }
  // Not one from long ago either (a leaked or forgotten one): its date is
  // under the signature, so it cannot be changed.
  const age = Date.now() / 1000 - message.timestamp;
  if (
    typeof message.timestamp !== "number" ||
    !(age <= TOKEN_MAX_AGE_S && age >= -TOKEN_MAX_SKEW_S)
  ) {
    return answer({ error: "unauthorized" }, 401);
  }

  // Anyone may call this route. Anyone can write a token that reads well so
  // far. Before a request leaves this server on its account, the token's
  // signature must be HiveSigner's own: checked here, against its key on the
  // chain. What is left is a real token of a real account, which gets a few
  // asks a minute.
  const signed = await signedByHivesigner(message);
  if (signed === null) return answer({ error: "hivesigner_unavailable" }, 503);
  if (!signed) return answer({ error: "unauthorized" }, 401);
  if (askedTooOften(username)) return answer({ error: "too_many_requests" }, 429);

  const checked = await verifyHsAccessToken(code, req.signal);
  if (!checked.ok) {
    return checked.reason === "unavailable"
      ? answer({ error: "hivesigner_unavailable" }, 503)
      : answer({ error: "unauthorized" }, 401);
  }
  if (checked.username !== username) return answer({ error: "unauthorized" }, 401);

  try {
    const res = await fetch(`${RAIDSTEAD_API}/v1/raidstead/session/vouched`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-vouch-secret": secret },
      body: JSON.stringify({ account: username }),
      // the secret goes to the games API or nowhere
      redirect: "error",
      signal: AbortSignal.timeout(8_000)
    });
    const session = await res.json().catch(() => null);
    if (
      res.status === 200 &&
      session?.account === username &&
      typeof session.token === "string" &&
      typeof session.expiresAt === "string"
    ) {
      return answer(
        { account: session.account, token: session.token, expiresAt: session.expiresAt },
        200
      );
    }
    console.error(`[Raidstead] vouched session answered ${res.status}`);
  } catch (e) {
    // What kind of failure, never its message: that may quote the request's
    // headers. The name tells a timeout apart, the cause's code a refused or
    // unresolved connection.
    const { name, cause } = (e ?? {}) as { name?: unknown; cause?: { code?: unknown } };
    console.error(
      "[Raidstead] vouched session failed",
      typeof name === "string" ? name : "",
      typeof cause?.code === "string" ? cause.code : ""
    );
  }
  return answer({ error: "game_unavailable" }, 502);
}
