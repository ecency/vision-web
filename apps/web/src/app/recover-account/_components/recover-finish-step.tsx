"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { Button } from "@ui/button";
import { Spinner } from "@ui/spinner";
import {
  RECOVERY_ROLES,
  loadRecoveryChainState,
  submitRecoverAccount,
  submitReplaceKeys,
  type RecoveryChainState,
  type RecoveryRole
} from "@/features/account-recovery/recovery-chain";
import { getOwnerChangeWaitUntil } from "@/features/account-recovery/recovery-eligibility";
import type { RecoveryKeySet } from "@/features/account-recovery/recovery-keys";
import type { RecoveryProof } from "../_page";

type Phase =
  | "checking"
  | "check-failed"
  | "wait"
  | "ready"
  | "recovering"
  | "recover-failed"
  | "updating"
  | "keys-failed";

interface Props {
  username: string;
  keys: RecoveryKeySet;
  proof: RecoveryProof;
  onDone: () => void;
}

type Keep = Record<RecoveryRole, string[]>;

/**
 * Posting access (apps) stays by default. Owner and active access can move funds
 * or keys, so the user has to opt in to keep those.
 */
function defaultKeep(state: RecoveryChainState): Keep {
  return {
    owner: [],
    active: [],
    posting: state.account.posting.account_auths.map(([name]) => name)
  };
}

export function RecoverFinishStep({ username, keys, proof, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [state, setState] = useState<RecoveryChainState | null>(null);
  const [waitUntil, setWaitUntil] = useState<Date | null>(null);
  const [keep, setKeep] = useState<Keep>({ owner: [], active: [], posting: [] });
  const [detail, setDetail] = useState("");
  const recovered = useRef(false);

  const check = useCallback(async () => {
    setPhase("checking");
    try {
      const next = await loadRecoveryChainState(username);
      setState(next);
      setKeep(defaultKeep(next));
      const ownerKeys = next.account.owner.key_auths.map(([k]) => String(k));
      if (ownerKeys.length === 1 && ownerKeys[0] === keys.publicKeys.owner) {
        // The recovery already went through, only the key update is left.
        recovered.current = true;
        setPhase("ready");
        return;
      }
      const wait = getOwnerChangeWaitUntil({
        lastOwnerUpdate: next.account.last_owner_update,
        ownerHistory: next.ownerHistory,
        now: Date.now()
      });
      setWaitUntil(wait);
      setPhase(wait ? "wait" : "ready");
    } catch {
      setPhase("check-failed");
    }
  }, [username, keys.publicKeys.owner]);

  useEffect(() => {
    check();
  }, [check]);

  const run = async () => {
    if (!state) return;
    setDetail("");

    if (!recovered.current) {
      setPhase("recovering");
      try {
        await submitRecoverAccount({
          username,
          oldKey: proof.oldKey,
          newOwnerKey: keys.owner,
          newOwnerPublicKey: keys.publicKeys.owner,
          recentOwnerAuthority: proof.recentOwnerAuthority
        });
        recovered.current = true;
      } catch (e) {
        setDetail(e instanceof Error ? e.message : "");
        setPhase("recover-failed");
        return;
      }
    }

    setPhase("updating");
    try {
      await submitReplaceKeys({
        username,
        newKeys: keys,
        keepAccountAuths: keep,
        changeRecoveryAccount: state.hasPendingRecoveryChange
      });
      onDone();
    } catch (e) {
      setDetail(e instanceof Error ? e.message : "");
      setPhase("keys-failed");
    }
  };

  const toggleKeep = (role: RecoveryRole, name: string, checked: boolean) =>
    setKeep((prev) => ({
      ...prev,
      [role]: checked ? [...prev[role], name] : prev[role].filter((n) => n !== name)
    }));

  const accountAuths = state
    ? RECOVERY_ROLES.flatMap((role) =>
        state.account[role].account_auths.map(([name]) => ({ role, name }))
      )
    : [];

  const busy = phase === "recovering" || phase === "updating";

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.finish.title")}</h2>
      <p className="text-sm opacity-75 mb-4">{i18next.t("recover-account.finish.hint")}</p>

      {phase === "checking" && (
        <p className="text-sm opacity-60">{i18next.t("recover-account.finish.checking")}</p>
      )}

      {phase === "check-failed" && (
        <div className="text-sm text-red">
          {i18next.t("recover-account.errors.unavailable")}{" "}
          <button type="button" className="text-blue-dark-sky" onClick={check}>
            {i18next.t("recover-account.retry")}
          </button>
        </div>
      )}

      {phase === "wait" && waitUntil && (
        <div>
          <p className="text-sm mb-4">
            {i18next.t("recover-account.finish.wait", { time: waitUntil.toLocaleString() })}
          </p>
          <Button appearance="secondary" onClick={check}>
            {i18next.t("recover-account.finish.check-again")}
          </Button>
        </div>
      )}

      {(phase === "ready" || busy || phase === "recover-failed" || phase === "keys-failed") &&
        accountAuths.length > 0 && (
          <fieldset className="mb-4" disabled={busy}>
            <legend className="text-sm font-semibold">
              {i18next.t("recover-account.finish.auths-title")}
            </legend>
            <p className="text-sm opacity-60 mb-2">{i18next.t("recover-account.finish.auths-hint")}</p>
            {accountAuths.map(({ role, name }) => (
              <label key={`${role}:${name}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={keep[role].includes(name)}
                  onChange={(e) => toggleKeep(role, name, e.target.checked)}
                />
                <span>{i18next.t("recover-account.finish.auths-role", { role, name })}</span>
              </label>
            ))}
          </fieldset>
        )}

      {phase === "ready" && (
        <Button className="w-full" onClick={run}>
          {i18next.t("recover-account.finish.submit")}
        </Button>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm">
          <Spinner className="size-4" />
          {i18next.t(
            phase === "recovering"
              ? "recover-account.finish.recovering"
              : "recover-account.finish.updating-keys"
          )}
        </div>
      )}

      {(phase === "recover-failed" || phase === "keys-failed") && (
        <div role="alert">
          <p className="text-sm text-red mb-1">
            {i18next.t(
              phase === "recover-failed"
                ? "recover-account.finish.recover-failed"
                : "recover-account.finish.keys-failed"
            )}
          </p>
          {detail && <p className="text-xs opacity-60 mb-3 break-words">{detail}</p>}
          <Button onClick={run}>{i18next.t("recover-account.finish.retry")}</Button>
        </div>
      )}
    </div>
  );
}
