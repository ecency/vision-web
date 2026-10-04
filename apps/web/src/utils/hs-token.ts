import type { HiveSignerMessage } from "@/types";

/// The message inside a HiveSigner token (base64url of its JSON), or null.
/// On its own, with nothing of the browser in it: server routes read tokens too.
export function decodeToken(code: string): HiveSignerMessage | null {
  const normalizedCode = code.replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "=");

  try {
    const decoded = Buffer.from(normalizedCode, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}
