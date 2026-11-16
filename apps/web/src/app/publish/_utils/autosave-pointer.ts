import { PREFIX } from "@/utils/local-storage";

/**
 * Which server draft the /publish composer was last autosaving into, per user.
 *
 * Only the id and the time of the last save are kept, never the post itself:
 * /publish persists content on the server, and this exists so that a returning
 * session can find that draft instead of leaving it orphaned in the Drafts
 * list. Every access is guarded, since storage throws in private windows and
 * with blocked site data, and the composer must keep working without it.
 */
export interface AutosavePointer {
  id: string;
  savedAt: number;
}

const keyFor = (username: string) => `${PREFIX}_pub_autosave_${username}`;

export function readAutosavePointer(username: string): AutosavePointer | undefined {
  try {
    const raw = localStorage.getItem(keyFor(username));
    if (!raw) {
      return undefined;
    }
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    const { id, savedAt } = value as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof savedAt !== "number") {
      return undefined;
    }
    return { id, savedAt };
  } catch {
    return undefined;
  }
}

export function writeAutosavePointer(username: string, id: string, savedAt = Date.now()) {
  try {
    localStorage.setItem(keyFor(username), JSON.stringify({ id, savedAt }));
  } catch {
    // Without storage there is simply no resume prompt next time.
  }
}

/**
 * Forget the pointer. With an id, only when it still points at that draft, so
 * publishing or deleting some other draft leaves the composer's one alone.
 */
export function clearAutosavePointer(username: string, id?: string) {
  try {
    if (id && readAutosavePointer(username)?.id !== id) {
      return;
    }
    localStorage.removeItem(keyFor(username));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
