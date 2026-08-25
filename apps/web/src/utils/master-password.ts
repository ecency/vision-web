import { PrivateKey } from "@ecency/sdk";
import { uuidV4 } from "./uuid";

/**
 * Generate a Hive master password (P5... format).
 * Uses crypto.getRandomValues for entropy, then creates a WIF-encoded key.
 */
export function generateMasterPassword(): string {
  const entropy = [uuidV4(), uuidV4(), Date.now().toString()].join("-");
  const key = PrivateKey.fromSeed(entropy);
  return "P" + key.toString();
}
