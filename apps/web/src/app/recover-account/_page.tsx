"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { recoveryComplete, type Authority, type PrivateKey } from "@ecency/sdk";
import {
  deriveRecoveryKeys,
  type RecoveryKeySet
} from "@/features/account-recovery/recovery-keys";
import { generateMasterPassword } from "@/utils/master-password";
import { RecoverStartStep } from "./_components/recover-start-step";
import { RecoverPasswordStep } from "./_components/recover-password-step";
import { RecoverOldKeyStep } from "./_components/recover-old-key-step";
import { RecoverCodeStep } from "./_components/recover-code-step";
import { RecoverWaitingStep } from "./_components/recover-waiting-step";
import { RecoverFinishStep } from "./_components/recover-finish-step";
import { RecoverCleanupStep } from "./_components/recover-cleanup-step";
import { RecoverSuccessStep } from "./_components/recover-success-step";
import { RecoverManualHelp } from "./_components/recover-manual-help";

type Step =
  | "start"
  | "password"
  | "old-key"
  | "code"
  | "waiting"
  | "finish"
  | "cleanup"
  | "success"
  | "manual";

interface Session {
  username: string;
  requestId: string;
  nonce: string;
}

export interface RecoveryProof {
  oldKey: PrivateKey;
  recentOwnerAuthority: Authority;
  /** When the proven key stopped being the owner key (chain time). */
  validUntil: string;
}

/**
 * Self-serve account recovery. All key material (the new master password, the
 * keys derived from it and the proven old key) lives only in this component's
 * memory: it is never sent to a server and never written to storage, and it is
 * dropped when the flow ends or the page is left.
 */
export function RecoverAccountPage() {
  const [step, setStep] = useState<Step>("start");
  const [session, setSession] = useState<Session | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [manualCode, setManualCode] = useState("");

  const keysRef = useRef<RecoveryKeySet | null>(null);
  const proofRef = useRef<RecoveryProof | null>(null);

  const clearSecrets = useCallback(() => {
    keysRef.current = null;
    proofRef.current = null;
    setMasterPassword("");
  }, []);

  useEffect(
    () => () => {
      keysRef.current = null;
      proofRef.current = null;
    },
    []
  );

  const restart = useCallback(() => {
    clearSecrets();
    setSession(null);
    setEmails([]);
    setStep("start");
  }, [clearSecrets]);

  const showManual = useCallback(
    (code: string) => {
      clearSecrets();
      setManualCode(code);
      setStep("manual");
    },
    [clearSecrets]
  );

  const handleStarted = useCallback((next: Session) => {
    const password = generateMasterPassword();
    keysRef.current = deriveRecoveryKeys(next.username, password);
    setSession(next);
    setMasterPassword(password);
    setStep("password");
  }, []);

  const handleProven = useCallback((sentTo: string[], proof: RecoveryProof) => {
    proofRef.current = proof;
    setEmails(sentTo);
    setStep("code");
  }, []);

  // Keys are verified on chain: move on to the optional clean-up and record the
  // completion in the background. It is only an audit record, so errors are ignored.
  const handleKeysReplaced = useCallback(() => {
    proofRef.current = null;
    setStep("cleanup");
    if (session) {
      const requestId = session.requestId;
      Promise.resolve()
        .then(() => recoveryComplete(requestId))
        .catch(() => undefined);
    }
  }, [session]);

  const finish = useCallback(() => {
    clearSecrets();
    setStep("success");
  }, [clearSecrets]);

  const keys = keysRef.current;
  const proof = proofRef.current;

  return (
    <div className="max-w-[560px] mx-auto">
      <div className="reading-surface rounded-2xl p-6 md:p-8">
        <h1 className="text-2xl font-bold mb-2">{i18next.t("recover-account.title")}</h1>
        {step === "start" && (
          <p className="opacity-60 mb-6">{i18next.t("recover-account.intro")}</p>
        )}

        {step === "start" && (
          <RecoverStartStep onStarted={handleStarted} onManual={showManual} />
        )}

        {step === "password" && session && (
          <RecoverPasswordStep
            username={session.username}
            masterPassword={masterPassword}
            onContinue={() => setStep("old-key")}
          />
        )}

        {step === "old-key" && session && keys && (
          <RecoverOldKeyStep
            username={session.username}
            requestId={session.requestId}
            nonce={session.nonce}
            newOwnerPublicKey={keys.publicKeys.owner}
            onProven={handleProven}
            onManual={showManual}
            onRestart={restart}
          />
        )}

        {step === "code" && session && (
          <RecoverCodeStep
            requestId={session.requestId}
            emails={emails}
            onApproved={() => setStep("waiting")}
            onRestart={restart}
          />
        )}

        {step === "waiting" && session && (
          <RecoverWaitingStep
            requestId={session.requestId}
            onRequested={() => setStep("finish")}
            onManual={showManual}
            onRestart={restart}
          />
        )}

        {step === "finish" && session && keys && proof && (
          <RecoverFinishStep
            username={session.username}
            keys={keys}
            proof={proof}
            onKeysReplaced={handleKeysReplaced}
            onManual={showManual}
          />
        )}

        {step === "cleanup" && session && keys && (
          <RecoverCleanupStep
            username={session.username}
            activeKey={keys.active}
            onDone={finish}
          />
        )}

        {step === "success" && <RecoverSuccessStep />}

        {step === "manual" && <RecoverManualHelp code={manualCode} onRestart={restart} />}
      </div>
    </div>
  );
}
