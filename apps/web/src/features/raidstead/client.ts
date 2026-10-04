import { createApi, makeProof, type RaidsteadApi } from "@ecency/raidstead";
import { PrivateKey, sha256 } from "@ecency/sdk";
import * as ls from "@/utils/local-storage";
import { ensureValidToken, getAccessToken, getLoginType, getPostingKey } from "@/utils/user-token";
import { hasAnyHiveExtension, signBufferWithExtension } from "@/utils/hive-extensions";
import { RAIDSTEAD_API } from "./api-base";

// The page proves the account once and keeps the game session games-api
// hands back. With a key or a wallet it signs a login message made for this
// game. Without one (a HiveSigner login) ecency.com checks the login it holds
// already and asks for the session. Ecency tokens and keys never go to the
// games API.
export { RAIDSTEAD_API };

// v2: sessions carry `ecency`; earlier ones (previews only) are not trusted as guests
const SESSION_KEY = "raidstead_session_v2";

export interface RaidsteadSession {
  account: string;
  token: string;
  expiresAt: string;
  /// Made for the Ecency user of the page, so an Ecency logout ends it too,
  /// even one done on another page or tab. A guest sign-in (no Ecency login,
  /// signed with a wallet) is not tied to one.
  ecency?: boolean;
}

export function loadSession(): RaidsteadSession | null {
  const s = ls.get(SESSION_KEY) as RaidsteadSession | null;
  if (!s || typeof s.token !== "string" || typeof s.account !== "string") return null;
  if (!(Date.parse(s.expiresAt) > Date.now())) {
    ls.remove(SESSION_KEY);
    return null;
  }
  return s;
}

export function saveSession(s: RaidsteadSession) {
  ls.set(SESSION_KEY, s);
}

export function clearSession() {
  ls.remove(SESSION_KEY);
}

export const raidsteadApi: RaidsteadApi = createApi({
  base: RAIDSTEAD_API,
  token: () => loadSession()?.token ?? null
});

/**
 * How an account can sign in to the game:
 * - "key": logged in with a posting key, the login message is signed here
 *   without asking;
 * - "ecency": any other Ecency login in this browser (HiveSigner, Keychain,
 *   HiveAuth): ecency.com checks it and asks for the session, without asking;
 * - "extension": no Ecency login for that account, but Keychain, Hive Keeper
 *   or Peak Vault can sign the login message, asking once;
 * - null: no way to sign in this browser.
 */
export type SignerKind = "key" | "ecency" | "extension" | null;

// ecency.com said it cannot vouch at all (the secret it needs is not deployed).
// For the rest of this page's life sign-in goes the way it did without it.
let vouchOff = false;

export function signerFor(username: string | null | undefined): SignerKind {
  if (username && getLoginType(username) === "privateKey" && getPostingKey(username)) return "key";
  if (!vouchOff && username && getAccessToken(username)) return "ecency";
  return hasAnyHiveExtension() ? "extension" : null;
}

function signer(kind: "key" | "extension", username: string): (text: string) => Promise<string> {
  if (kind === "key") {
    return async (text) => {
      const wif = getPostingKey(username);
      if (!wif) throw new Error("no posting key");
      return PrivateKey.fromString(wif).sign(sha256(text)).toString();
    };
  }
  return async (text) => {
    const r = await signBufferWithExtension(username, text, "Posting");
    if (!r.success || !r.result) throw new Error(r.message || "not signed");
    return r.result;
  };
}

/// The session ecency.com asks for, for the login this browser holds.
async function vouched(username: string): Promise<Omit<RaidsteadSession, "ecency">> {
  const code = await ensureValidToken(username);
  if (!code) throw new Error("no access token");
  const res = await fetch("/api/raidstead/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, code })
  });
  const s = await res.json().catch(() => null);
  if (!res.ok || s?.account !== username || typeof s.token !== "string") {
    const code = typeof s?.error === "string" ? s.error : "";
    if (code === "not_configured") vouchOff = true;
    // What went wrong, for the page: "not_configured" is nobody's fault, a 401
    // is a login ecency.com no longer takes. `vouching` tells its refusal from
    // one the games API gives to a signed proof.
    throw Object.assign(new Error(`session: ${res.status}`), {
      status: res.status,
      code,
      vouching: true
    });
  }
  return { account: s.account, token: s.token, expiresAt: s.expiresAt };
}

/// Signs in to the game as `username`. The caller stores the session, and
/// only if the page still wants it: the Ecency user may have changed while
/// the wallet was asking. `walletToo`: when ecency.com cannot vouch just now,
/// a wallet in this browser is asked instead (only on the player's own tap,
/// never while the page signs in by itself).
export async function signIn(
  username: string,
  kind: Exclude<SignerKind, null>,
  ecency: boolean,
  walletToo = false
): Promise<RaidsteadSession> {
  if (kind === "ecency") {
    try {
      return { ...(await vouched(username)), ecency };
    } catch (e) {
      if (!walletToo || !hasAnyHiveExtension()) throw e;
      kind = "extension";
    }
  }
  const proof = await makeProof(username, signer(kind, username));
  const s = await raidsteadApi.session(proof);
  return { account: s.account, token: s.token, expiresAt: s.expiresAt, ecency };
}

export async function signOut() {
  try {
    await raidsteadApi.signOut();
  } finally {
    clearSession();
  }
}
