import type { Operation } from "@ecency/sdk";

/**
 * A signing handed to another tab or app (HiveSigner hot-sign, a Keychain
 * Mobile deep link) never settles the broadcast's promise on this page. The
 * adapter announces each hand-off here, with the operations handed off, so a
 * view waiting on that request can stop waiting instead of blocking a retry
 * for good (#2198).
 */
type Listener = (ops: Operation[]) => void;
const listeners = new Set<Listener>();

export function notifyUnsettledSigning(ops: Operation[]): void {
  listeners.forEach((listener) => listener(ops));
}

/** Subscribes to hand-offs; returns the unsubscribe. */
export function onUnsettledSigning(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
