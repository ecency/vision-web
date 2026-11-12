import { ConfigManager } from "../../../../index";
import { EcencyWalletCurrency } from "../enums";
import { queryOptions } from "@tanstack/react-query";
import { LRUCache } from "lru-cache";

const options = {
  max: 500,
  // how long to live in ms
  ttl: 1000 * 60 * 5,
  // return stale items before removing from cache?
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
};

const cache = new LRUCache(options);
const undefinedValue = Symbol("undefined");

const cacheSet = (key: string, value: any) =>
  cache.set(key, value === undefined ? undefinedValue : value);

const cacheGet = (key: string) => {
  const v = cache.get(key);
  return v === undefinedValue ? undefined : v;
};

interface MarketDataQuote {
  last_updated: string;
  percent_change: number;
  price: number;
}

interface MarketDataLatestResponse {
  [token: string]: {
    quotes?: {
      usd?: MarketDataQuote;
      btc?: MarketDataQuote;
      [fiat: string]: MarketDataQuote | undefined;
    };
  };
}

const CURRENCY_TO_TOKEN_MAP: Record<string, string> = {
  [EcencyWalletCurrency.BTC]: "btc",
  [EcencyWalletCurrency.ETH]: "eth",
  [EcencyWalletCurrency.SOL]: "sol",
  [EcencyWalletCurrency.BNB]: "bnb",
  HBD: "hbd",
  HIVE: "hive",
};

const MARKET_DATA_CACHE_KEY = "market-data/latest";

const normalizeCurrencyToToken = (currency: string) => {
  const upperCased = currency.toUpperCase();
  return CURRENCY_TO_TOKEN_MAP[upperCased] ?? currency.toLowerCase();
};

export function getTokenPriceQueryOptions(currency?: string) {
  return queryOptions({
    queryKey: ["ecency-wallets", "market-data", currency],
    queryFn: async () => {
      if (!currency) {
        throw new Error(
          "[SDK][Wallets][MarketData] – currency wasn`t provided"
        );
      }

      const token = normalizeCurrencyToToken(currency);
      const baseUrl = ConfigManager.getValidatedBaseUrl();

      let marketData = cacheGet(MARKET_DATA_CACHE_KEY) as
        | MarketDataLatestResponse
        | undefined;

      if (!marketData) {
        const httpResponse = await fetch(
          `${baseUrl}/private-api/market-data/latest`,
          {
            method: "GET",
          }
        );

        if (!httpResponse.ok) {
          throw new Error(
            `[SDK][Wallets][MarketData] – failed to fetch latest market data (${httpResponse.status})`
          );
        }

        const data = (await httpResponse.json()) as MarketDataLatestResponse;
        cacheSet(MARKET_DATA_CACHE_KEY, data);
        marketData = data;
      }

      const tokenData = marketData[token];

      if (!tokenData) {
        throw new Error(
          `[SDK][Wallets][MarketData] – missing market data for token: ${token}`
        );
      }

      const usdQuote = tokenData.quotes?.usd;

      if (!usdQuote) {
        throw new Error(
          `[SDK][Wallets][MarketData] – missing USD quote for token: ${token}`
        );
      }

      return Number(usdQuote.price);
    },
    enabled: !!currency,
  });
}
