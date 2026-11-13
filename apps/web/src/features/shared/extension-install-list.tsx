"use client";

import Image from "next/image";
import i18next from "i18next";
import { useEffect, useState } from "react";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";

type BrowserFamily = "chrome" | "firefox";

interface InstallableExtension {
  alt: string;
  icon: string;
  nameKey: string;
  descKey: string;
  highlight: boolean;
  /**
   * Store URL per browser family. A family is omitted when there's no listing:
   * Peak Vault ships for Chromium only.
   */
  urls: Partial<Record<BrowserFamily, string>>;
}

/**
 * Supported Hive browser extensions with their store links. Shared by the login
 * dialog and the auth-upgrade (signing) dialog. Keeper is the recommended
 * (Ecency) option and is highlighted.
 */
const EXTENSIONS: InstallableExtension[] = [
  {
    alt: "Hive Keeper",
    icon: "/assets/keeper.svg",
    nameKey: "login.extension-keeper-name",
    descKey: "login.extension-keeper-desc",
    highlight: true,
    urls: {
      chrome:
        "https://chromewebstore.google.com/detail/hive-keeper/eehlplhgiofbbanbjiodipefljadfehe",
      firefox: "https://addons.mozilla.org/firefox/addon/hive-keeper/"
    }
  },
  {
    alt: "Keychain",
    icon: "/assets/keychain.png",
    nameKey: "login.extension-keychain-name",
    descKey: "login.extension-keychain-desc",
    highlight: false,
    urls: {
      chrome:
        "https://chromewebstore.google.com/detail/hive-keychain/jcacnejopjdphbnjgfaaobbfafkihpep",
      firefox: "https://addons.mozilla.org/en-US/firefox/addon/hive-keychain/"
    }
  },
  {
    alt: "Peak Vault",
    icon: "/assets/peakvault.svg",
    nameKey: "login.extension-peakvault-name",
    descKey: "login.extension-peakvault-desc",
    highlight: false,
    urls: {
      chrome: "https://chromewebstore.google.com/detail/peak-vault/mcocapccicdidkhhghnopbddglkpjcoi"
    }
  }
];

// UA-based mobile check — intentionally not the viewport-width heuristic from
// client.ts: a narrow desktop window can still install extensions, a phone can't.
const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

interface ResolvedExtension extends InstallableExtension {
  href: string;
}

/**
 * Install links for the current browser, or null when nothing should render:
 * during SSR / before mount, or on mobile (desktop extensions don't apply).
 */
function useInstallableExtensions(): ResolvedExtension[] | null {
  const [resolved, setResolved] = useState<ResolvedExtension[] | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent ?? "";
    if (MOBILE_UA.test(ua)) {
      setResolved(null);
      return;
    }
    const family: BrowserFamily = /firefox/i.test(ua) ? "firefox" : "chrome";
    const items = EXTENSIONS.flatMap((ext) => {
      const href = ext.urls[family];
      return href ? [{ ...ext, href }] : [];
    });
    setResolved(items.length ? items : null);
  }, []);

  return resolved;
}

/**
 * True once the install list has something to render (desktop browser with at
 * least one store link). Lets callers hide surrounding chrome — e.g. a heading —
 * on mobile or before mount.
 */
export function useShowExtensionInstall(): boolean {
  return useInstallableExtensions() !== null;
}

/**
 * Renders installable Hive browser extensions as store links, picking the right
 * store for the current browser (Chrome Web Store vs Firefox Add-ons). Renders
 * nothing on mobile.
 */
export function ExtensionInstallList() {
  const extensions = useInstallableExtensions();
  if (!extensions) return null;

  return (
    <div className="flex flex-col gap-3">
      {extensions.map((ext) => (
        <a
          key={ext.alt}
          href={ext.href}
          target="_blank"
          rel="noopener noreferrer"
          className={
            ext.highlight
              ? "flex items-center gap-3 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              : "flex items-center gap-3 p-3 rounded-lg border border-[--border-color] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          }
        >
          <Image width={32} height={32} src={ext.icon} alt={ext.alt} className="size-8" />
          <div className="flex-1">
            <div className="font-semibold text-sm">{i18next.t(ext.nameKey)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{i18next.t(ext.descKey)}</div>
          </div>
          <UilArrowRight
            className={ext.highlight ? "size-4 text-blue-500" : "size-4 opacity-50"}
          />
        </a>
      ))}
    </div>
  );
}
