let cachedFetch: typeof globalThis.fetch | undefined;

export function getBoundFetch() {
  if (!cachedFetch) {
    if (typeof globalThis.fetch !== "function") {
      throw new Error("[Ecency][Wallets] - global fetch is not available");
    }

    cachedFetch = globalThis.fetch.bind(globalThis);
  }

  return cachedFetch;
}
