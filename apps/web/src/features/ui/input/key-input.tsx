"use client";

import { UilLock } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import i18next from "i18next";
import { PrivateKey } from "@ecency/sdk";
import { isWif } from "@ecency/sdk";
import {
  forwardRef,
  HTMLProps,
  MouseEvent,
  useCallback,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { error } from "@/features/shared/feedback";
import clsx from "clsx";

interface Props {
  isLoading?: boolean;
  onSign?: (key: PrivateKey) => void;
  keyType?: "owner" | "active" | "posting" | "memo";
}

export interface KeyInputImperativeHandle {
  // Resolves to `null` (not a throw) when the user-supplied key is missing or
  // invalid: the relevant error toast is shown here, and callers should bail on
  // a `null` result. This avoids unhandled promise rejections from imperative
  // callers (e.g. async onClick handlers) and the Sentry noise they create.
  handleSign: (e?: MouseEvent) => Promise<{
    privateKey: PrivateKey;
    raw: string;
  } | null>;
}

function capitalizeFirstLetter(str: string | undefined) {
    if (typeof str !== 'string' || str.length === 0) return '';
    return str[0].toUpperCase() + str.slice(1);
}

export const KeyInput = forwardRef<
  KeyInputImperativeHandle,
  Props & Omit<HTMLProps<HTMLInputElement>, "ref" | "type">
>((
  { onSign, isLoading, keyType, className, ...inputProps },
  ref
) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const { activeUser } = useActiveAccount();
  const setSigningKey = useGlobalStore((state) => state.setSigningKey);

  const [key, setKey] = useState("");

  const handleSign = useCallback(
    async (e?: MouseEvent) => {
      e?.stopPropagation();

      if (!activeUser) {
        throw new Error("Cannot sign operation with anon user");
      }

      if (!key) {
        error(i18next.t("validation.required"));
        return null;
      }

      let privateKey: PrivateKey;

      try {
        if (isWif(key)) {
          privateKey = PrivateKey.fromString(key);
        } else {
          // Lazy-load Hive key derivation so @ecency/wallets (heavy crypto
          // deps) stays out of the eager bundle loaded on every feed/profile/
          // community page. Only reached when a non-WIF key is entered for
          // signing (key-input is rendered by always-mounted signing UI).
          const { deriveHiveKeys, detectHiveKeyDerivation } = await import("@ecency/wallets");
          const derivation = await detectHiveKeyDerivation(
            activeUser.username,
            key,
            // detectHiveKeyDerivation only classifies the input format
            // (bip44 seed vs master password) against an owner/active
            // authority. Posting and memo keys are derived from that same
            // input in the branches below, so classify against "active" here.
            keyType === "memo" || keyType === "posting" ? "active" : keyType
          );

          if (derivation === "bip44") {
            const keys = deriveHiveKeys(key);
            // Every authority is mapped explicitly. "posting" used to fall
            // through to keys.owner, so a posting-authority upgrade derived
            // and signed with the owner key. The trailing keys.owner now
            // covers only keyType "owner" and the callers that omit keyType
            // and authenticate against the owner authority.
            const derivedKey =
              keyType === "active" ? keys.active :
              keyType === "posting" ? keys.posting :
              keyType === "memo" ? keys.memo :
              keys.owner;
            privateKey = PrivateKey.fromString(derivedKey);
          } else if (derivation === "master-password") {
            privateKey = PrivateKey.fromLogin(
              activeUser.username,
              key,
              keyType === "memo" ? "memo" : keyType
            );
          } else if (keyType === "memo") {
            // For memo keys, try master password derivation as fallback
            // (detectHiveKeyDerivation may return "unknown" if memo key was changed)
            privateKey = PrivateKey.fromLogin(activeUser.username, key, "memo");
          } else {
            privateKey = PrivateKey.from(key);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error && err.message.includes("base58")
          ? i18next.t("key-or-hot.invalid-key")
          : i18next.t("key-or-hot.key-error");
        error(errorMessage);
        return null;
      }

      setSigningKey(key);

      onSign?.(privateKey);

      return { privateKey, raw: key };
    },
    [activeUser, key, keyType, onSign, setSigningKey]
  );

  useImperativeHandle(ref, () => ({
    handleSign
  }));

  return (
    <div
      className={clsx(
        "border-2 border-[--border-color] rounded-xl p-2 cursor-text flex flex-col items-start bg-white dark:bg-dark-default",
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 -mt-5 px-1 bg-white dark:bg-dark-default">
        {capitalizeFirstLetter(keyType)} {i18next.t("key-or-hot.key-placeholder")}
      </span>
      <div className="w-full grid gap-2 grid-cols-[max-content_1fr_max-content] items-center h-8">
        <UilLock className="size-5 text-gray-500 dark:text-gray-400" />

        <input
          ref={inputRef}
          className="outline-none bg-transparent text-gray-900 dark:text-gray-100"
          {...inputProps}
          value={key}
          type="password"
          onChange={(e) => setKey(e.target.value)}
        />
        {onSign && (
          <Button size="sm" disabled={isLoading} onClick={handleSign}>
            {i18next.t("key-or-hot.sign")}
          </Button>
        )}
      </div>
    </div>
  );
});

KeyInput.displayName = "KeyInput";
