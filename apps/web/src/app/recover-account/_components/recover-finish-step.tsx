"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { Button } from "@ui/button";
import { Spinner } from "@ui/spinner";
import {
  ACCESS_ROLES,
  areAllKeysReplaced,
  isOwnerReplaced,
  loadRecentPostingAuthAdds,
  loadRecoveryChainState,
  submitRecoverAccount,
  submitReplaceKeys,
  verifyRecoveredKeys,
  type AccessRole,
  type RecoveryChainState
} from "@/features/account-recovery/recovery-chain";
import {
  getHourlyLimitWaitUntil,
  isWithinRecoveryWindow,
  parseChainTime
} from "@/features/account-recovery/recovery-eligibility";
import type { RecoveryKeySet } from "@/features/account-recovery/recovery-keys";
import type { RecoveryProof } from "../_page";

type Phase =
  | "checking"
  | "check-failed"
  | "recovery-wait"
  | "recovering"
  | "recover-failed"
  | "review"
  | "keys-wait"
  | "updating"
  | "keys-failed"
  | "verifying"
  | "verify-failed";

type Keep = Record<AccessRole, string[]>;

/** Margin left in the 30 day window before tx1 is signed. */
const WINDOW_MARGIN_MS = 10 * 60 * 1000;
/** Extra time after a limit lifts before trying again, so the next block has passed. */
const RETRY_BUFFER_MS = 6000;

interface Props {
  username: string;
  keys: RecoveryKeySet;
  proof: RecoveryProof;
  onKeysReplaced: () => void;
  onManual: (code: string) => void;
}

/**
 * tx1 (recover_account) goes out as soon as the request is on chain. tx2 (all
 * keys replaced) follows once the user has reviewed account access and the
 * owner change limit allows it. Every attempt and retry reads the chain first,
 * so nothing is sent twice.
 */
export function RecoverFinishStep({ username, keys, proof, onKeysReplaced, onManual }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [state, setState] = useState<RecoveryChainState | null>(null);
  const [waitUntil, setWaitUntil] = useState<Date | null>(null);
  const [keep, setKeep] = useState<Keep | null>(null);
  const [flagged, setFlagged] = useState<Map<string, string | null>>(new Map());
  const [detail, setDetail] = useState("");

  const confirmed = useRef(false);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const callbacks = useRef({ onKeysReplaced, onManual });
  callbacks.current = { onKeysReplaced, onManual };

  const ownerPub = keys.publicKeys.owner;

  const advance = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    clearTimeout(timer.current);

    const schedule = (until: Date, head: number) => {
      setWaitUntil(until);
      timer.current = setTimeout(
        () => advanceRef.current(),
        Math.max(0, until.getTime() - head) + RETRY_BUFFER_MS
      );
    };

    try {
      setDetail("");
      setPhase("checking");
      let current: RecoveryChainState;
      try {
        current = await loadRecoveryChainState(username);
      } catch {
        setPhase("check-failed");
        return;
      }
      if (!mounted.current) return;
      setState(current);

      // tx1: recover_account.
      if (!isOwnerReplaced(current.account, ownerPub)) {
        const recoveryWait = getHourlyLimitWaitUntil(
          current.account.last_account_recovery,
          current.headTime
        );
        if (recoveryWait) {
          setPhase("recovery-wait");
          schedule(recoveryWait, current.headTime);
          return;
        }
        if (!isWithinRecoveryWindow(proof.validUntil, current.headTime, WINDOW_MARGIN_MS)) {
          callbacks.current.onManual("key_not_recent");
          return;
        }
        setPhase("recovering");
        let sendError: unknown = null;
        try {
          await submitRecoverAccount({
            username,
            oldKey: proof.oldKey,
            newOwnerKey: keys.owner,
            newOwnerPublicKey: ownerPub,
            recentOwnerAuthority: proof.recentOwnerAuthority
          });
        } catch (e) {
          sendError = e;
        }
        let reread: RecoveryChainState | null = null;
        try {
          reread = await loadRecoveryChainState(username);
        } catch {
          // Handled below.
        }
        if (!mounted.current) return;
        // A send can report an error and still land (for example a slow node), so
        // trust the chain over the error.
        if (sendError && !(reread && isOwnerReplaced(reread.account, ownerPub))) {
          setDetail(sendError instanceof Error ? sendError.message : "");
          setPhase("recover-failed");
          return;
        }
        if (!reread) {
          setPhase("check-failed");
          return;
        }
        current = reread;
        setState(current);
      }

      // tx2: replace every key.
      if (!areAllKeysReplaced(current.account, keys.publicKeys)) {
        if (!confirmed.current) {
          setPhase("review");
          return;
        }
        const keysWait = getHourlyLimitWaitUntil(
          current.account.previous_owner_update,
          current.headTime
        );
        if (keysWait) {
          setPhase("keys-wait");
          schedule(keysWait, current.headTime);
          return;
        }
        setPhase("updating");
        try {
          await submitReplaceKeys({
            username,
            newKeys: keys,
            keepAccountAuths: keepRef.current ?? { active: [], posting: [] }
          });
        } catch (e) {
          let landed = false;
          try {
            const reread = await loadRecoveryChainState(username);
            landed = areAllKeysReplaced(reread.account, keys.publicKeys);
          } catch {
            landed = false;
          }
          if (!mounted.current) return;
          if (!landed) {
            setDetail(e instanceof Error ? e.message : "");
            setPhase("keys-failed");
            return;
          }
        }
      }

      setPhase("verifying");
      let verified = false;
      try {
        verified = await verifyRecoveredKeys(username, keys.publicKeys);
      } catch {
        verified = false;
      }
      if (!mounted.current) return;
      // Only move on once the chain shows the new keys. A retry runs this again,
      // which re-reads the chain and sends only what is still missing.
      if (verified) {
        callbacks.current.onKeysReplaced();
      } else {
        setPhase("verify-failed");
      }
    } finally {
      running.current = false;
    }
  }, [username, keys, ownerPub, proof]);

  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const keepRef = useRef(keep);
  keepRef.current = keep;

  useEffect(() => {
    mounted.current = true;
    advance();
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, [advance]);

  // Account access review: posting access (apps) stays by default unless it was
  // set in the 30 days before the takeover or later; active access must be opted in. Owner access is
  // never offered: tx2 always drops it.
  const account = state?.account;
  useEffect(() => {
    if (!account || keep) return;
    let active = true;
    const posting = account.posting.account_auths.map(([name]) => name);
    loadRecentPostingAuthAdds(username, proof.validUntil)
      .then((added) => {
        if (!active) return;
        setFlagged(added);
        setKeep({ active: [], posting: posting.filter((n) => !added.has(n)) });
      })
      .catch(() => {
        // Could not tell which ones are new: keep none unless the user opts in.
        if (!active) return;
        setFlagged(new Map(posting.map((n) => [n, null])));
        setKeep({ active: [], posting: [] });
      });
    return () => {
      active = false;
    };
  }, [account, keep, username, proof.validUntil]);

  // Added before the owner change: say when, since the user may not expect it.
  const flaggedHint = (addedAt: string | null | undefined) => {
    const time = addedAt ? parseChainTime(addedAt) : NaN;
    return !Number.isNaN(time) && time < parseChainTime(proof.validUntil)
      ? i18next.t("recover-account.finish.auths-flagged-before", {
          date: new Date(time).toLocaleString()
        })
      : i18next.t("recover-account.finish.auths-flagged");
  };

  const toggleKeep = (role: AccessRole, name: string, checked: boolean) =>
    setKeep((prev) =>
      prev
        ? { ...prev, [role]: checked ? [...prev[role], name] : prev[role].filter((n) => n !== name) }
        : prev
    );

  const accountAuths = account
    ? ACCESS_ROLES.flatMap((role) => account[role].account_auths.map(([name]) => ({ role, name })))
    : [];

  const busy = phase === "checking" || phase === "recovering" || phase === "updating" || phase === "verifying";
  const showReview = !!keep && accountAuths.length > 0 && !confirmed.current;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.finish.title")}</h2>
      <p className="text-sm opacity-75 mb-4">{i18next.t("recover-account.finish.hint")}</p>

      {busy && (
        <div className="flex items-center gap-2 text-sm mb-4">
          <Spinner className="size-4" />
          {i18next.t(
            phase === "recovering"
              ? "recover-account.finish.recovering"
              : phase === "updating"
                ? "recover-account.finish.updating-keys"
                : "recover-account.finish.checking"
          )}
        </div>
      )}

      {phase === "check-failed" && (
        <div className="text-sm text-red mb-4">
          {i18next.t("recover-account.errors.unavailable")}{" "}
          <button type="button" className="text-blue-dark-sky" onClick={advance}>
            {i18next.t("recover-account.retry")}
          </button>
        </div>
      )}

      {(phase === "recovery-wait" || phase === "keys-wait") && waitUntil && (
        <p className="text-sm mb-4">
          {i18next.t(`recover-account.finish.${phase}`, { time: waitUntil.toLocaleString() })}
        </p>
      )}

      {showReview && keep && (
        <fieldset className="mb-4" disabled={phase !== "review"}>
          <legend className="text-sm font-semibold">
            {i18next.t("recover-account.finish.auths-title")}
          </legend>
          <p className="text-sm opacity-60 mb-2">{i18next.t("recover-account.finish.auths-hint")}</p>
          {accountAuths.map(({ role, name }) => (
            <div key={`${role}:${name}`}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={keep[role].includes(name)}
                  onChange={(e) => toggleKeep(role, name, e.target.checked)}
                />
                <span>{i18next.t("recover-account.finish.auths-role", { role, name })}</span>
              </label>
              {role === "posting" && flagged.has(name) && (
                <p className="text-xs text-red ml-6">{flaggedHint(flagged.get(name))}</p>
              )}
            </div>
          ))}
        </fieldset>
      )}

      {phase === "review" && keep && (
        <Button
          className="w-full"
          onClick={() => {
            confirmed.current = true;
            advance();
          }}
        >
          {i18next.t("recover-account.finish.submit")}
        </Button>
      )}

      {(phase === "recover-failed" || phase === "keys-failed" || phase === "verify-failed") && (
        <div role="alert">
          <p className="text-sm text-red mb-1">{i18next.t(`recover-account.finish.${phase}`)}</p>
          {detail && <p className="text-xs opacity-60 mb-3 break-words">{detail}</p>}
          <Button onClick={advance}>{i18next.t("recover-account.finish.retry")}</Button>
        </div>
      )}
    </div>
  );
}
