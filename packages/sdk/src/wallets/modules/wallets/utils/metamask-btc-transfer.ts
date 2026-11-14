const BTC_EXPLORER_URL = "https://mempool.space/tx/";
const SATS_PER_BTC = 100_000_000n;
const BTC_DECIMALS = 8;
const AMOUNT_REGEX = /^\d+(\.\d+)?$/;

/**
 * Mainnet address shapes: bech32/bech32m (bc1..., all lower or all upper case),
 * P2PKH (1...) and P2SH (3...) in case-sensitive base58.
 */
const BECH32_LOWER_REGEX = /^bc1[02-9ac-hj-np-z]{11,87}$/;
const BECH32_UPPER_REGEX = /^BC1[02-9AC-HJ-NP-Z]{11,87}$/;
const BASE58_REGEX = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;

export function isBtcMainnetAddress(address: string): boolean {
  const trimmed = address.trim();
  return (
    BECH32_LOWER_REGEX.test(trimmed) ||
    BECH32_UPPER_REGEX.test(trimmed) ||
    BASE58_REGEX.test(trimmed)
  );
}

/** bech32 is case-insensitive; base58 is not. */
function normalizeBtcAddress(address: string): string {
  const trimmed = address.trim();
  return /^bc1/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

export function getBtcExplorerUrl(txid: string) {
  return `${BTC_EXPLORER_URL}${txid}`;
}

export function parseToSats(amount: string): bigint {
  const trimmed = amount.trim();
  if (!AMOUNT_REGEX.test(trimmed)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > BTC_DECIMALS && /[1-9]/.test(fraction.slice(BTC_DECIMALS))) {
    throw new Error(`Amount has more than 8 decimal places: "${amount}"`);
  }

  const paddedFraction = fraction.padEnd(BTC_DECIMALS, "0").slice(0, BTC_DECIMALS);
  return BigInt(whole) * SATS_PER_BTC + BigInt(paddedFraction);
}

export function formatSats(sats: bigint, decimals = BTC_DECIMALS): string {
  const whole = sats / SATS_PER_BTC;
  const rem = sats % SATS_PER_BTC;
  if (rem === 0n) return whole.toString();

  const scale = 10n ** BigInt(decimals);
  const fractional = (rem * scale) / SATS_PER_BTC;
  const fracStr = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

interface SatsConnectResponse<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

interface SatsConnectProvider {
  request<T = unknown>(method: string, params?: unknown): Promise<SatsConnectResponse<T>>;
}

async function getMetaMaskSatsConnectProvider(): Promise<SatsConnectProvider> {
  const { getWallets } = await import("@wallet-standard/app");
  const wallet = getWallets()
    .get()
    .find(
      (w: any) =>
        w.name?.toLowerCase().includes("metamask") &&
        (w.features as Record<string, any>)["sats-connect:"]?.provider
    );

  if (!wallet) {
    throw new Error("MetaMask Bitcoin wallet not found. Enable Bitcoin in MetaMask and try again.");
  }

  return (wallet.features as Record<string, any>)["sats-connect:"].provider as SatsConnectProvider;
}

function unwrap<T>(response: SatsConnectResponse<T> | undefined, method: string): T {
  if (!response) throw new Error(`MetaMask Bitcoin ${method} returned no response`);
  if (response.error) {
    throw new Error(response.error.message || `MetaMask Bitcoin ${method} failed`);
  }
  return response.result as T;
}

/**
 * Send BTC from the user's MetaMask Bitcoin account.
 * MetaMask selects UTXOs and the fee rate in its own confirmation screen.
 *
 * @param expectedFrom the linked BTC address; the send is blocked with
 *   ACCOUNT_MISMATCH when the connected MetaMask account differs (funds safety).
 */
export async function sendBtcTransfer(
  to: string,
  amountBtc: string,
  expectedFrom?: string
): Promise<string> {
  const sats = parseToSats(amountBtc);
  if (sats <= 0n) {
    throw new Error("Amount must be greater than zero");
  }

  const provider = await getMetaMaskSatsConnectProvider();

  const accountsResponse = await provider.request<{
    addresses: Array<{ address: string; purpose?: string }>;
  }>("getAddresses", { purposes: ["payment"] });
  // An error here means the user closed the prompt without picking a Bitcoin account.
  const from = accountsResponse?.error
    ? undefined
    : accountsResponse?.result?.addresses?.find((a) => !a.purpose || a.purpose === "payment")?.address;
  if (!from) {
    throw new Error("No Bitcoin account connected in MetaMask");
  }

  if (expectedFrom && normalizeBtcAddress(from) !== normalizeBtcAddress(expectedFrom)) {
    throw new Error("ACCOUNT_MISMATCH");
  }

  const { txid } = unwrap<{ txid: string }>(
    await provider.request("sendTransfer", {
      recipients: [{ address: to.trim(), amount: Number(sats) }]
    }),
    "sendTransfer"
  );

  if (!txid) throw new Error("MetaMask Bitcoin sendTransfer returned no transaction id");
  return txid;
}
