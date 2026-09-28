// The sign-in proof games-api exchanges for a game session: a login message
// made only for Raidstead (never a HiveSigner "code", which is a posting
// credential), signed by one of the account's keys. games-api accepts it
// once, within 10 minutes.

export interface LoginMessage {
  signed_message: { type: "login"; app: "ecency.app"; audience: "raidstead" };
  authors: [string];
  timestamp: number;
}

export function loginMessage(account: string, now = Date.now()): LoginMessage {
  return { signed_message: { type: "login", app: "ecency.app", audience: "raidstead" }, authors: [account], timestamp: Math.floor(now / 1000) };
}

/// The exact bytes a wallet signs (sha256 of this string).
export const messageText = (m: LoginMessage) => JSON.stringify(m);

/// Base64 of the signed message, as games-api decodes it.
export function encodeProof(m: LoginMessage, signature: string): string {
  const json = JSON.stringify({ ...m, signatures: [signature] });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/// Signs the message text and returns the proof. `sign` gets the text and
/// returns the signature (a key signs sha256(text); Keychain's signBuffer
/// does the same).
export async function makeProof(account: string, sign: (text: string) => Promise<string>, now = Date.now()): Promise<string> {
  const m = loginMessage(account, now);
  return encodeProof(m, await sign(messageText(m)));
}
