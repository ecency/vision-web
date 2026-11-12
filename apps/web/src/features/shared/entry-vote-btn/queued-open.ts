/**
 * The one vote slider waiting to open, app-wide.
 *
 * A click on a vote button while the user's own vote is still being looked up
 * queues the slider to open once the vote is known (it must not open assuming
 * "not voted"). There is one slot: a newer click on another card replaces it.
 * It expires after QUEUED_OPEN_MS, and the owning button cancels it on
 * unmount, logout, scroll or a click elsewhere.
 */
export const QUEUED_OPEN_MS = 3_000;

let queued: { owner: string; expiresAt: number } | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function queueOpen(owner: string): void {
  queued = { owner, expiresAt: Date.now() + QUEUED_OPEN_MS };
  emit();
}

/** True (and the slot is cleared) when `owner` holds a live queued open. */
export function takeQueuedOpen(owner: string): boolean {
  if (!queued || queued.owner !== owner) return false;
  const live = Date.now() <= queued.expiresAt;
  queued = null;
  emit();
  return live;
}

/** Clear the slot if `owner` holds it. */
export function cancelQueuedOpen(owner: string): void {
  if (queued?.owner === owner) {
    queued = null;
    emit();
  }
}

export function queuedOpenOwner(): string | null {
  return queued?.owner ?? null;
}

export function subscribeQueuedOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
