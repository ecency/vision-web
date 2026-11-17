/**
 * What a mutation resolves with when it only handed the operation to an
 * external signer (HiveSigner's signing page) and nothing is signed yet
 * (#2126). Callers must not treat it as success: no "done" message, no cache
 * update; the signer's own callback reports the real outcome.
 */
export const PENDING_EXTERNAL_SIGNATURE = Object.freeze({ pendingExternalSignature: true as const });

export type PendingExternalSignature = typeof PENDING_EXTERNAL_SIGNATURE;

export function isPendingExternalSignature(value: unknown): value is PendingExternalSignature {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { pendingExternalSignature?: unknown }).pendingExternalSignature === true
  );
}
