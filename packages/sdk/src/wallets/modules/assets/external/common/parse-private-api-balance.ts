export interface ExternalWalletBalance {
  chain: string;
  unit: string;
  raw?: unknown;
  nodeId?: string;
  /**
   * Balance represented as a BigInt for convenience.
   */
  balanceBigInt: bigint;
  /**
   * Balance returned as a string to preserve precision for UIs that cannot
   * handle bigint values directly.
   */
  balanceString: string;
}

export interface PrivateApiBalanceResponse {
  chain: string;
  balance: number | string;
  unit: string;
  raw?: unknown;
  nodeId?: string;
}

function normalizeBalance(balance: number | string): string {
  if (typeof balance === "number") {
    if (!Number.isFinite(balance)) {
      throw new Error("Private API returned a non-finite numeric balance");
    }

    return Math.trunc(balance).toString();
  }

  if (typeof balance === "string") {
    const trimmed = balance.trim();

    if (trimmed === "") {
      throw new Error("Private API returned an empty balance string");
    }

    return trimmed;
  }

  throw new Error("Private API returned balance in an unexpected format");
}

export function parsePrivateApiBalance(
  result: PrivateApiBalanceResponse,
  expectedChain: string
): ExternalWalletBalance {
  if (!result || typeof result !== "object") {
    throw new Error("Private API returned an unexpected response");
  }

  const { chain, balance, unit, raw, nodeId } = result;

  if (typeof chain !== "string" || chain !== expectedChain) {
    throw new Error("Private API response chain did not match request");
  }

  if (typeof unit !== "string" || unit.length === 0) {
    throw new Error("Private API response is missing unit information");
  }

  if (balance === undefined || balance === null) {
    throw new Error("Private API response is missing balance information");
  }

  const balanceString = normalizeBalance(balance);

  let balanceBigInt: bigint;

  try {
    balanceBigInt = BigInt(balanceString);
  } catch (error) {
    throw new Error("Private API returned a balance that is not an integer");
  }

  return {
    chain,
    unit,
    raw,
    nodeId:
      typeof nodeId === "string" && nodeId.length > 0 ? nodeId : undefined,
    balanceBigInt,
    balanceString,
  };
}
