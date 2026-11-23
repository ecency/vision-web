/**
 * A signing handed to another tab or app (HiveSigner hot-sign, a Keychain
 * Mobile deep link) never settles the broadcast's promise on this page. The
 * adapter announces each hand-off here, so a view waiting on that promise can
 * stop waiting instead of blocking a retry for good (#2198).
 */
const listeners = new Set<() => void>();

export function notifyUnsettledSigning(): void {
  listeners.forEach((listener) => listener());
}

/** Subscribes to hand-offs; returns the unsubscribe. */
export function onUnsettledSigning(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
