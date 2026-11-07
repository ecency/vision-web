"use client";

import i18next from "i18next";
import { getLoginType } from "@/utils/user-token";
import { extensionSupportsAuthority, hasAnyHiveExtension } from "@/utils/hive-extensions";

/**
 * True when the account logged in with a browser extension but none is on the
 * page: disabled, blocked for the site, or not injected since an update. The
 * extension is installed, so the sign options should say to enable it rather
 * than offer install links. Owner authority is excluded: no extension can sign
 * it, so pointing at the extension would mislead.
 */
export function isExtensionUnavailable(
  username: string | undefined,
  authority: "posting" | "active" | "owner" = "active"
): boolean {
  if (!username || !extensionSupportsAuthority(authority)) return false;
  return getLoginType(username) === "keychain" && !hasAnyHiveExtension();
}

interface Props {
  username: string | undefined;
  authority?: "posting" | "active" | "owner";
}

export function ExtensionUnavailableNote({ username, authority = "active" }: Props) {
  if (!isExtensionUnavailable(username, authority)) return null;
  return (
    <p
      role="status"
      className="text-sm rounded-lg p-3 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200"
    >
      {i18next.t("key-or-hot.extension-unavailable", {
        defaultValue:
          "Your wallet extension seems unavailable. Enable it and reload the page, or use another sign option below."
      })}
    </p>
  );
}
