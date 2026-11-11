"use client";

import { useState } from "react";
import i18next from "i18next";
import { recoveryVerifyCode } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { RESTART_ERRORS, recoveryErrorCode } from "@/features/account-recovery/recovery-errors";
import { RecoverError, RecoverStartOver } from "./recover-error";

interface Props {
  requestId: string;
  emails: string[];
  onApproved: () => void;
  onRestart: () => void;
}

export function RecoverCodeStep({ requestId, emails, onApproved, onRestart }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  const locked = RESTART_ERRORS.has(error) || attemptsLeft === 0;
  const valid = /^\d{6}$/.test(code);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy || locked) return;
    setBusy(true);
    setError("");
    try {
      const res = await recoveryVerifyCode(requestId, code);
      if (res.status === 200) {
        onApproved();
        return;
      }
      setError(recoveryErrorCode(res));
      setAttemptsLeft(typeof res.data.attempts_left === "number" ? res.data.attempts_left : null);
      setCode("");
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.code.title")}</h2>
      <p className="text-sm opacity-75">{i18next.t("recover-account.code.sent-to")}</p>
      <ul className="text-sm font-semibold my-2">
        {emails.map((email) => (
          <li key={email}>{email}</li>
        ))}
      </ul>
      <p className="text-sm opacity-60 mb-4">{i18next.t("recover-account.code.hint")}</p>

      <RecoverError code={error} />
      {attemptsLeft !== null && !locked && (
        <p className="text-sm opacity-75 mb-2 px-1">
          {i18next.t("recover-account.code.attempts-left", { count: attemptsLeft })}
        </p>
      )}

      {locked ? (
        <RecoverStartOver onRestart={onRestart} />
      ) : (
        <form onSubmit={submit}>
          <FormControl
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={i18next.t("recover-account.code.placeholder")}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus={true}
          />
          <Button className="w-full mt-4" type="submit" disabled={!valid || busy} isLoading={busy}>
            {i18next.t("recover-account.code.submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
