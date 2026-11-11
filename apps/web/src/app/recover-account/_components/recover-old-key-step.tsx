"use client";

import { useState } from "react";
import i18next from "i18next";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys, recoveryProve, signRecoveryChallenge } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { loadRecoveryChainState } from "@/features/account-recovery/recovery-chain";
import { matchOldOwnerKey } from "@/features/account-recovery/recovery-key-match";
import {
  MANUAL_HELP_ERRORS,
  RESTART_ERRORS,
  recoveryErrorCode
} from "@/features/account-recovery/recovery-errors";
import type { RecoveryProof } from "../_page";
import { RecoverError, RecoverStartOver } from "./recover-error";

interface Props {
  username: string;
  requestId: string;
  nonce: string;
  newOwnerPublicKey: string;
  onProven: (emails: string[], proof: RecoveryProof) => void;
  onManual: (code: string) => void;
  onRestart: () => void;
}

/**
 * Old password or owner key input. Unlike the shared key input it needs no
 * logged-in user: the value is matched locally against the account's owner
 * history and only a signature and public key are sent.
 */
export function RecoverOldKeyStep({
  username,
  requestId,
  nonce,
  newOwnerPublicKey,
  onProven,
  onManual,
  onRestart
}: Props) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const chain = useQuery({
    queryKey: QueryKeys.accounts.recoveryChainState(username),
    queryFn: () => loadRecoveryChainState(username),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chain.data || busy) return;
    setMessage("");
    setError("");

    const match = matchOldOwnerKey(username, value, chain.data.ownerHistory, {
      lastRecoveryTime: chain.data.lastRecoveryTime,
      now: chain.data.headTime,
      currentOwnerKeys: chain.data.account.owner.key_auths.map(([key]) => String(key))
    });
    if (match.status === "not-sufficient") {
      onManual("key_not_sufficient");
      return;
    }
    if (match.status !== "match") {
      setMessage(`recover-account.old-key.${match.status}`);
      return;
    }

    setBusy(true);
    try {
      const res = await recoveryProve({
        requestId,
        username,
        newOwnerPub: newOwnerPublicKey,
        provenKeyPub: match.publicKey,
        signature: signRecoveryChallenge(match.key, username, newOwnerPublicKey, nonce)
      });
      if (res.status === 200) {
        setValue("");
        onProven(res.data.emails ?? [], {
          oldKey: match.key,
          recentOwnerAuthority: match.entry.previous_owner_authority,
          validUntil: match.entry.last_valid_time
        });
        return;
      }
      const code = recoveryErrorCode(res);
      if (MANUAL_HELP_ERRORS.has(code)) {
        onManual(code);
        return;
      }
      setError(code);
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.old-key.title")}</h2>
      <p className="text-sm opacity-75 mb-4">{i18next.t("recover-account.old-key.hint")}</p>
      <FormControl
        type="password"
        placeholder={i18next.t("recover-account.old-key.placeholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {chain.isLoading && (
        <p className="text-sm opacity-60 mt-2">{i18next.t("recover-account.old-key.loading")}</p>
      )}
      {chain.isError && (
        <div className="text-sm text-red mt-2">
          {i18next.t("recover-account.old-key.load-failed")}{" "}
          <button type="button" className="text-blue-dark-sky" onClick={() => chain.refetch()}>
            {i18next.t("recover-account.retry")}
          </button>
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-red mt-2 px-1">
          {i18next.t(message)}
        </p>
      )}
      <RecoverError code={error} />
      {RESTART_ERRORS.has(error) || error === "invalid_request" ? (
        <RecoverStartOver onRestart={onRestart} />
      ) : null}
      <Button
        className="w-full mt-4"
        type="submit"
        disabled={!chain.data || !value.trim() || busy}
        isLoading={busy}
      >
        {i18next.t("recover-account.old-key.submit")}
      </Button>
    </form>
  );
}
