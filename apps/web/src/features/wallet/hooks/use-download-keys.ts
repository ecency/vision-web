import { useCallback, useMemo } from "react";
import { deriveHiveMasterPasswordKeys } from "@ecency/sdk/wallets";
import { v4 } from "uuid";

export function useDownloadKeys(masterPassword: string | undefined, username: string) {
  const accountKeys = useMemo(
    () =>
      masterPassword && username
        ? deriveHiveMasterPasswordKeys(username, masterPassword)
        : undefined,
    [masterPassword, username]
  );

  return useCallback(() => {
    if (!masterPassword || !accountKeys) {
      return;
    }

    const content = [
      `Master Password: ${masterPassword}`,
      ``,
      `username: ${username}`,
      `owner (private): ${accountKeys.owner}`,
      `active (private): ${accountKeys.active}`,
      `posting (private): ${accountKeys.posting}`,
      `memo (private): ${accountKeys.memo}`,
      `owner (public): ${accountKeys.ownerPubkey}`,
      `active (public): ${accountKeys.activePubkey}`,
      `posting (public): ${accountKeys.postingPubkey}`,
      `memo (public): ${accountKeys.memoPubkey}`
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const element = document.createElement("a");
    element.setAttribute("href", url);
    element.setAttribute("download", `ecency-${username}-keys-${v4().split("-")[2]}.txt`);

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    element.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [masterPassword, username, accountKeys]);
}
