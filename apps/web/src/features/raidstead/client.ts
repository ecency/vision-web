import { createApi, makeProof, type RaidsteadApi } from "@ecency/raidstead";
import { PrivateKey, sha256 } from "@ecency/sdk";
import * as ls from "@/utils/local-storage";
import { getLoginType, getPostingKey } from "@/utils/user-token";
import { hasAnyHiveExtension, signBufferWithExtension } from "@/utils/hive-extensions";

// Raidstead (ecency.com/raidstead) talks to the same games API as Honeyback.
// The page proves the account once with a login message signed for this game
// and keeps the game session games-api hands back; it never sends Ecency
// tokens or keys anywhere.
export const RAIDSTEAD_API = "https://games-api.ecency.com";

const SESSION_KEY = "raidstead_session";

export interface RaidsteadSession {
  account: string;
  token: string;
  expiresAt: string;
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
 * How an account can sign the game's login message:
 * - "key": logged in with a posting key, signed here without asking;
 * - "extension": Keychain, Hive Keeper or Peak Vault asks once;
 * - null: no way to sign in this browser (HiveSigner or MetaMask logins
 *   without an extension).
 */
export type SignerKind = "key" | "extension" | null;

export function signerFor(username: string | null | undefined): SignerKind {
  if (username && getLoginType(username) === "privateKey" && getPostingKey(username)) return "key";
  return hasAnyHiveExtension() ? "extension" : null;
}

function signer(
  kind: Exclude<SignerKind, null>,
  username: string
): (text: string) => Promise<string> {
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

/// Signs in to the game as `username`. The caller stores the session, and
/// only if the page still wants it: the Ecency user may have changed while
/// the wallet was asking.
export async function signIn(
  username: string,
  kind: Exclude<SignerKind, null>
): Promise<RaidsteadSession> {
  const proof = await makeProof(username, signer(kind, username));
  const s = await raidsteadApi.session(proof);
  return { account: s.account, token: s.token, expiresAt: s.expiresAt };
}

export async function signOut() {
  try {
    await raidsteadApi.signOut();
  } finally {
    clearSession();
  }
}
