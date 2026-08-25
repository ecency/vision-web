import { PrivateKey } from "@ecency/sdk";

/**
 * Generate a UUID v4 string using crypto.getRandomValues for broad browser compatibility.
 * Supports Chrome 49+, Firefox 36+, Safari 9+ (unlike crypto.randomUUID which requires Chrome 92+).
 */
function uuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version 4 (bits 12-15 of byte 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant bits (bits 6-7 of byte 8)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate a Hive master password (P5... format).
 * Uses crypto.getRandomValues for entropy, then creates a WIF-encoded key.
 */
export function generateMasterPassword(): string {
  const entropy = [
    uuidV4(),
    uuidV4(),
    Date.now().toString()
  ].join("-");
  const key = PrivateKey.fromSeed(entropy);
  return "P" + key.toString();
}
