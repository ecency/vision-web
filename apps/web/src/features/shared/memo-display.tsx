"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@ui/button";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getLoginType } from "@/utils/user-token";
import { error } from "@/features/shared";

interface Props {
  memo: string;
}

/**
 * Heuristic to detect if a `#`-prefixed memo is actually encrypted.
 *
 * Encrypted memos on Hive are `#` followed by a base58-encoded ciphertext
 * (typically 150+ chars). Validate the base58 alphabet directly rather than
 * using a length/whitespace proxy so long plain `#`-prefixed hashtags don't
 * get an offered (and guaranteed-to-fail) Decrypt button.
 */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
function isLikelyEncryptedMemo(memo: string): boolean {
  if (!memo.startsWith("#")) return false;
  const content = memo.slice(1);
  return content.length > 50 && BASE58_RE.test(content);
}

export function MemoDisplay({ memo }: Props) {
  const { activeUser } = useActiveAccount();
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Reset decrypted state when the memo prop changes so plaintext from a
  // previous memo doesn't leak into a new row's render.
  useEffect(() => {
    setDecryptedText(null);
    setIsDecrypting(false);
  }, [memo]);

  const encrypted = isLikelyEncryptedMemo(memo);

  const handleDecrypt = useCallback(async () => {
    if (!activeUser) return;

    setIsDecrypting(true);
    try {
      const loginType = getLoginType(activeUser.username);
      // Loaded on demand: it carries the AES code, which pages showing a memo
      // should not pay for until one is decrypted (#1434).
      const { decryptMemo } = await import("@/utils/memo-crypto");
      const result = await decryptMemo(loginType, activeUser.username, memo);
      setDecryptedText(result);
    } catch (e) {
      error(i18next.t("transfer.memo-decrypt-error"));
    } finally {
      setIsDecrypting(false);
    }
  }, [activeUser, memo]);

  if (decryptedText !== null) {
    return (
      <div className="text-sm text-gray-600 dark:text-gray-400 break-words">
        <span className="text-xs text-gray-500">🔓 </span>
        {decryptedText}
      </div>
    );
  }

  if (!encrypted) {
    // Plain text memo that happens to start with #
    return (
      <div className="text-sm text-gray-600 dark:text-gray-400 break-words">{memo}</div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <span>🔒 {i18next.t("transfer.memo-encrypted-label")}</span>
      {activeUser && (
        <Button
          size="xs"
          appearance="secondary"
          outline={true}
          disabled={isDecrypting}
          onClick={handleDecrypt}
        >
          {i18next.t("transfer.memo-decrypt")}
        </Button>
      )}
    </div>
  );
}
