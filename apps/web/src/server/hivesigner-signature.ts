import { createHash } from "node:crypto";
import { callRPC, Signature } from "@ecency/sdk/hive";
import type { HiveSignerMessage } from "@/types";

// The tokens HiveSigner issues are signed with its own account's posting key.
// That key is public, on the chain: with it a token's signature is checked
// here, so HiveSigner is not asked about every token anyone cares to send.
const HIVESIGNER_ACCOUNT = "hivesigner";
// how long the keys read from the chain are taken as current
const KEYS_TTL_MS = 60 * 60 * 1000;
// A signature that matches none of them may mean the key was changed: the
// chain is asked again, but no more often than this, however many requests
// arrive.
const KEYS_RECHECK_MS = 60 * 1000;

// Times here are the running time of this process, which never steps back as
// the clock on the wall can. Before any of it nothing was read or tried.
const NEVER = Number.NEGATIVE_INFINITY;

interface Known {
  keys: string[] | null;
  /// when they were last read; when reading was last tried
  at: number;
  tried: number;
}
const known: Known = { keys: null, at: NEVER, tried: NEVER };
let reading: Promise<void> | null = null;

/// The posting keys in what the chain answers about this account. None when
/// the answer is about anything else, or holds none.
function postingKeys(answer: unknown): string[] {
  const row = (answer as { name?: unknown; posting?: { key_auths?: unknown } }[] | null)?.[0];
  const auths = row?.name === HIVESIGNER_ACCOUNT ? row.posting?.key_auths : null;
  if (!Array.isArray(auths)) return [];
  return auths.map((auth) => auth?.[0]).filter((key): key is string => typeof key === "string");
}

async function read(now: number): Promise<void> {
  known.tried = now;
  try {
    const answer = await callRPC(
      "condenser_api.get_accounts",
      [[HIVESIGNER_ACCOUNT]],
      undefined,
      undefined,
      undefined,
      // An answer without the keys is a fault of the node that gave it: the
      // next node is asked.
      (given) => postingKeys(given).length > 0
    );
    const keys = postingKeys(answer);
    // an answer with no keys is no answer: what was known stays
    if (keys.length) {
      known.keys = keys;
      known.at = now;
    }
  } catch (e) {
    console.error("[HiveSigner] could not read its keys from the chain", (e as Error)?.name);
  }
}

/// HiveSigner's posting keys, read again when older than `maxAgeMs`. Null
/// when they were never learned. A failed read keeps what was known.
async function keys(maxAgeMs: number): Promise<string[] | null> {
  const now = performance.now();
  const stale = !known.keys || now - known.at >= maxAgeMs;
  if (stale && now - known.tried >= KEYS_RECHECK_MS) {
    // one read at a time, shared by everyone who waits for it
    reading ??= read(now).finally(() => {
      reading = null;
    });
  }
  // Keys still current are given at once. Only who needs newer ones waits for
  // a read, whoever caused it.
  if (stale && reading) await reading;
  return known.keys;
}

/// The public key that signed this message, or null when its signature
/// cannot be read. The signed bytes are these three fields in this order, as
/// HiveSigner writes them.
export function signerOf(message: HiveSignerMessage): string | null {
  const signature = message.signatures?.[0];
  if (typeof signature !== "string") return null;
  try {
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          signed_message: message.signed_message,
          authors: message.authors,
          timestamp: message.timestamp
        })
      )
      .digest();
    return Signature.from(signature).getPublicKey(hash).toString();
  } catch {
    return null;
  }
}

/// Whether HiveSigner itself signed this message. Null when its keys could
/// not be learned, so nothing can be said.
export async function signedByHivesigner(message: HiveSignerMessage): Promise<boolean | null> {
  const signer = signerOf(message);
  if (!signer) return false;
  const current = await keys(KEYS_TTL_MS);
  if (current?.includes(signer)) return true;
  // the key may have been changed since it was read
  const fresh = await keys(KEYS_RECHECK_MS);
  return fresh ? fresh.includes(signer) : null;
}

/// For specs: forget what was read.
export function forgetHivesignerKeys() {
  known.keys = null;
  known.at = NEVER;
  known.tried = NEVER;
  reading = null;
}
