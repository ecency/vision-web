import Cookies from "js-cookie";
import { AllFilter, ListStyle, Theme } from "@/enums";
import * as ls from "@/utils/local-storage";
import { success } from "@/features/shared/feedback";
import i18next from "i18next";
import { loadLocale } from "@/features/i18n";
import { getCurrencyRate } from "@ecency/sdk";
import { currencySymbol } from "@/utils/currency-symbol";
import { isInAppBrowser } from "@/utils/keychain";
import { runWithRetries } from "@/utils/run-with-retries";
import type { AppWindow } from "@/types/app-window";
import { getQueryClient } from "@/core/react-query";
import { applyThemeClass } from "@/utils/apply-theme-class";
import defaults, { ALLOWED_IMAGE_SERVERS } from "@/defaults";
import { setProxyBase } from "@ecency/render-helper";

export function createGlobalState() {
  const storedCurrency = ls.get("currency");
  const storedCurrencyRate = ls.get("currency_rate");
  const storedCurrencySymbol = ls.get("currency_symbol");
  const initialCurrency = typeof storedCurrency === "string" ? storedCurrency : "hbd";
  const initialCurrencyRate =
    typeof storedCurrencyRate === "number" && !Number.isNaN(storedCurrencyRate)
      ? storedCurrencyRate
      : 1;
  const initialCurrencySymbol =
    typeof storedCurrencySymbol === "string"
      ? storedCurrencySymbol
      : currencySymbol(initialCurrency);
  const storedImageProxy = ls.get("image_proxy");
  const initialImageProxy =
    storedImageProxy && ALLOWED_IMAGE_SERVERS.includes(storedImageProxy)
      ? storedImageProxy
      : defaults.imageServer;

  return {
    theme: (Cookies.get("theme") as Theme) || Theme.day,
    listStyle: ListStyle.row,
    intro: true,
    currency: initialCurrency,
    currencyRate: initialCurrencyRate,
    currencySymbol: initialCurrencySymbol,
    lang: ls.get("lang") || ls.get("current-language") || "en-US",
    searchIndexCount: 0,
    canUseWebp: true, // WebP supported by >95% of modern browsers - defaults to true for LCP optimization
    hasKeyChain: false,
    newVersion: null,
    globalNotifications: true,
    nsfw: false,
    imageProxy: initialImageProxy
  };
}

type State = ReturnType<typeof createGlobalState>;

export function createGlobalActions(set: (state: Partial<State>) => void, getState: () => State) {
  return {
    toggleTheme: (theme_key?: Theme) => {
      const { theme } = getState();
      let newTheme: any = theme === Theme.day ? Theme.night : Theme.day;

      if (!!theme_key) {
        newTheme = theme_key;
      }

      const use_system = ls.get("use_system_theme", false);
      if (use_system) {
        newTheme =
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? Theme.night
            : Theme.day;
      }

      ls.set("theme", newTheme);
      Cookies.set("theme", newTheme, { expires: 365 });

      set({
        theme: newTheme
      });
      // Apply from newTheme, not the previous `theme`. The old form worked for a
      // plain toggle but desynced whenever newTheme was not simply the opposite:
      // an explicit theme_key matching the current theme (settings re-selecting
      // the active option) or the use_system_theme path.
      applyThemeClass(newTheme);
    },
    setLang: async (lang: string) => {
      ls.set("lang", lang);
      ls.set("current-language", lang);
      await loadLocale(lang);
      await i18next.changeLanguage(lang);
      set({
        lang: lang ?? "en-US"
      });
    },
    setListStyle: (listStyle: ListStyle) => {
      set({
        listStyle
      });
    },
    async setCurrency(currency: string) {
      const rate = await getCurrencyRate(currency);
      const symbol = currencySymbol(currency);
      ls.set("currency", currency);
      ls.set("currency_rate", rate);
      ls.set("currency_symbol", symbol);
      set({
        currency,
        currencyRate: rate,
        currencySymbol: symbol
      });

      // Invalidate wallet-related queries so they refetch with new currency
      const queryClient = getQueryClient();
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length < 2) return false;

          // Invalidate portfolio, asset-info, and list queries
          return (
            (key[0] === "ecency-wallets" &&
             (key[1] === "portfolio" || key[1] === "asset-info" || key[1] === "list"))
          );
        },
      });

      success(i18next.t("preferences.updated"));
    },
    setNsfw(value: string) {
      set({
        nsfw: Boolean(Number(value))
      });
      success(i18next.t("preferences.updated"));
    },
    setImageProxy(server: string) {
      if (!ALLOWED_IMAGE_SERVERS.includes(server)) {
        return;
      }
      ls.set("image_proxy", server);
      setProxyBase(server);
      set({ imageProxy: server });
      success(i18next.t("preferences.updated"));
    },
    initKeychain() {
      // Extensions won't be ready immediately after script running
      // So We have to wait until full window load and then drop our task to macro-queue
      // It will help us to validate that all sync and async operations have finished
      // Including browser extensions (Keychain, Hive Keeper, Peak Vault)
      runWithRetries(() => {
        if (typeof window === "undefined") {
          return false;
        }

        if (isInAppBrowser()) {
          set({ hasKeyChain: true });
          return true;
        }

        const w = window as unknown as AppWindow;

        // Check for Peak Vault (promise-based, no handshake needed)
        if ((w as any).peakvault) {
          set({ hasKeyChain: true });
          return true;
        }

        // Prefer Hive Keeper (it owns window.hive and flags isKeeper on it),
        // then Keychain. window.hive_extension lives only in Keeper's
        // content-script world and is not visible here, so it can't be used.
        const hiveExtension = (w.hive?.isKeeper && w.hive) || w.hive_keychain;

        if (!hiveExtension) {
          return false;
        }

        if (typeof hiveExtension.requestHandshake === "function") {
          hiveExtension.requestHandshake(() => set({ hasKeyChain: true }));
        } else {
          set({ hasKeyChain: true });
        }

        return true;
      });
    }
  };
}
