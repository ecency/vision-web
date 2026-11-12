import { EcencyWalletCurrency } from "../enums";

interface RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

interface EthereumProvider {
  isMetaMask?: boolean;
  request<T = unknown>(args: RequestArguments): Promise<T>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function getEthereum(): EthereumProvider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found");
  }
  return window.ethereum;
}

const WEI_PER_ETH = 1000000000000000000n;

const EVM_CHAIN_CONFIG: Record<string, { chainId: string; name: string; rpcUrl: string; explorerUrl: string }> = {
  [EcencyWalletCurrency.ETH]: {
    chainId: "0x1",
    name: "Ethereum Mainnet",
    rpcUrl: "https://rpc.ankr.com/eth",
    explorerUrl: "https://etherscan.io/tx/"
  },
  [EcencyWalletCurrency.BNB]: {
    chainId: "0x38",
    name: "BNB Smart Chain",
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com/tx/"
  }
};

export function getEvmChainConfig(currency: EcencyWalletCurrency) {
  const config = EVM_CHAIN_CONFIG[currency];
  if (!config) throw new Error(`Unsupported EVM currency: ${currency}`);
  return config;
}

export function getEvmExplorerUrl(currency: EcencyWalletCurrency, txHash: string) {
  return `${getEvmChainConfig(currency).explorerUrl}${txHash}`;
}

export async function ensureEvmChain(currency: EcencyWalletCurrency): Promise<void> {
  const ethereum = getEthereum();

  const { chainId, name, rpcUrl } = getEvmChainConfig(currency);
  const currentChainId = await ethereum.request<string>({ method: "eth_chainId" });

  if (currentChainId === chainId) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    });
  } catch (err: unknown) {
    // Chain not added — add it
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: name,
          rpcUrls: [rpcUrl],
          nativeCurrency: {
            name: currency === EcencyWalletCurrency.ETH ? "Ether" : "BNB",
            symbol: currency === EcencyWalletCurrency.ETH ? "ETH" : "BNB",
            decimals: 18
          }
        }]
      });
    } else {
      throw err;
    }
  }
}

export async function estimateEvmGas(
  from: string,
  to: string,
  valueHex: string,
  currency: EcencyWalletCurrency
): Promise<{ gasLimit: string; gasPrice: string; estimatedFeeWei: bigint }> {
  const ethereum = getEthereum();

  await ensureEvmChain(currency);

  const [gasLimit, gasPrice] = await Promise.all([
    ethereum.request<string>({
      method: "eth_estimateGas",
      params: [{ from, to, value: valueHex }]
    }),
    ethereum.request<string>({ method: "eth_gasPrice" })
  ]);

  const estimatedFeeWei = BigInt(gasLimit) * BigInt(gasPrice);

  return { gasLimit, gasPrice, estimatedFeeWei };
}

export function formatWei(wei: bigint, decimals = 6): string {
  const whole = wei / WEI_PER_ETH;
  const rem = wei % WEI_PER_ETH;
  if (rem === 0n) return whole.toString();

  const scale = 10n ** BigInt(decimals);
  const fractional = (rem * scale) / WEI_PER_ETH;
  const fracStr = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

const AMOUNT_REGEX = /^\d+(\.\d+)?$/;

export function parseToWei(amount: string): string {
  const trimmed = amount.trim();
  if (!AMOUNT_REGEX.test(trimmed)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  const paddedFraction = fraction.padEnd(18, "0").slice(0, 18);
  const wei = BigInt(whole) * WEI_PER_ETH + BigInt(paddedFraction);
  return "0x" + wei.toString(16);
}

export async function sendEvmTransfer(
  to: string,
  amountWei: string,
  currency: EcencyWalletCurrency,
  expectedFrom?: string
): Promise<string> {
  const ethereum = getEthereum();

  await ensureEvmChain(currency);

  const accounts = await ethereum.request<string[]>({ method: "eth_requestAccounts" });
  const from = accounts[0];
  if (!from) throw new Error("No MetaMask account connected");

  // Funds safety: never send from an account other than the linked wallet. The
  // active MetaMask account can differ from the one the user linked (multiple
  // accounts, switched account, or access just granted to a different one). This
  // comparison is atomic with the account read above and is the single source of
  // truth for the EVM send. Throws a sentinel the caller maps to a message.
  if (expectedFrom && from.toLowerCase() !== expectedFrom.toLowerCase()) {
    throw new Error("ACCOUNT_MISMATCH");
  }

  const txHash = await ethereum.request<string>({
    method: "eth_sendTransaction",
    params: [{
      from,
      to,
      value: amountWei
    }]
  });

  return txHash;
}
