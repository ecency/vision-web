import { bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";

const BTC_EXPLORER_URL = "https://mempool.space/tx/";
const SATS_PER_BTC = 100_000_000n;
const BTC_DECIMALS = 8;
const AMOUNT_REGEX = /^\d+(\.\d+)?$/;

const BASE58_VERSION_P2PKH = 0x00;
const BASE58_VERSION_P2SH = 0x05;
const base58check = createBase58check(sha256);

function isValidSegwitAddress(address: string): boolean {
  // bech32 strings must not mix case (BIP-173)
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return false;
  const lower = address.toLowerCase();
  if (!lower.startsWith("bc1")) return false;

  for (const codec of [bech32, bech32m]) {
    let decoded: { prefix: string; words: number[] };
    try {
      decoded = codec.decode(lower as `${string}1${string}`, 90);
    } catch {
      continue;
    }
    if (decoded.prefix !== "bc" || decoded.words.length < 1) return false;

    const version = decoded.words[0];
    // BIP-350: v0 uses bech32, v1-v16 use bech32m
    if (version > 16) return false;
    if ((version === 0) !== (codec === bech32)) return false;

    let program: Uint8Array;
    try {
      program = codec.fromWords(decoded.words.slice(1));
    } catch {
      return false;
    }
    if (program.length < 2 || program.length > 40) return false;
    if (version === 0 && program.length !== 20 && program.length !== 32) return false;
    return true;
  }
  return false;
}

function isValidBase58Address(address: string): boolean {
  let payload: Uint8Array;
  try {
    payload = base58check.decode(address);
  } catch {
    return false;
  }
  return (
    payload.length === 21 &&
    (payload[0] === BASE58_VERSION_P2PKH || payload[0] === BASE58_VERSION_P2SH)
  );
}

/**
 * True for a Bitcoin mainnet address with a valid checksum: bech32 (segwit v0),
 * bech32m (taproot and later witness versions), or Base58Check P2PKH / P2SH.
 */
export function isBtcMainnetAddress(address: string): boolean {
  const trimmed = address.trim();
  return isValidSegwitAddress(trimmed) || isValidBase58Address(trimmed);
}

/** bech32 is case-insensitive and stored lowercase; base58 is case-sensitive. */
export function normalizeBtcAddress(address: string): string {
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

interface SatsConnectError {
  code?: number;
  message?: string;
}

interface SatsConnectResponse<T> {
  result?: T;
  error?: SatsConnectError;
}

interface SatsConnectProvider {
  request<T = unknown>(method: string, params?: unknown): Promise<SatsConnectResponse<T>>;
}

interface SatsConnectWallet {
  name: string;
  features: { "sats-connect:"?: { provider?: SatsConnectProvider } };
}

/** sats-connect error codes (RpcErrorCode) that MetaMask's Bitcoin wallet returns. */
const SATS_USER_REJECTION = -32000;
const SATS_ACCESS_DENIED = -32002;
/** EIP-1193 user rejection; the transfer dialog treats it as a cancel. */
const USER_REJECTED_REQUEST = 4001;

function isSatsConnectWallet(wallet: unknown): wallet is SatsConnectWallet {
  if (!wallet || typeof wallet !== "object") return false;
  const { name, features } = wallet as { name?: unknown; features?: unknown };
  if (typeof name !== "string" || !features || typeof features !== "object") return false;
  const feature = (features as Record<string, unknown>)["sats-connect:"];
  return (
    !!feature &&
    typeof feature === "object" &&
    typeof (feature as { provider?: { request?: unknown } }).provider?.request === "function"
  );
}

async function getMetaMaskSatsConnectProvider(): Promise<SatsConnectProvider> {
  const { getWallets } = await import("@wallet-standard/app");
  const wallet = (getWallets().get() as readonly unknown[])
    .filter(isSatsConnectWallet)
    .find((w) => w.name.toLowerCase().includes("metamask"));

  const provider = wallet?.features["sats-connect:"]?.provider;
  if (!provider) {
    throw new Error("MetaMask Bitcoin wallet not found. Enable Bitcoin in MetaMask and try again.");
  }
  return provider;
}

function toError(error: SatsConnectError, fallback: string): Error & { code?: number } {
  const code = error.code === SATS_USER_REJECTION ? USER_REJECTED_REQUEST : error.code;
  return Object.assign(new Error(error.message || fallback), { code });
}

function unwrap<T>(response: SatsConnectResponse<T> | undefined, method: string): T {
  if (!response) throw new Error(`MetaMask Bitcoin ${method} returned no response`);
  if (response.error) {
    throw toError(response.error, `MetaMask Bitcoin ${method} failed`);
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

  const recipient = normalizeBtcAddress(to);
  if (!isBtcMainnetAddress(recipient)) {
    throw new Error("Invalid Bitcoin address");
  }

  const provider = await getMetaMaskSatsConnectProvider();

  const accountsResponse = await provider.request<{
    addresses: Array<{ address: string; purpose?: string }>;
  }>("getAddresses", { purposes: ["payment"] });
  // ACCESS_DENIED means the prompt was closed without picking a Bitcoin account;
  // that falls through to the "no account" error below. Anything else is surfaced.
  if (accountsResponse?.error && accountsResponse.error.code !== SATS_ACCESS_DENIED) {
    throw toError(accountsResponse.error, "MetaMask Bitcoin getAddresses failed");
  }
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
      recipients: [{ address: recipient, amount: Number(sats) }]
    }),
    "sendTransfer"
  );

  if (!txid) throw new Error("MetaMask Bitcoin sendTransfer returned no transaction id");
  return txid;
}
