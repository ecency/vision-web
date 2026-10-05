import { createHash } from "node:crypto";
import { PrivateKey } from "@ecency/sdk/hive";
import type { HiveSignerMessage } from "@/types";

// For specs that run in Node: the signing here is the real one.

/// A token as HiveSigner issues one: these three fields in this order, hashed
/// and signed, the signature appended. Issued a minute ago unless said otherwise.
export function issue(
  key: PrivateKey,
  account = "ann",
  timestamp = Math.floor(Date.now() / 1000) - 60,
  signed_message: HiveSignerMessage["signed_message"] = { type: "posting", app: "ecency.app" }
): HiveSignerMessage {
  const message = { signed_message, authors: [account], timestamp };
  const hash = createHash("sha256").update(JSON.stringify(message)).digest();
  return { ...message, signatures: [key.sign(hash).toString()] };
}

const SWAPS: Record<string, string> = { "+": "-", "/": "_", "=": "." };
/// The same token as a page holds it: base64 with HiveSigner's three swaps.
export const held = (message: HiveSignerMessage) =>
  Buffer.from(JSON.stringify(message))
    .toString("base64")
    .replace(/[+/=]/g, (c) => SWAPS[c]);
