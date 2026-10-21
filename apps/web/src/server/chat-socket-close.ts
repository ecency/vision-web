import type { WebSocket } from "ws";

/**
 * A close code that may be sent in a close frame. 1005 and 1006 are only ever
 * reported locally (no status / connection dropped), so `ws` throws if asked to
 * send them; forwarding a dropped peer's 1006 as-is used to leave the other side open.
 */
export function toSendableCloseCode(code: number): number {
  const isValid =
    (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) ||
    (code >= 3000 && code <= 4999);
  return isValid ? code : 1000;
}

/** Closes a socket with the peer's code where allowed, and never leaves it open. */
export function closeSocketSafely(socket: WebSocket, code: number, reason?: Buffer | string) {
  try {
    socket.close(toSendableCloseCode(code), reason);
  } catch {
    socket.terminate();
  }
}
