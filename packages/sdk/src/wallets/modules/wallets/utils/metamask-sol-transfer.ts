import { ConfigManager } from "../../../../index";

const SOL_EXPLORER_URL = "https://explorer.solana.com/tx/";
const LAMPORTS_PER_SOL = 1_000_000_000n;
const AMOUNT_REGEX = /^\d+(\.\d+)?$/;

export function getSolExplorerUrl(signature: string) {
  return `${SOL_EXPLORER_URL}${signature}`;
}

export function parseToLamports(amount: string): bigint {
  const trimmed = amount.trim();
  if (!AMOUNT_REGEX.test(trimmed)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  if (fraction.length > 9 && fraction.slice(9).replace(/0/g, "").length > 0) {
    throw new Error(`Amount has more than 9 decimal places: "${amount}"`);
  }

  const paddedFraction = fraction.padEnd(9, "0").slice(0, 9);
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(paddedFraction);
}

export function formatLamports(lamports: bigint, decimals = 6): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const rem = lamports % LAMPORTS_PER_SOL;
  if (rem === 0n) return whole.toString();

  const scale = 10n ** BigInt(decimals);
  const fractional = (rem * scale) / LAMPORTS_PER_SOL;
  const fracStr = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: { code?: number; message?: string };
}

/**
 * Call a Solana JSON-RPC method via the Ecency private API proxy.
 * This avoids hitting the public Solana RPC directly from the browser
 * (which returns 403). The proxy forwards to a public Solana RPC node.
 */
async function solRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const baseUrl = ConfigManager.getValidatedBaseUrl();
  const response = await fetch(`${baseUrl}/private-api/rpc/sol`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SOL RPC ${method} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`);
  }

  const json: JsonRpcResponse<T> = await response.json();
  if (json.error) {
    throw new Error(json.error.message || `SOL RPC ${method} failed`);
  }
  return json.result as T;
}

async function getMetaMaskSolanaWallet(): Promise<any> {
  const { getWallets } = await import("@wallet-standard/app");
  const walletsApi = getWallets();
  const wallets = walletsApi.get();

  // Only select a MetaMask wallet that supports Solana signing
  const mmWallet = wallets.find(
    (w: any) =>
      w.name.toLowerCase().includes("metamask") &&
      w.features["standard:connect"] &&
      w.features["solana:signAndSendTransaction"]
  );

  if (!mmWallet) {
    throw new Error("MetaMask Solana wallet not found. Enable Solana in MetaMask settings.");
  }

  return mmWallet;
}

export async function sendSolTransfer(
  to: string,
  amountSol: string
): Promise<string> {
  const mmWallet = await getMetaMaskSolanaWallet();

  // Connect to get accounts
  const connectFeature = mmWallet.features["standard:connect"] as any;
  await connectFeature.connect();

  const solAccount = mmWallet.accounts?.find(
    (acc: any) => acc.chains?.some((c: string) => c.startsWith("solana:"))
  );

  if (!solAccount) {
    throw new Error("No Solana account found in MetaMask.");
  }

  // Use @solana/web3.js for transaction building (dynamic import to avoid bundle bloat)
  const { PublicKey, SystemProgram, Transaction } = await import("@solana/web3.js");

  const fromPubkey = new PublicKey(solAccount.address);
  const toPubkey = new PublicKey(to);
  const lamports = parseToLamports(amountSol);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports
    })
  );

  // Fetch blockhash via Ecency RPC proxy (avoids 403 from public Solana RPC)
  const blockhashResult = await solRpc<{ value: { blockhash: string } }>(
    "getLatestBlockhash",
    [{ commitment: "finalized" }]
  );
  transaction.recentBlockhash = blockhashResult.value.blockhash;
  transaction.feePayer = fromPubkey;

  // Serialize the transaction for signing via Wallet Standard
  const serializedTx = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  });

  const signAndSendFeature = mmWallet.features["solana:signAndSendTransaction"] as any;
  if (!signAndSendFeature) {
    throw new Error("MetaMask does not support Solana transaction signing. Please update MetaMask.");
  }

  const [result] = await signAndSendFeature.signAndSendTransaction({
    account: solAccount,
    transaction: serializedTx,
    chain: "solana:mainnet"
  });

  // Result contains the signature — either a string or Uint8Array
  if (typeof result.signature === "string") {
    return result.signature;
  }

  // Encode Uint8Array to base58 (standard Solana signature format)
  const { base58 } = await import("@scure/base");
  return base58.encode(new Uint8Array(result.signature));
}
