/**
 * Generate a UUID v4 string using crypto.getRandomValues for broad browser compatibility.
 * Supports Chrome 49+, Firefox 36+, Safari 9+ (unlike crypto.randomUUID which requires Chrome 92+).
 */
export function uuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version 4 (bits 12-15 of byte 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant bits (bits 6-7 of byte 8)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  // (b + 0x100).toString(16).slice(1) zero-pads without String.prototype.padStart,
  // which is ES2017 and missing on part of the browser range above (the client
  // build replaces Next's built-in polyfills with an empty module).
  const hex = Array.from(bytes)
    .map((b) => (b + 0x100).toString(16).slice(1))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
