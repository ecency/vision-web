"use client";

import { useRef, useState } from "react";
import i18next from "i18next";
import { recoveryStart } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Turnstile, TURNSTILE_SITEKEY, type TurnstileHandle } from "@/features/shared/turnstile";
import {
  MANUAL_HELP_ERRORS,
  recoveryErrorCode
} from "@/features/account-recovery/recovery-errors";
import { normalizeAccountName } from "@/utils/hive-account-name";
import { RecoverError } from "./recover-error";

interface Props {
  onStarted: (session: { username: string; requestId: string; nonce: string }) => void;
  onManual: (code: string) => void;
}

export function RecoverStartStep({ onStarted, onManual }: Props) {
  const [username, setUsername] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  const name = normalizeAccountName(username);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !captchaToken || busy) return;

    setBusy(true);
    setError("");
    try {
      const res = await recoveryStart(name, captchaToken);
      if (res.status === 200 && res.data.request_id && res.data.nonce) {
        onStarted({ username: name, requestId: res.data.request_id, nonce: res.data.nonce });
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
      // The captcha token is single use: drop it and ask for a fresh one.
      setCaptchaToken("");
      turnstileRef.current?.reset();
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <FormControl
        type="text"
        placeholder={i18next.t("recover-account.start.username-placeholder")}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        autoFocus={true}
        required={true}
      />
      <p className="text-sm opacity-60 mt-2 px-1">{i18next.t("recover-account.start.hint")}</p>
      <div className="my-4">
        <Turnstile
          ref={turnstileRef}
          sitekey={TURNSTILE_SITEKEY}
          action="recover"
          onVerify={setCaptchaToken}
          onExpire={() => setCaptchaToken("")}
        />
      </div>
      <RecoverError code={error} />
      <Button className="w-full" type="submit" disabled={busy || !captchaToken || !name} isLoading={busy}>
        {i18next.t("recover-account.start.submit")}
      </Button>
    </form>
  );
}
